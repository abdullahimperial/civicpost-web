(function(root){'use strict';
const web=root.CivicWeb,E=root.CivicEngine,R=root.CivicDirectory;
const fields=['province','city','municipality','ward','provRiding','fedRiding','schoolBoard','issue','serviceDetail'];
const results=new Map(),pending=new Map();
let apiRelease='';
function location(s){
  const q={};for(const key of fields)q[key]=String(s[key]||'');
  q.levels=[...(s.levels||[])];q.opposition=!!s.opposition;
  q.directoryAdded=[...(s.directoryAdded||[])];return q;
}
function key(s){return JSON.stringify(location(s));}
async function request(path,body,{signal}={}){
  const origin=web.manifest.contactApiUrl;
  if(!origin)throw Error('Online contact lookup has not been connected yet. Official directory links and drafting are still available.');
  const controller=new AbortController(),stop=()=>controller.abort();
  if(signal?.aborted)controller.abort();signal?.addEventListener('abort',stop,{once:true});
  const timer=setTimeout(stop,15000);
  try{
    const response=await root.fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal});
    const value=await response.json();
    if(!response.ok){const error=Error(value.error||'Contact lookup failed. Please retry.');error.status=response.status;throw error;}
    if(!Array.isArray(value.results)||value.results.length>24||!Number.isInteger(value.total))throw Error('The contact service returned an invalid response.');
    if(apiRelease&&apiRelease!==value.release){results.clear();R.contacts.length=0;R.routes.length=0;E.refreshDirectory();}
    apiRelease=value.release;
    return value;
  }catch(e){if(e.name==='AbortError')throw Error(signal?.aborted?'Lookup cancelled.':'Contact lookup timed out. Check your connection and retry.');throw e;}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);}
}
function ingest(rows){
  for(const c of rows){if(!c||typeof c.id!=='string'||!E.currentRecord(c))continue;
    const list=c.kind==='service-route'?R.routes:R.contacts,index=list.findIndex(x=>x.id===c.id);
    if(index<0)list.push(c);else list[index]=c;
  }
  E.refreshDirectory();
}
const loadGeography=web.ensureLocation;
web.locationKey=key;
web.ensureLocation=async function(s){
  await loadGeography(s);
  if(!s.city||!s.issue||!s.levels?.length)return;
  const k=key(s),cached=results.get(k);if(cached&&Date.now()-cached.time<300000)return;
  if(!pending.has(k)){
    const task=request('/v1/lookup',location(s)).then(value=>{ingest(value.results);results.set(k,{...value,time:Date.now()});});
    pending.set(k,task);task.then(()=>pending.delete(k),()=>pending.delete(k));
  }
  return pending.get(k);
};
web.contactsForState=s=>(results.get(key(s))?.results||[]).filter(c=>E.currentRecord(c));
web.reviewLiveContacts=(rows,s)=>{
  // A postal provider or saved draft can still name an outgoing officeholder.
  // Match against current, issue-scoped API results entirely in this browser.
  // Unmatched contacts keep their district/source in the location step, but
  // cannot become recipients; the user can verify and add a custom office.
  const current=web.contactsForState(s);
  return rows.flatMap(r=>{
    if(!r.email)return [];
    const c=current.find(c=>c.email&&c.email.toLowerCase()===r.email.toLowerCase()&&c.level===r.level&&
      (c.emailType==='office'||r.name&&E.norm(c.name)===E.norm(r.name))&&
      (!c.district||[c.district,...(c.districtAliases||[])].some(d=>E.norm(d)===E.norm(r.district))));
    return c?[{...c,id:r.id,kind:'live',lookupSource:r.source}]:[];
  });
};
web.lookupInfo=s=>results.get(key(s));
web.moreContacts=async s=>{
  const k=key(s),previous=results.get(k);if(previous?.nextOffset==null)return;
  const value=await request('/v1/lookup',{...location(s),offset:previous.nextOffset});
  ingest(value.results);results.set(k,{...value,results:[...previous.results,...value.results],time:Date.now()});
};
web.searchContacts=async(filters,options)=>{
  const body={province:filters.province,query:filters.query||'',jurisdiction:filters.jurisdiction||'',level:filters.level||'',genericOnly:!!filters.genericOnly,offset:filters.offset||0};
  if(filters.levels)body.levels=filters.levels;
  if(filters.issue)body.issue=filters.issue;
  const value=await request('/v1/search',body,options);ingest(value.results);return value;
};
// Option names and boundary metadata carry no contact records and may be static.
const originalProvince=web.province,regionIndexes=new Map();
web.province=async code=>{const value=await originalProvince(code);if(value)regionIndexes.set(code,value);return value;};
const oldEnsure=web.ensureLocation;
web.ensureLocation=async s=>{if(s.province)await web.province(s.province);return oldEnsure(s);};
const oldRidings=E.ridings,oldJurisdictions=E.jurisdictions;
E.ridings=(province,level)=>[...new Set([...oldRidings(province,level),...(regionIndexes.get(province)?.districts||[]).filter(d=>d.level===level&&E.currentRecord(d)).map(d=>d.name)])].sort();
E.jurisdictions=(province,level)=>{
  const groups=regionIndexes.get(province)?.jurisdictions||{};
  return [...new Set([...oldJurisdictions(province,level),...(level?groups[level]||[]:Object.values(groups).flat())])].sort();
};
web.loadDirectory=()=>Promise.reject(Error('Choose a province and search for an office. Bulk contact downloads are unavailable.'));
})(globalThis);
