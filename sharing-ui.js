'use strict';
let pendingAppIntent='',sharedExport=null,sharedToken='',pendingImport=null,cameraStream=null,cameraTimer=null,shareGeneration=0,importGeneration=0;
const SH=CivicSharing;
function stopQRScanner(){clearTimeout(cameraTimer);cameraTimer=null;if(cameraStream)for(const track of cameraStream.getTracks())track.stop();cameraStream=null;}
async function loadQRTools(){
 const scripts=[];
 if(!window.qrcode)scripts.push(window.CivicWeb.script('vendor/qrcode.js'));
 if(!window.jsQR)scripts.push(window.CivicWeb.script('vendor/jsQR.js'));
 await Promise.all(scripts);
}
function drawQR(matrix,label){
 const modules=matrix.getModuleCount(),scale=Math.max(4,Math.floor(900/(modules+8)));
 const canvas=document.createElement('canvas');
 canvas.width=canvas.height=(modules+8)*scale;
 canvas.className='draft-qr';
 canvas.setAttribute('aria-label',label);
 canvas.setAttribute('role','img');
 const ctx=canvas.getContext('2d');
 ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
 ctx.fillStyle='#000';
 for(let row=0;row<modules;row++){
  for(let col=0;col<modules;col++){
   if(matrix.isDark(row,col))ctx.fillRect((col+4)*scale,(row+4)*scale,scale,scale);
  }
 }
 return canvas;
}
function qrCanvas(value,label){
 const tooLong='This message is too long for a reliable single QR code. Shorten the message or share the full CivicPost draft file.';
 if(value.length>2200)throw Error(tooLong);
 const preview=document.createElement('canvas');
 preview.width=preview.height=384;
 const ctx=preview.getContext('2d',{willReadFrequently:true});
 let version=0;
 for(let attempt=0;attempt<4 && version<=40;attempt++){
  const matrix=qrcode(version,'M');
  matrix.addData(value);
  try{matrix.make();}catch{throw Error(tooLong);}
  const canvas=drawQR(matrix,label);
  ctx.drawImage(canvas,0,0,preview.width,preview.height);
  const image=ctx.getImageData(0,0,preview.width,preview.height);
  if(jsQR(image.data,image.width,image.height,{inversionAttempts:'dontInvert'})?.data===value)return canvas;
  // The same payload can scan differently when its alignment patterns change.
  version=(matrix.getModuleCount()-17)/4+1;
 }
 throw Error('This QR could not be read at phone size. Shorten the message or share the full CivicPost draft file.');
}
function renderShareQR(value, label, filename, browserURL){
 const stage=$('#draft-qr-stage');
 const note=$('#qr-size-note');
 try{
  const canvas=qrCanvas(value,label);
  canvas.dataset.filename=filename;
  stage.append(canvas);
  const android=!!window.MoneySnapshotAndroid;
  note.textContent=android?'You can also share a screenshot with the full white border.':'Keep the white border when posting the QR image.';
  const offerBrowser=()=>{
   if(!android || !browserURL)return;
   const link=document.createElement('a');
   link.className='button secondary small';
   link.href=browserURL;
   link.textContent='Share QR image in browser';
   note.after(link);
  };
  // Prepare the PNG before the click so the share sheet retains user activation.
  canvas.toBlob(blob=>{
   if(!canvas.isConnected)return;
   if(!blob || typeof File==='undefined' || !navigator.share || !navigator.canShare){
    offerBrowser();return;
   }
   const file=new File([blob],filename,{type:'image/png'});
   const data={files:[file]};
   if(!navigator.canShare(data)){offerBrowser();return;}
   const share=document.createElement('button');
   share.type='button';share.className='button secondary small';share.textContent='Share QR image';
   note.after(share);
   share.onclick=async()=>{
    try{await navigator.share(data);}
    catch(error){
     if(error.name==='AbortError')return;
     note.textContent=android?'Image sharing is unavailable. Share a screenshot with the full white border.':'Image sharing is unavailable. Download the QR image and attach it to your post.';
    }
   };
  },'image/png');
 }catch(error){
  stage.textContent=error.message || 'This draft is too large for one QR code.';
  const download=stage.closest('#dialog-content')?.querySelector('[data-action="qr-image"]');
  if(download)download.disabled=true;
 }
}
async function showEmailQR(){
 stopQRScanner();
 importGeneration++;
 const generation=++shareGeneration;
 try{
  const message=String(state.body||'').replace(/\r\n|\r|\n/g,'\r\n');
  const mailto=E.mailto({...state,body:message});
  modal('<h2>Email QR</h2><p>Preparing the QR code…</p>');
  await loadQRTools();
  if(generation!==shareGeneration||!$('#dialog').open)return;
  modal(`<h2>Email QR</h2><p>Scan with a phone camera to open an email draft. Everyone gets the same recipients, subject and message. You can edit the email before sending.</p>
   <div id="draft-qr-stage" class="qr-stage"></div><p id="qr-size-note" class="small muted"></p>
   <div class="row">${!window.MoneySnapshotAndroid?button('Download email QR','qr-image','secondary small'):''}${button('CivicPost QR (opens draft)','share-draft','secondary small')}</div>`);
  renderShareQR(mailto,'QR code to open a prefilled email','CivicPost_Email_QR.png');
 }catch(error){
  if(generation===shareGeneration)toast(error.message);
 }
}
async function showShareDraft(){
 stopQRScanner();importGeneration++;const generation=++shareGeneration;
 try{sharedExport=SH.fromState(state);sharedToken='';modal(`<h2>Share this draft.</h2><p class="small">Preparing the QR code on your device…</p>`);sharedToken=await SH.encode(sharedExport);await loadQRTools();if(generation!==shareGeneration||!$('#dialog').open)return;
  modal(`<p class="section-kicker">SHARE A DRAFT</p><h2>CivicPost draft QR</h2><p>The QR code contains your selected recipients, subject and message. Anyone with it can read them. Remove personal details before sharing.</p><div id="draft-qr-stage" class="qr-stage"></div><p id="qr-size-note" class="small muted"></p><div class="row">${!window.MoneySnapshotAndroid?button('Download QR image','qr-image','secondary small'):''}${button('Copy share code','qr-copy','secondary small')}${button('Download draft file','qr-export','secondary small')}</div><p class="small muted">In CivicPost, choose <b>Import QR / draft</b> and select a QR image, paste the code, or open the draft file. A phone camera opens the public CivicPost draft preview. On Android you can also choose Open in CivicPost. Importing a QR image or code inside the app works offline.</p>`);
  renderShareQR(SH.link(sharedToken), 'CivicPost draft QR code', 'CivicPost_Draft_QR.png');
 }catch(e){toast(e.message);}
}
function downloadSharedFile(){if(!sharedExport)return;const text=JSON.stringify(sharedExport,null,2);if(window.MoneySnapshotAndroid?.postMessage){window.MoneySnapshotAndroid.postMessage(JSON.stringify({type:'save',filename:'money-snapshot-civicpost-draft.json',text}));return;}downloadBlob(new Blob([text],{type:'application/json'}),'CivicPost_Draft.json');}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function showImportDraft(){
 stopQRScanner();importGeneration++;pendingImport=null;pendingAppIntent='';modal(`<p class="section-kicker">OPEN A SHARED MESSAGE</p><h2>Import a QR code or draft.</h2><p>Importing shows a preview first. Your current letter stays in place until you choose to load the new draft.</p><div class="field"><label for="draft-file">Choose a QR image or a CivicPost draft file</label><input id="draft-file" type="file" accept="image/png,image/jpeg,image/webp,.json,.txt,application/json,text/plain"><small>QR images are read on this device. In Android, take a photo with your camera first, then choose it here.</small></div>${!window.MoneySnapshotAndroid&&navigator.mediaDevices?.getUserMedia?button('Scan with camera','qr-camera','secondary small'):''}<div id="qr-camera-stage"></div><div class="field"><label for="draft-code">Or paste a CivicPost share code / link</label><textarea id="draft-code" rows="3" maxlength="140000" placeholder="CP1… or a CivicPost draft link"></textarea></div>${button('Preview shared draft','qr-preview','small')}<p id="import-status" class="small" role="status"></p>`);
}
async function previewImported(input,generation=++importGeneration){
 try{const payload=await SH.decode(input);const appToken=await SH.encode(payload);if(generation!==importGeneration||!$('#dialog').open)return;stopQRScanner();pendingImport=payload;pendingAppIntent=SH.androidIntent(appToken);modal(`<p class="section-kicker">REVIEW BEFORE LOADING</p><h2>${esc(payload.subject)}</h2><p class="small">Location in shared draft: ${esc(payload.location.city)}, ${esc(payload.location.province)}. Confirm that this location and these offices are relevant to you.</p><ul class="import-recipients">${payload.recipients.map(c=>`<li><b>${c.mode==='cc'?'Cc':'To'}: ${esc(c.email)}</b><br>${esc(c.role)}${c.source?` · <a href="${esc(c.source)}" target="_blank" rel="noopener noreferrer">Check source ↗</a>`:''}</li>`).join('')}</ul><div class="field"><label for="import-preview-body">Message preview</label><textarea id="import-preview-body" rows="10" readonly>${esc(payload.body)}</textarea></div>${notes('A shared draft is not a verified or endorsed message. Loading replaces your current unsaved letter; it does not send email. Check the office addresses, wording and personal details.','amber')}${!window.MoneySnapshotAndroid&&/Android/i.test(navigator.userAgent)?`<div class="app-open-panel"><button class="button" data-action="qr-open-app">Open in CivicPost ↗</button><p class="small muted">Installed CivicPost 1.3 or later opens this same preview. If it is not installed, continue here. To open future scans directly: Android Settings → Apps → CivicPost → Open by default → enable supported links.</p></div>`:''}${button(window.MoneySnapshotAndroid?'Load this draft':'Load draft here','qr-load')}<button class="button secondary" data-action="import-draft">Choose another</button>`);
 }catch(e){if(generation!==importGeneration||!$('#dialog').open)return;const status=$('#import-status');if(status)status.textContent=e.message;else toast(e.message);}
}
function loadSharedDraft(){
 if(!pendingImport)return;const p=SH.validate(pendingImport);rememberLocation=false;cancelLocationSuggestion();clearLookup();state=Object.assign(initial(),p.location,{issue:p.issue,subject:p.subject,body:p.body,locationConfirmed:true});state.levels=[...new Set(p.recipients.map(c=>c.level))];
 for(let i=0;i<p.recipients.length;i++){const c=p.recipients[i],id='shared-'+i;state.custom.push({...c,id,province:state.province,city:state.city,kind:'shared',checked:'',note:'Imported from a shared draft. Verify the recipient on an official source before sending.'});state.selected.push(id);state.recipientModes[id]=c.mode;}
 state.draftContext=[state.province,state.city,state.ward,state.issue].join('|');pendingImport=null;$('#dialog').close();editor='edit';step=3;render();toast('Draft loaded. Review the recipients and message before sending.');
}
async function importDraftFile(file){
 if(!file)return;const generation=++importGeneration;const status=$('#import-status');if(status)status.textContent='Reading on your device…';
 try{if(/^image\/(png|jpeg|webp)$/.test(file.type)){
  await CivicWeb.script('vendor/jsQR.js');
  if(file.size>15*1024*1024)throw Error('Choose an image smaller than 15 MB.');
  const url=URL.createObjectURL(file),img=new Image();try{img.src=url;await img.decode();const factor=Math.min(1,2048/Math.max(img.naturalWidth,img.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.round(img.naturalWidth*factor);canvas.height=Math.round(img.naturalHeight*factor);if(!canvas.width||!canvas.height)throw Error('The image could not be read.');const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,canvas.width,canvas.height);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),code=jsQR(pixels.data,pixels.width,pixels.height,{inversionAttempts:'attemptBoth'});if(!code)throw Error('No readable QR code found. Try a sharper image with the full white border, or paste the share code.');await previewImported(code.data,generation);}finally{URL.revokeObjectURL(url);}
 }else{if(file.size>SH.MAX_BYTES)throw Error('This draft file is too large.');await previewImported(await file.text(),generation);}}catch(e){if(generation===importGeneration&&$('#dialog').open&&$('#import-status'))$('#import-status').textContent=e.message;}
}
async function startQRScanner(){
 if(!navigator.mediaDevices?.getUserMedia)return;stopQRScanner();const stage=$('#qr-camera-stage');if(!stage)return;stage.innerHTML='<video id="qr-camera" class="qr-camera" autoplay muted playsinline></video><p class="small">Point the camera at a CivicPost QR code.</p><button class="button secondary small" data-action="qr-stop">Stop camera</button>';
 try{await CivicWeb.script('vendor/jsQR.js');const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280}},audio:false});if(!$('#dialog').open||!$('#qr-camera')){for(const t of stream.getTracks())t.stop();return;}cameraStream=stream;const video=$('#qr-camera');video.srcObject=stream;await video.play();const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
  const scan=()=>{if(!cameraStream||!$('#dialog').open||!$('#qr-camera')){stopQRScanner();return;}if(video.readyState>=2&&video.videoWidth){const f=Math.min(1,1280/video.videoWidth);canvas.width=Math.round(video.videoWidth*f);canvas.height=Math.round(video.videoHeight*f);ctx.drawImage(video,0,0,canvas.width,canvas.height);const p=ctx.getImageData(0,0,canvas.width,canvas.height),code=jsQR(p.data,p.width,p.height,{inversionAttempts:'dontInvert'});if(code){stopQRScanner();previewImported(code.data);return;}}cameraTimer=setTimeout(scan,300);};scan();
 }catch{stopQRScanner();if($('#import-status'))$('#import-status').textContent='Camera access is unavailable or was declined. Choose a QR image instead.';}
}
document.addEventListener('change',e=>{if(e.target.id==='draft-file')importDraftFile(e.target.files?.[0]);});
document.addEventListener('click',e=>{const action=e.target.closest('button')?.dataset.action;if(action==='qr-open-app'&&pendingAppIntent){window.location.assign(pendingAppIntent);return;}if(action==='qr-copy'&&sharedToken)copyText(sharedToken);if(action==='qr-export')downloadSharedFile();if(action==='qr-image'){
 const canvas=$('#draft-qr-stage canvas');
 canvas?.toBlob(blob=>{if(blob)downloadBlob(blob,canvas.dataset.filename);});
}if(action==='qr-preview')previewImported($('#draft-code').value);if(action==='qr-load')loadSharedDraft();if(action==='qr-camera')startQRScanner();if(action==='qr-stop'){stopQRScanner();const stage=$('#qr-camera-stage');if(stage)stage.innerHTML='';}});
$('#dialog').addEventListener('close',()=>{if($('#dialog').open)return;stopQRScanner();shareGeneration++;importGeneration++;});document.addEventListener('visibilitychange',()=>{if(document.hidden)stopQRScanner();});
function openSharedFragment(){
 if(!location.hash.startsWith('#draft='))return;
 const token=location.hash.slice(7);
 try{history.replaceState(null,'',location.pathname+location.search);}catch{}
 showImportDraft();previewImported(token);
}
window.addEventListener('hashchange',openSharedFragment);
openSharedFragment();
