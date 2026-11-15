'use strict';
/* Protected website UI. The letter and identity fields never enter API payloads. */
const web=CivicWeb,webReady=new Map(),webLoading=new Set(),webErrors=new Map();
const renderCore=render;
// School leadership can rank below the three suggested offices. Keep it
// discoverable for the explicitly chosen board without promoting specialist
// roles or inferring a school authority from the postal community.
const contactGroupsCore=flowContactGroups;
flowContactGroups=function(){
  const groups=contactGroupsCore();
  const school=state.levels.includes('school')&&state.schoolBoard?
    [...groups.main,...groups.additional].filter(c=>c.level==='school'&&c.jurisdiction===state.schoolBoard):[];
  return {...groups,school};
};
function webCurrentKey(){return web.locationKey(state);}
function webNeedsData(){return !!state.province&&(Date.now()-(webReady.get(webCurrentKey())||0)>300000||state.city&&state.issue&&state.levels.length&&!web.lookupInfo(state));}
function webEnsure(){
  const key=webCurrentKey();if(!webNeedsData()||webLoading.has(key)||webErrors.has(key))return;
  const snapshot={...state,levels:[...state.levels],directoryAdded:[...state.directoryAdded]};
  webLoading.add(key);
  web.ensureLocation(snapshot).then(()=>{webReady.set(key,Date.now());webErrors.delete(key);},error=>webErrors.set(key,error.message)).finally(()=>{
    webLoading.delete(key);if(key===webCurrentKey())render();
  });
}
render=function(){
  webEnsure();renderCore();
  const busy=webNeedsData(),error=webErrors.get(webCurrentKey());
  $('#panel').classList.toggle('web-loading',busy&&!error);
  if(busy){
    const notice=document.createElement('div');notice.className='web-data-note';notice.setAttribute('role','status');
    notice.innerHTML=error?`<p>${esc(error)}</p><button class="button secondary small" data-web="retry-location">Retry contact lookup</button>`:'<p>Loading your location and office choices…</p>';
    $('#panel').prepend(notice);
    // Errors leave navigation/finder links available. Sending waits for a fresh
    // successful lookup so an empty or stale response never appears complete.
    if(!error)$('#panel').querySelectorAll('input,select,textarea,.flow-forward button').forEach(el=>el.disabled=true);
    const send=$('#send-link');if(send){send.setAttribute('aria-disabled','true');send.dataset.ready='false';}
  }
  const info=web.lookupInfo(state);
  if(!busy&&step===2&&['recipients','recipients-done'].includes(flow.view)&&state.levels.includes('school')&&state.schoolBoard){
    const school=flowContactGroups().school;
    const choice=document.createElement('div');choice.className='web-school-choice';
    choice.innerHTML=school.length?
      `<button class="button secondary small" data-web="school-contacts" aria-pressed="${flow.group==='school'&&flow.view==='recipients'}">School contacts · ${school.length}</button><span>${esc(state.schoolBoard)}</span>`:
      `<span>No matching school email loaded for ${esc(state.schoolBoard)} and this issue.${info?.nextOffset!=null?' Load more relevant offices below.':' Try the office directory or review your board and issue.'}</span>`;
    const coverage=$('#recipient-coverage');if(coverage)coverage.after(choice);else $('#panel .flow-content')?.prepend(choice);
  }
  if(!busy&&step===2&&info?.nextOffset!=null){
    const more=document.createElement('div');more.className='web-data-note';more.innerHTML=`<p>${info.results.length} of ${info.total} relevant office entries loaded.</p><button class="button secondary small" data-web="more-contacts">Load more relevant offices</button>`;($('#panel .flow-content')||$('#panel')).append(more);
  }else if(!busy&&step===2&&info?.refineRequired){const note=document.createElement('p');note.className='web-data-note';note.textContent='More entries match. Use the office directory to narrow your search.';($('#panel .flow-content')||$('#panel')).append(note);}
};
document.addEventListener('click',event=>{
  const target=event.target.closest('button,a');if(!target)return;
  if(target.dataset.web==='retry-location'){webErrors.delete(webCurrentKey());webReady.delete(webCurrentKey());render();return;}
  if(webNeedsData()&&(target.id==='send-link'||['share-draft','download','copy-recipients'].includes(target.dataset.action))){event.preventDefault();event.stopImmediatePropagation();toast('Reconnect and refresh the office contacts before sending or sharing.');}
},true);
const directoryRenderCore=renderDirectoryResults;
let searchTimer=null,searchController=null,searchSequence=0;
renderDirectoryResults=function(){
  clearTimeout(searchTimer);searchController?.abort();const sequence=++searchSequence;
  const area=$('#directory-results');if(!area)return;
  const f={...directoryUI,levels:directoryUI.mode==='choose'?[...state.levels]:undefined,issue:directoryUI.mode==='choose'?state.issue:undefined};
  if(!f.province||E.norm(f.query).length<3&&!f.jurisdiction){area.innerHTML='<p>Choose a province and enter at least three search characters, or choose an organization. Contacts load in small pages.</p>';return;}
  area.innerHTML='<p role="status">Searching public offices…</p>';
  searchTimer=setTimeout(async()=>{
    searchController=new AbortController();
    try{
      const result=await web.searchContacts(f,{signal:searchController.signal});
      if(sequence!==searchSequence||!$('#dialog').open||!$('#directory-results'))return;
      const original=E.directorySearch;E.directorySearch=()=>result;
      try{directoryRenderCore();}finally{E.directorySearch=original;}
      if(result.refineRequired){$('#directory-results').insertAdjacentHTML('beforeend','<p>Refine your search to see further matches.</p>');$('#directory-results [data-directory-page="1"]').disabled=true;}
    }catch(error){if(sequence===searchSequence&&$('#directory-results'))$('#directory-results').innerHTML=`<p role="status">${esc(error.message)}</p><button class="button secondary small" data-web="retry-search">Retry search</button>`;}
  },350);
};
const originalOffline=offlineCoverage;
document.addEventListener('change',event=>{
  if(event.target.id!=='directory-province')return;
  const code=directoryUI.province;if(!code)return;
  web.province(code).then(()=>{if($('#dialog').open&&$('#directory-results')&&directoryUI.province===code)directoryModal();}).catch(error=>toast(error.message));
});
offlineCoverage=function(){originalOffline();$('#dialog-content').insertAdjacentHTML('afterbegin','<p class="web-data-note">Geographic files can be cached. Contact searches require an internet connection; the full directory is not downloaded.</p>');};
const originalMenu=flowMenu;
flowMenu=function(){originalMenu();$('#dialog-content .choice-stack').insertAdjacentHTML('beforeend','<button class="button secondary" data-web="offline">Offline availability</button>');};
document.addEventListener('click',async event=>{
  const action=event.target.closest('[data-web]')?.dataset.web;
  if(action==='school-contacts'){
    if(webNeedsData()||!flowContactGroups().school.length)return;
    flow.group='school';flowMove('recipients');
  }
  if(action==='retry-search')renderDirectoryResults();
  if(action==='more-contacts'){
    const button=event.target.closest('button');button.disabled=true;
    try{await web.moreContacts({...state,levels:[...state.levels],directoryAdded:[...state.directoryAdded]});render();}
    catch(error){toast(error.message);button.disabled=false;}
  }
  if(action==='offline')modal('<h2>Offline availability</h2><p>The app shell and geographic areas you have opened may remain available offline. You can keep writing a letter.</p><p>Finding or refreshing office contacts requires the internet. The complete contact directory is not downloaded. Contacts already open in this tab stay in memory; explicitly saved drafts and exported files may retain chosen contacts.</p><p>Reconnect and review current contacts before sending. Browser storage can be cleared or evicted.</p>');
});
$('#dialog').addEventListener('close',()=>{
  // close events are queued: an older dialog can finish closing after a new
  // directory has already opened. Do not cancel that new search.
  if($('#dialog').open)return;
  clearTimeout(searchTimer);searchController?.abort();searchSequence++;
});
render();
