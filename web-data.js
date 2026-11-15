(function(root){'use strict';
const manifest=root.CivicWebManifest,R=root.CivicDirectory,M=root.CivicOfflineData,E=root.CivicEngine;
const base=new URL('./',root.location.href);
const cacheName='civicpost-web:'+base.pathname+':'+manifest.release;
const pending=new Map(),jsonCache=new Map(),provinceCache=new Map(),contactFiles=new Set(),contacts=new Set(),routes=new Set(),districts=new Set(),scripts=new Map();
const cancelled=()=>Object.assign(new Error('Lookup cancelled.'),{code:'cancelled'});
function checkAbort(signal){if(signal?.aborted)throw cancelled();}
function waitFor(promise,signal){
  if(!signal)return promise;
  if(signal.aborted)return Promise.reject(cancelled());
  return new Promise((resolve,reject)=>{
    const stop=()=>reject(cancelled());signal.addEventListener('abort',stop,{once:true});
    promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',stop));
  });
}
function urlFor(file){
  if(!file||typeof file.path!=='string'||!file.sha256||!Number.isInteger(file.bytes))throw Error('Invalid website data description.');
  const url=new URL(file.path,base);
  if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname)||url.search||url.hash)throw Error('Invalid website data path.');
  return url.href;
}
async function verified(bytes,file){
  if(bytes.byteLength!==file.bytes)throw Error('The data download is incomplete. Reconnect and retry.');
  if(!root.crypto?.subtle)throw Error('Secure HTTPS is required to verify website data.');
  const hash=Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
  if(hash!==file.sha256)throw Error('The data does not match this website release. Close and reopen CivicPost, then retry.');
  return bytes;
}
async function bytesFor(file,{saveRequired=false}={}){
  const url=urlFor(file);let cache=null,hit=null;
  try{cache=await root.caches?.open(cacheName);hit=await cache?.match(url);}catch{}
  if(hit){try{return await verified(await hit.arrayBuffer(),file);}catch{await cache?.delete(url);}}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try{
    const response=await root.fetch(url,{credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal});
    if(!response.ok)throw Error('This region is not available on this device. Connect to the internet and retry.');
    const bytes=await verified(await response.arrayBuffer(),file);
    try{
      if(!cache)throw Error('Browser storage unavailable');
      await cache.put(url,new Response(bytes,{headers:{'Content-Type':file.path.endsWith('.js')?'text/javascript':'application/json'}}));
    }catch{if(saveRequired)throw Error('Your browser could not save this download. Free storage or allow site storage, then retry.');}
    return bytes;
  }catch(error){
    if(error.name==='AbortError')throw Error('The regional download timed out. Check your connection and retry.');
    throw error;
  }finally{clearTimeout(timer);}
}
async function read(file,{signal}={}){
  checkAbort(signal);
  if(jsonCache.has(file.path))return jsonCache.get(file.path);
  if(!pending.has(file.path)){
    const task=bytesFor(file).then(bytes=>JSON.parse(new TextDecoder().decode(bytes))).then(value=>{jsonCache.set(file.path,value);return value;});
    pending.set(file.path,task);task.then(()=>pending.delete(file.path),()=>pending.delete(file.path));
  }
  const result=await waitFor(pending.get(file.path),signal);checkAbort(signal);return result;
}
function ingest(value,file){
  if(contactFiles.has(file.path))return;
  if(!Array.isArray(value.contacts)||!Array.isArray(value.routes))throw Error('Invalid regional contact file.');
  for(const c of value.contacts)if(!contacts.has(c.id)){contacts.add(c.id);R.contacts.push(c);}
  for(const c of value.routes)if(!routes.has(c.id)){routes.add(c.id);R.routes.push(c);}
  for(const d of value.districts||[])if(!districts.has(d.id)){districts.add(d.id);M.districts.push(d);}
  contactFiles.add(file.path);
}
async function loadContacts(file){const value=await read(file);ingest(value,file);return value;}
async function province(code){
  if(!manifest.directory.provinces[code])return null;
  if(!provinceCache.has(code)){
    const task=Promise.all([loadContacts(manifest.directory.global),loadContacts(manifest.directory.provinces[code])]).then(([,index])=>index);
    provinceCache.set(code,task);task.catch(()=>provinceCache.delete(code));
  }
  return provinceCache.get(code);
}
const loadedIndexes=new Map();
async function region(code){const index=await province(code);if(index)loadedIndexes.set(code,index);return index;}
function cityFiles(index,city,code){
  if(!index)return [];
  const keys=[E.norm(city),E.cityKey(city,code)],out=new Map();
  for(const key of keys)for(const f of index.cities[key]?.files||[])out.set(f.path,f);
  return [...out.values()];
}
async function ensureLocation(s){
  if(!s.province)return;
  const index=await region(s.province);if(!index)return;
  const files=cityFiles(index,s.city,s.province);
  if(index.boards[s.schoolBoard])files.push(index.boards[s.schoolBoard]);
  await Promise.all(files.map(loadContacts));
  E.refreshDirectory();
}
function locationKey(s){return JSON.stringify([s.province||'',E.norm(s.city),s.schoolBoard||'']);}
const baseMunicipalities=E.municipalityNames,baseJurisdictions=E.jurisdictions;
E.municipalityNames=code=>[...new Set([...baseMunicipalities(code),...Object.values(loadedIndexes.get(code)?.cities||{}).map(x=>x.name)])].sort((a,b)=>a.localeCompare(b));
E.jurisdictions=(code,level)=>[...new Set([...baseJurisdictions(code,level),...(!level||level==='school'?Object.keys(loadedIndexes.get(code)?.boards||{}):[])])].sort((a,b)=>a.localeCompare(b));
async function pool(items,work,limit=3){
  let next=0;
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(next<items.length){const item=items[next++];await work(item);}}));
}
const completeDirectories=new Set();
async function loadDirectory(code){
  if(completeDirectories.has(code))return;
  const codes=code?[code]:Object.keys(manifest.directory.provinces);
  await pool(codes,async key=>{
    const index=await region(key);if(!index)return;
    const files=[...Object.values(index.boards),...Object.values(index.cities).flatMap(c=>c.files)];
    await pool([...new Map(files.map(f=>[f.path,f])).values()],loadContacts);
    completeDirectories.add(key);
  },2);
  completeDirectories.add(code);
  E.refreshDirectory();
}
async function lookup(value,{signal}={}){
  const postal=root.CivicPostal.normalize(value);
  if(!root.CivicPostal.valid(postal))throw Error('Enter a complete Canadian postal code.');
  checkAbort(signal);
  const letterFile=manifest.postal[postal[0]];if(!letterFile)return null;
  const index=await read(letterFile,{signal}),file=index[postal.slice(0,3)];if(!file)return null;
  const part=await read(file,{signal});checkAbort(signal);
  const row=part.rows?.[postal];if(!row)return null;
  // Keep every exact-code candidate and all original provenance/expiry fields.
  // A prefix chooses a file, never a representative or approximate substitute.
  const codes=[...new Set(row[0].map(i=>part.cities[i][0]))];
  await waitFor(Promise.all(codes.map(region)),signal);
  const locations=[...row[0].map(i=>part.cities[i]),...row[1].map(i=>part.districts[i]).filter(d=>d.city).map(d=>[d.province,d.city])];
  await waitFor(Promise.all(locations.map(([province,city])=>ensureLocation({province,city}))),signal);
  checkAbort(signal);
  const bytes=new TextEncoder().encode(JSON.stringify(part));
  // The shared decoder validates its input again; the original file integrity
  // was checked by read(). Use a matching descriptor for this in-memory buffer.
  const sha=Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
  const local=root.CivicOffline.create({metadata:{...M,cities:part.cities,districts:part.districts,files:{[postal[0]]:{...file,bytes:bytes.byteLength,sha256:sha}}},directory:R.contacts,
    fetchImpl:async()=>new Response(bytes),preferBundled:false,documentImpl:null});
  return local.lookup(postal,{signal});
}
const originalResolve=root.CivicOffline.resolve;
root.CivicOffline.lookup=lookup;
root.CivicOffline.resolve=(value,options={})=>originalResolve(value,{...options,localLookup:lookup});
async function script(name){
  if(scripts.has(name))return scripts.get(name);
  const file=manifest.assets[name];if(!file)throw Error('Unknown optional website feature.');
  const promise=new Promise((resolve,reject)=>{
    const el=root.document.createElement('script');el.src=urlFor(file);el.async=true;
    el.integrity='sha256-'+btoa(String.fromCharCode(...file.sha256.match(/../g).map(x=>parseInt(x,16))));
    const timer=setTimeout(()=>{el.remove();reject(Error('Feature download timed out. Reconnect and retry.'));},15000);
    el.onload=()=>{clearTimeout(timer);resolve();};el.onerror=()=>{clearTimeout(timer);el.remove();reject(Error('This feature is not saved on this browser. Connect and retry.'));};
    root.document.head.append(el);
  });
  scripts.set(name,promise);promise.catch(()=>scripts.delete(name));return promise;
}
async function download(code,{signal,onProgress=()=>{}}={}){
  if(!root.caches)throw Error('This browser does not support offline downloads.');
  const codes=code?[code]:Object.keys(manifest.packs),files=new Map();
  for(const p of codes){checkAbort(signal);const pack=manifest.packs[p];if(!pack)throw Error('Choose a province or territory.');
    const rows=await read(pack,{signal});await bytesFor(pack,{saveRequired:true});for(const f of rows)files.set(f.path,f);
  }
  let done=0,bytes=0;const total=[...files.values()].reduce((s,f)=>s+f.bytes,0);
  await pool([...files.values()],async file=>{checkAbort(signal);await bytesFor(file,{saveRequired:true});checkAbort(signal);done++;bytes+=file.bytes;onProgress({done,count:files.size,bytes,total});});
  return {files:done,bytes};
}
root.CivicWeb={manifest,cacheName,base,read,province:region,ensureLocation,locationKey,loadDirectory,completeDirectories,lookup,script,download};
})(globalThis);
