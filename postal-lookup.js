(function(root){'use strict';
const ENDPOINT='https://represent.opennorth.ca/postcodes/';
const CACHE_KEY='civicpost-postal-lookup-v1',MAX_BYTES=1000000,MAX_AGE=30*24*60*60*1000;
function normalize(value){return String(value||'').toUpperCase().replace(/[\s-]/g,'');}
function valid(value){return /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\d[ABCEGHJ-NPRSTV-Z]\d$/.test(normalize(value));}
function failure(code,message){const e=new Error(message);e.code=code;return e;}
function validate(data,postal){
 if(!data||typeof data!=='object'||Array.isArray(data))throw failure('invalid-response','The lookup service returned an unreadable response.');
 if(normalize(data.code)!==postal)throw failure('invalid-response','The lookup service returned a different postal code. Nothing was applied.');
 if(!Array.isArray(data.representatives_centroid)||!Array.isArray(data.representatives_concordance))throw failure('invalid-response','The lookup service did not return its expected representative data.');
 if(data.representatives_centroid.length+data.representatives_concordance.length>1000)throw failure('invalid-response','The lookup service returned too many matches. Use its website to check this code.');
 return data;
}
function url(value,browser=false){if(!valid(value))throw failure('invalid-postal','Enter a complete Canadian postal code, such as T5K 1E7.');return ENDPOINT+normalize(value)+'/'+(browser?'?format=apibrowser':'');}
async function readJSON(response,signal){
 const length=Number(response.headers?.get('content-length'));if(length>MAX_BYTES)throw failure('invalid-response','The lookup response is too large.');
 let text;
 if(response.body?.getReader){
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{for(;;){if(signal.aborted)throw failure('cancelled','Lookup cancelled.');const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES){await reader.cancel();throw failure('invalid-response','The lookup response is too large.');}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let pos=0;for(const chunk of chunks){bytes.set(chunk,pos);pos+=chunk.byteLength;}text=new TextDecoder().decode(bytes);
 }else{text=await response.text();if(new TextEncoder().encode(text).length>MAX_BYTES)throw failure('invalid-response','The lookup response is too large.');}
 try{return JSON.parse(text);}catch{throw failure('invalid-response','The lookup service returned a page instead of representative data. Try its website below.');}
}
async function lookup(value,{signal,fetchImpl=root.fetch?.bind(root),timeoutMs=15000}={}){
 const postal=normalize(value),endpoint=url(postal);if(!fetchImpl)throw failure('unsupported','Update Android System WebView or use your browser for this lookup.');
 const controller=new AbortController();let timedOut=false;
 const cancel=()=>controller.abort();if(signal?.aborted)throw failure('cancelled','Lookup cancelled.');signal?.addEventListener('abort',cancel,{once:true});
 const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
 try{
  const response=await fetchImpl(endpoint,{method:'GET',mode:'cors',credentials:'omit',referrerPolicy:'no-referrer',headers:{Accept:'application/json'},signal:controller.signal});
  if(response.status===404)throw failure('not-found','Open North has no record for this postal code. Check the code, then use the official finders below.');
  if(response.status===429||response.status===503)throw failure('busy','The lookup service is busy or temporarily unavailable. Wait a minute before trying again.');
  if(!response.ok)throw failure('http','The lookup service returned an error ('+response.status+'). Try its website below.');
  const data=validate(await readJSON(response,controller.signal),postal);
  return {postal,data,fetchedAt:new Date().toISOString()};
 }catch(e){
  if(signal?.aborted)throw failure('cancelled','Lookup cancelled.');
  if(timedOut)throw failure('timeout','The lookup service did not respond in time. Try again or open the same lookup below.');
  if(e.code)throw e;
  throw failure('network','Could not reach Open North from this app or browser. Check your connection, or open the same lookup below.');
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}
function save(result,storage=root.localStorage){
 // Save the live part only. Downloaded rows retain their own dates and validity
 // and are rejoined from the installed database when this cache is restored.
 if(result.source==='bundled')throw failure('invalid-cache','Downloaded lookups are already installed; no extra save is needed.');
 result=result.apiResult||result;
 const postal=normalize(result.postal);if(!valid(postal))throw failure('invalid-cache','The saved postal code is invalid.');validate(result.data,postal);
 if(!Number.isFinite(Date.parse(result.fetchedAt)))throw failure('invalid-cache','The lookup date is invalid.');
 const text=JSON.stringify({version:1,postal,data:result.data,fetchedAt:result.fetchedAt});
 if(new TextEncoder().encode(text).length>MAX_BYTES)throw failure('invalid-cache','This lookup is too large to save.');
 storage.setItem(CACHE_KEY,text);
}
function saved(value,storage,now=Date.now()){
 try{storage=storage||root.localStorage;const text=storage.getItem(CACHE_KEY);if(!text||text.length>MAX_BYTES)return null;const r=JSON.parse(text),age=now-Date.parse(r.fetchedAt);if(!Number.isFinite(age)||age<0||age>MAX_AGE){storage.removeItem(CACHE_KEY);return null;}if(r.version!==1||r.postal!==normalize(value)||!valid(r.postal))return null;validate(r.data,r.postal);return r;}catch{return null;}
}
function remove(storage=root.localStorage){storage.removeItem(CACHE_KEY);}
const api={lookup,normalize,valid,url,validate,save,saved,remove,MAX_AGE,MAX_BYTES};
if(typeof module!=='undefined')module.exports=api;root.CivicPostal=api;
})(typeof globalThis!=='undefined'?globalThis:this);
