(function(root){'use strict';
const E=typeof module!=='undefined'?require('./engine.js'):root.CivicEngine;
const D=typeof module!=='undefined'?require('./data.js'):root.CivicData;
const PUBLIC_URL=new URL('./',root.location.href).href;
const LEGACY_URL='https://civicpost-canada.ovalpear2.chatgpt.site/';
const MAX_BYTES=100000,MAX_TEXT=18000,MAX_RECIPIENTS=100;
const text=(v,max,label)=>{if(typeof v!=='string'||v.length>max)throw Error('Invalid or oversized '+label+'.');return v;};
function validate(raw){
 if(!raw||raw.format!=='civicpost-draft'||raw.version!==1)throw Error('This is not a supported CivicPost draft.');
 const loc=raw.location;if(!loc||!D.provinces.some(p=>p.code===loc.province))throw Error('The draft needs a Canadian province or territory.');
 const location={province:loc.province};for(const k of ['city','municipality','ward','provRiding','fedRiding','schoolBoard'])location[k]=text(loc[k]||'',k==='schoolBoard'?240:180,'location');
 if(!location.city.trim())throw Error('The draft needs a city or community.');
 const subject=text(raw.subject,500,'subject').replace(/[\r\n]+/g,' '),body=text(raw.body,MAX_TEXT,'message');
 if(!subject.trim()||!body.trim())throw Error('Add a subject and message before sharing.');
 const issue=D.issues.some(i=>i.id===raw.issue)?raw.issue:'other';
 if(!Array.isArray(raw.recipients)||!raw.recipients.length||raw.recipients.length>MAX_RECIPIENTS)throw Error('Choose between 1 and 100 recipients before sharing.');
 const seen=new Set(),recipients=[];
 for(const c of raw.recipients){
  if(!c||!E.emailValid(c.email)||!['municipal','school','provincial','federal','community'].includes(c.level)||!['to','cc'].includes(c.mode))throw Error('The draft contains an invalid recipient.');
  if(seen.has(c.email.toLowerCase()))continue;seen.add(c.email.toLowerCase());
  recipients.push({email:c.email,role:text(c.role,240,'office name'),level:c.level,mode:c.mode,source:E.safeURL(c.source),jurisdiction:text(c.jurisdiction||'',300,'organization')});
 }
 if(!recipients.some(c=>c.mode==='to'))throw Error('Choose at least one To recipient.');
 return {format:'civicpost-draft',version:1,location,issue,subject,body,recipients};
}
function fromState(s){return validate({format:'civicpost-draft',version:1,location:{province:s.province,city:s.city,municipality:s.municipality,ward:s.ward,provRiding:s.provRiding,fedRiding:s.fedRiding,schoolBoard:s.schoolBoard},issue:s.issue,subject:s.subject,body:s.body,recipients:E.selectedContacts(s).map(c=>({email:c.email,role:c.role,level:c.level,mode:s.recipientModes[c.id]==='cc'?'cc':'to',source:c.source,jurisdiction:c.jurisdiction||''}))});}
function base64url(bytes){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function unbase64(s){if(!/^[A-Za-z0-9_-]+$/.test(s)||s.length>140000)throw Error('Invalid or oversized share code.');try{return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}catch{throw Error('Invalid share code.');}}
async function transform(bytes,type){
 const stream=new Blob([bytes]).stream().pipeThrough(type);const reader=stream.getReader();const chunks=[];let total=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>MAX_BYTES){await reader.cancel();throw Error('This draft is too large.');}chunks.push(value);}}finally{reader.releaseLock();}
 const out=new Uint8Array(total);let offset=0;for(const c of chunks){out.set(c,offset);offset+=c.length;}return out;
}
async function encode(payload){
 const bytes=new TextEncoder().encode(JSON.stringify(validate(payload)));if(bytes.length>MAX_BYTES)throw Error('This draft is too large.');
 if(typeof CompressionStream!=='undefined'){const z=await transform(bytes,new CompressionStream('deflate'));return 'CP1Z.'+base64url(z);}
 return 'CP1J.'+base64url(bytes);
}
function isDraftAddress(url){
 if(url.username || url.password || url.search) return false;
 const site=new URL(PUBLIC_URL);
 return (url.origin===site.origin && [site.pathname,new URL('index.html',site).pathname].includes(url.pathname))
    || (url.origin+url.pathname===LEGACY_URL);
}
async function decode(input){
 let s=String(input||'').trim();if(s.length>140000)throw Error('This draft is too large.');
 if(s.startsWith('{')){try{return validate(JSON.parse(s));}catch(e){throw Error(e.message||'Invalid draft file.');}}
 if(/^https?:\/\//.test(s)){let u;try{u=new URL(s);}catch{throw Error('Invalid draft link.');}if(!isDraftAddress(u))throw Error('This is not a CivicPost draft link.');s=new URLSearchParams(u.hash.slice(1)).get('draft')||'';}
 const m=/^CP1([ZJ])\.([A-Za-z0-9_-]+)$/.exec(s);if(!m)throw Error('This QR code does not contain a CivicPost draft.');
 let bytes=unbase64(m[2]);if(m[1]==='Z'){if(typeof DecompressionStream==='undefined')throw Error('Update Android System WebView or your browser, or import the JSON draft file.');bytes=await transform(bytes,new DecompressionStream('deflate'));}
 if(bytes.length>MAX_BYTES)throw Error('This draft is too large.');let raw;try{raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw Error('The draft could not be read. It may be damaged.');}return validate(raw);
}
function checkedToken(token){if(typeof token!=='string'||token.trim()!==token||!/^CP1[ZJ]\.[A-Za-z0-9_-]{1,139000}$/.test(token))throw Error('Invalid or oversized share code.');return token;}
function link(token){return PUBLIC_URL+'#draft='+checkedToken(token);}
function androidIntent(token){
 checkedToken(token);
 // Chrome reads the final #Intent block; the earlier fragment is the draft.
 // Pin the recipient package. A missing app returns to this same web preview.
 return 'intent://draft/#draft='+token+'#Intent;scheme=civicpost;package=ca.civicpost.app;S.browser_fallback_url='+encodeURIComponent(link(token))+';end';
}
const api={validate,fromState,encode,decode,link,androidIntent,checkedToken,PUBLIC_URL,MAX_BYTES};if(typeof module!=='undefined')module.exports=api;root.CivicSharing=api;
})(typeof globalThis!=='undefined'?globalThis:this);
