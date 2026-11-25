(function(root){'use strict';
const P=typeof module!=='undefined'?require('./postal-lookup.js'):root.CivicPostal;
const E=typeof module!=='undefined'?require('./engine.js'):root.CivicEngine;
const D=typeof module!=='undefined'?require('./data.js'):root.CivicData;
const R=typeof module!=='undefined'?require('./directory-data.js'):root.CivicDirectory;
const M=typeof module!=='undefined'?require('./offline-metadata.js'):root.CivicOfflineData;
// Reviewed upstream coordinate errors, not a blanket locality-name mismatch rule.
// Evidence: data/coverage-routing-2026-11-16/postal-source-evidence.json (CP-001).
// Remove a hold only after corrected source points/districts are independently checked.
const coordinateHolds={K7P0P6:'Kingston',L1V0E9:'Pickering',L2V0J7:'Thorold'};
function applyCoordinateHold(result){
 const postal=P.normalize(result.postal||result.data?.code||''),locality=coordinateHolds[postal];
 if(!locality)return result;
 return {...result,recordSources:[],data:{...result.data,city:locality,representatives_centroid:[],representatives_concordance:[]},
  offline:{...result.offline,coordinateReview:{locality,mappedMunicipality:'Toronto',reviewed:'2026-11-16'},availableLevels:[]}};
}
const abort=()=>{const e=new Error('Lookup cancelled.');e.code='cancelled';return e;};
const bundleWaiters=new Map();
function registerBundle(letter,data){for(const slot of bundleWaiters.get(letter)||[])slot.data=data;}
function readBundle(letter,file,{signal,documentImpl=root.document,timeoutMs=8000}={}){
 return new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(abort());return;}
  // These fixed paths are release assets. Never execute API responses or supplied URLs.
  if(!documentImpl||!file.script||file.script.path!=='offline-postal/'+letter+'.js'||!/^sha256-[A-Za-z0-9+/]{43}=$/.test(file.script.integrity)){reject(new Error('The installed postal database assets are unavailable.'));return;}
  const script=documentImpl.createElement('script'),slot={data:null};
  if(!bundleWaiters.has(letter))bundleWaiters.set(letter,new Set());bundleWaiters.get(letter).add(slot);
  let settled=false;
  const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);script.onload=null;script.onerror=null;script.remove();const slots=bundleWaiters.get(letter);slots?.delete(slot);if(!slots?.size)bundleWaiters.delete(letter);error?reject(error):resolve(slot.data);};
  const cancel=()=>finish(abort());
  const timer=setTimeout(()=>finish(new Error('The installed postal database did not finish loading. Reopen or update CivicPost.')),timeoutMs);
  script.async=true;script.src='./'+file.script.path;script.integrity=file.script.integrity;
  script.onload=()=>finish(slot.data?null:new Error('The installed postal database did not register its data.'));
  script.onerror=()=>finish(new Error('The installed postal database asset could not be loaded. Update CivicPost and try again.'));
  signal?.addEventListener('abort',cancel,{once:true});
  try{documentImpl.head.appendChild(script);}catch(e){finish(e);}
 });
}
function create({metadata=M,fetchImpl=root.fetch?.bind(root),directory=R.contacts,cryptoImpl=root.crypto,documentImpl=root.document,preferBundled=root.location?.hostname==='appassets.androidplatform.net'}={}){
 const cache=new Map();
 async function readJSON(file,signal){
  if(!fetchImpl)throw new Error('This device cannot read postal JSON files.');
  const response=await fetchImpl('./'+file.path,{credentials:'omit',signal});if(!response.ok)throw new Error('The downloaded postal database could not be read.');
  const bytes=await response.arrayBuffer();if(bytes.byteLength!==file.bytes)throw new Error('The downloaded postal database is incomplete.');
  if(cryptoImpl?.subtle){const hash=Array.from(new Uint8Array(await cryptoImpl.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');if(hash!==file.sha256)throw new Error('The downloaded postal database failed its integrity check.');}
  return JSON.parse(new TextDecoder().decode(bytes));
 }
 async function lookup(value,{signal}={}){
  const postal=P.normalize(value);if(!P.valid(postal))throw new Error('Enter a complete Canadian postal code.');
  if(signal?.aborted)throw abort();const file=metadata.files[postal[0]];if(!file)return null;
  let rows=cache.get(postal[0]);
  if(!rows){
   const scriptRead=()=>readBundle(postal[0],file,{signal,documentImpl}),jsonRead=()=>readJSON(file,signal);
   let data;
   try{data=await (preferBundled?scriptRead():jsonRead());}
   catch(first){if(signal?.aborted||first.code==='cancelled')throw abort();try{data=await (preferBundled?jsonRead():documentImpl&&file.script?scriptRead():Promise.reject(first));}catch(second){if(signal?.aborted||second.code==='cancelled')throw abort();const e=new Error('Could not read the installed postal database. '+second.message);e.code='database-unavailable';throw e;}}
   if(data.version!==metadata.version||!data.rows||Array.isArray(data.rows))throw new Error('The postal database version does not match this app.');
   rows=data.rows;cache.set(postal[0],rows);if(cache.size>2)cache.delete(cache.keys().next().value);
  }
  if(signal?.aborted)throw abort();const row=Object.prototype.hasOwnProperty.call(rows,postal)?rows[postal]:null;if(!row)return null;
  if(!Array.isArray(row)||!Array.isArray(row[0])||!Array.isArray(row[1])||!row[0].length)throw new Error('This postal database record is invalid.');
  const cities=row[0].map(i=>metadata.cities[i]);if(cities.some(c=>!c))throw new Error('This postal database location is invalid.');
  const provinces=[...new Set(cities.map(c=>c[0]))],province=provinces.length===1?provinces[0]:'';
  const districts=row[1].map(i=>metadata.districts[i]);if(districts.some(d=>!d))throw new Error('This postal database district is invalid.');
  const active=districts.filter(d=>E.currentRecord(d)),expired=districts.filter(d=>d.validUntil&&!E.currentRecord({...d,validFrom:undefined})),upcoming=districts.filter(d=>d.validFrom&&!E.currentRecord({...d,validUntil:undefined}));
  const reps=active.flatMap(d=>{
   const candidates=d.status?[]:directory.filter(c=>E.districtMatches(c,d)&&E.currentRecord(c)&&!c.issues?.length&&!c.manualOnly&&!c.officeStaff);
   candidates.sort((a,b)=>(Number(b.emailType==='office')-Number(a.emailType==='office'))||String(a.email).localeCompare(String(b.email)));
   const cityInfo=D.cities.find(c=>c.province===d.province&&E.cityKey(c.name,d.province)===E.cityKey(d.city,d.province)),p=D.provinces.find(p=>p.code===d.province),unique=candidates.filter((c,i)=>candidates.findIndex(x=>x.email.toLowerCase()===c.email.toLowerCase())===i),matches=d.level==='municipal'?unique:unique.slice(0,1);
   return (matches.length?matches:[null]).map(c=>({elected_office:d.level==='federal'?'MP':d.level==='provincial'?(p?.title||'MLA'):(d.role||'Councillor'),district_name:d.name,contact_role:c?.role||'',email_type:c?.emailType||'',name:c?.name||'',source_checked:c?.checked||metadata.sourceSnapshot,email:c?.email||'',url:c?.source||(d.level==='federal'?D.federalMembers:d.level==='provincial'?p?.members:(cityInfo?.council||d.source)),representative_set_name:d.city||p?.name||'Canada'}));
  });
  const municipalities=[...new Set(districts.filter(d=>d.level==='municipal'&&d.city).map(d=>d.city))];
  const city=municipalities.length===1?municipalities[0]:(municipalities.length>1?'':cities.length===1?cities[0][1]:'');
  // Multiple source cities/points stay explicit; never average conflicting places.
  return applyCoordinateHold({postal,source:'bundled',fetchedAt:metadata.sourceSnapshot+'T00:00:00Z',recordSources:reps.map(c=>({origin:'the downloaded database',checked:c.source_checked,trustedOfficeTypes:true})),data:{code:postal,province,city,representatives_centroid:reps,representatives_concordance:[]},offline:{cities:cities.map(c=>c[1]),conflictingCoordinates:!!row[2],districts,expiredDistricts:expired,upcomingDistricts:upcoming,sourceSnapshot:metadata.sourceSnapshot,availableLevels:[...new Set(active.map(d=>d.level))]}});
 }
 return {lookup};
}
const local=create();
function mergeResults(fallback,live){
 // Saved/live data can repeat the same bad point. It cannot release a reviewed hold.
 if(coordinateHolds[P.normalize(fallback?.postal||live.postal||live.data?.code||'')])return applyCoordinateHold(fallback||{...live,source:'api'});
 if(!fallback)return {...live,source:'api'};
 const rows=data=>[...(data.representatives_centroid||[]),...(data.representatives_concordance||[])].filter(r=>r&&E.levelFor(r)&&E.safeURL(r.url||r.source_url)).slice(0,100);
 const current=rows(live.data),previous=rows(fallback.data),liveLevels=new Set(current.map(E.levelFor));
 const retained=previous.filter(r=>!liveLevels.has(E.levelFor(r)));
 const province=value=>D.provinces.find(p=>p.code===value||E.norm(p.name)===E.norm(value))?.code||value;
 if(live.data.province&&fallback.data.province&&province(live.data.province)!==province(fallback.data.province))throw Object.assign(new Error('The live result conflicts with the downloaded province. Keeping the downloaded result; confirm your location on an official finder.'),{code:'conflicting-province'});
 const changes=[...liveLevels].filter(level=>{const before=[...new Set(previous.filter(r=>E.levelFor(r)===level).map(r=>E.norm(r.district_name)))].sort();const after=[...new Set(current.filter(r=>E.levelFor(r)===level).map(r=>E.norm(r.district_name)))].sort();return before.length&&JSON.stringify(before)!==JSON.stringify(after);});
 // Keep the displayed locality stable when the API only changes its casing.
 const localCity=fallback.data.city,liveCity=live.data.city;
 const city=!liveCity||E.norm(liveCity)===E.norm(localCity)?localCity:liveCity;
 return {...live,source:retained.length?'mixed':'api',apiResult:live,offline:fallback.offline,changedLevels:changes,retainedLevels:[...new Set(retained.map(E.levelFor))],data:{...live.data,province:live.data.province||fallback.data.province,city,representatives_centroid:[...current,...retained],representatives_concordance:[]},recordSources:[...current.map(()=>({origin:'Open North',checked:live.fetchedAt.slice(0,10)})),...retained.map(r=>({origin:'the downloaded database',checked:r.source_checked||R.checked,trustedOfficeTypes:true}))]};
}
async function resolve(value,{signal,bundledPreview,onLocal=()=>{},localLookup=local.lookup,onlineLookup=P.lookup}={}){
 let fallback=null,localError=null;
 try{
  // A GPS preview already read and verified this exact bundled record.
  const matches=bundledPreview?.source==='bundled'&&bundledPreview.postal===P.normalize(value);
  fallback=matches?bundledPreview:await localLookup(value,{signal});
  if(signal?.aborted)throw abort();
  if(fallback)onLocal(fallback);
 }catch(e){if(signal?.aborted||e.code==='cancelled')throw abort();localError=e;}
 try{
  const result=await onlineLookup(value,{signal});if(signal?.aborted)throw abort();
  if(!E.parseLookup(result.data).reps.length){const e=new Error('The live service returned no usable representative records.');e.code='empty';throw e;}
  return {result:mergeResults(fallback,result),fallback,localError,apiError:null};
 }catch(e){if(signal?.aborted||e.code==='cancelled')throw abort();if(fallback)return {result:fallback,fallback,localError,apiError:e};if(localError){const error=new Error('The installed postal database could not be loaded. This does not mean your postal code is missing. '+e.message);error.code='database-and-api-unavailable';error.localError=localError;error.apiError=e;throw error;}throw e;}
}
const api={applyCoordinateHold,create,lookup:local.lookup,resolve,mergeResults,metadata:M,registerBundle};if(typeof module!=='undefined')module.exports=api;root.CivicOffline=api;
})(typeof globalThis!=='undefined'?globalThis:this);
