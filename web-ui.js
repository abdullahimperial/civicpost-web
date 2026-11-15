'use strict';
/* Web-only UI integration. Shared routing, explicit recipients and draft review
   remain authoritative; loading data must never choose an office for the user. */
const web=CivicWeb,webReady=new Set(),webLoading=new Set(),webErrors=new Map();
const renderCore=render;
function webCurrentKey(){return web.locationKey(state);}
function webNeedsData(){return !!state.province&&!webReady.has(webCurrentKey());}
function webEnsure(){
  const key=webCurrentKey();if(!state.province||webReady.has(key)||webLoading.has(key)||webErrors.has(key))return;
  const snapshot={province:state.province,city:state.city,schoolBoard:state.schoolBoard};webLoading.add(key);
  web.ensureLocation(snapshot).then(()=>{webReady.add(key);webErrors.delete(key);},error=>webErrors.set(key,error.message)).finally(()=>{
    webLoading.delete(key);if(key===webCurrentKey())render();
  });
}
render=function(){
  webEnsure();renderCore();
  const busy=webNeedsData();$('#panel').classList.toggle('web-loading',busy);
  if(!busy)return;
  const notice=document.createElement('div');notice.className='web-data-note';notice.setAttribute('role','status');
  const error=webErrors.get(webCurrentKey());notice.innerHTML=error?`<p>${esc(error)}</p><button class="button secondary small" data-web="retry-location">Retry regional download</button>`:'<p>Loading contacts for your region…</p>';
  $('#panel').prepend(notice);
  // Keep navigation backwards available; do not silently render missing records
  // as an empty directory, or let a restored draft send before its IDs resolve.
  $('#panel').querySelectorAll('input,select,textarea,.flow-forward button,#send-link').forEach(el=>{
    if(el.tagName==='A'){el.setAttribute('aria-disabled','true');el.dataset.ready='false';}else el.disabled=true;
  });
};
document.addEventListener('click',event=>{
  const target=event.target.closest('button,a');if(!target)return;
  if(target.dataset.web==='retry-location'){webErrors.delete(webCurrentKey());render();return;}
  if(webNeedsData()&&(target.id==='send-link'||target.dataset.step>0||['share-draft','download','copy-recipients'].includes(target.dataset.action))){event.preventDefault();event.stopImmediatePropagation();toast('Wait for the regional data, or retry its download.');}
},true);
// Retry only by explicit action; a failing connection must not cause a render loop.
const directoryRenderCore=renderDirectoryResults,directoryModalCore=directoryModal;
const directoryPending=new Set(),directoryErrors=new Map();
function ensureDirectory(code){
  if(directoryPending.has(code)||directoryErrors.has(code))return;
  directoryPending.add(code);
  web.loadDirectory(code).catch(e=>directoryErrors.set(code,e.message)).finally(()=>{
    directoryPending.delete(code);if($('#directory-results')&&directoryUI.province===code)directoryModalCore();
  });
}
renderDirectoryResults=function(){
  const area=$('#directory-results');if(!area)return;
  const code=directoryUI.province;
  if(web.completeDirectories.has(code)){directoryRenderCore();return;}
  if(!code&&!directoryPending.has('')&&!directoryErrors.has('')){
    area.innerHTML='<p>Choose a province above, or download the complete directory to search across Canada.</p><button class="button secondary small" data-web="national-directory">Load all Canada contacts</button>';return;
  }
  const error=directoryErrors.get(code);
  area.innerHTML=error?`<p role="status">${esc(error)}</p><button class="button secondary small" data-web="retry-directory">Retry directory download</button>`:'<p role="status">Loading the selected directory…</p>';
  if(!error)ensureDirectory(code);
};
const originalCoverage=offlineCoverage;
offlineCoverage=function(){originalCoverage();$('#dialog-content').insertAdjacentHTML('afterbegin','<p class="web-data-note">The website loads data as needed. Only previously cached areas work offline. <button class="button secondary small" data-web="offline">Manage offline downloads</button></p>');};
const originalMenu=flowMenu;
flowMenu=function(){originalMenu();$('#dialog-content .choice-stack').insertAdjacentHTML('beforeend','<button class="button secondary" data-web="offline">Offline downloads</button>');};
let webDownloadController=null;
function webOffline(){
  const packs=web.manifest.packs;
  modal(`<h2>Offline downloads</h2><p>The website starts small. Regions you use are cached when your browser allows storage. Download a complete province or territory before travelling offline.</p><div class="field"><label for="web-region">Province or territory</label><select id="web-region">${D.provinces.map(p=>`<option value="${p.code}" ${state.province===p.code?'selected':''}>${esc(p.name)} · about ${(packs[p.code].downloadBytes/1000000).toFixed(1)} MB</option>`).join('')}</select></div><div class="web-download-actions"><button class="button" data-web="download-region">Download selected region</button><button class="button secondary" data-web="download-canada">Download all Canada · up to ${(Object.values(packs).reduce((s,p)=>s+p.downloadBytes,0)/1000000).toFixed(1)} MB</button></div><p class="web-progress" id="web-progress" role="status"></p><p class="small">Sizes are uncompressed estimates. Downloads contain public directory and postal data, not your saved drafts. Browser storage can be cleared or evicted; reopening online after an update may require a new regional download. Cross-border postal candidates can need a neighbouring region too. Confirm boundaries and officeholders on official sources.</p><button class="button secondary small" data-web="clear-downloads">Remove cached regional downloads</button>`);
}
async function webDownload(code){
  if(webDownloadController)return;webDownloadController=new AbortController();
  const status=()=>$('#web-progress');if(status())status().textContent='Preparing download…';
  $('#dialog-content').querySelectorAll('[data-web^="download-"]').forEach(b=>b.disabled=true);
  try{
    // Ensure the small application shell is ready as well as the data files.
    if(!navigator.serviceWorker)throw Error('Offline reopening is not supported by this browser.');
    const ready=await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('Offline setup is not ready. Reopen the site online and retry.')),15000))]);
    if(!ready.active)throw Error('Offline setup is not ready.');
    const result=await web.download(code,{signal:webDownloadController.signal,onProgress:p=>{if(status())status().textContent=`Saved ${p.done} of ${p.count} files · ${(p.bytes/1000000).toFixed(1)} of ${(p.total/1000000).toFixed(1)} MB`;}});
    if(status())status().textContent=`Download complete: ${result.files} files saved. Cached coverage can be removed by your browser. Try reopening in airplane mode before relying on it.`;
  }catch(e){if(status())status().textContent=e.code==='cancelled'?'Download stopped. Completed files remain cached.':e.message;}
  finally{webDownloadController=null;$('#dialog-content').querySelectorAll('[data-web^="download-"]').forEach(b=>b.disabled=false);}
}
document.addEventListener('click',async event=>{
  const action=event.target.closest('[data-web]')?.dataset.web;if(!action)return;
  if(action==='national-directory'){directoryErrors.delete('');ensureDirectory('');renderDirectoryResults();}
  if(action==='retry-directory'){directoryErrors.delete(directoryUI.province);ensureDirectory(directoryUI.province);renderDirectoryResults();}
  if(action==='offline')webOffline();
  if(action==='download-region')webDownload($('#web-region').value);
  if(action==='download-canada')webDownload('');
  if(action==='clear-downloads'){
    try{
      webDownloadController?.abort();
      const cache=await caches.open(web.cacheName),prefix=new URL('data/',web.base).href;
      for(const request of await cache.keys())if(request.url.startsWith(prefix))await cache.delete(request);
      $('#web-progress').textContent='Cached regional files removed. Data already open in this tab stays in memory until you close it. Saved drafts were kept.';
    }catch{$('#web-progress').textContent='Could not remove cached files. Use your browser’s site storage settings.';}
  }
});
$('#dialog').addEventListener('close',()=>{if(!$('#dialog').open)webDownloadController?.abort();});
render();
