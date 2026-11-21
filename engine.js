(function(root){'use strict';
const D=typeof module!=='undefined'?require('./data.js'):root.CivicData;
const R=typeof module!=='undefined'?require('./directory-data.js'):root.CivicDirectory;
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const clean=v=>String(v||'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').trim();
const emailValid=e=>typeof e==='string'&&e.length<255&&/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(e)&&!/[\r\n,;]/.test(e);
const safeURL=u=>{try{const v=new URL(u);return v.protocol==='https:'&&!v.username&&!v.password?v.href:'';}catch{return '';}};
const postal=v=>clean(v).toUpperCase().replace(/\s/g,'');
const postalValid=v=>/^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\d[ABCEGHJ-NPRSTV-Z]\d$/.test(postal(v));
function levelFor(r){const office=String(r.elected_office||'').toLowerCase();if(office==='mp')return 'federal';if(/^(mla|mpp|mna|mha)$/.test(office))return 'provincial';if(/trustee|school|commissioner/.test(office))return 'school';if(/mayor|councillor|councilor|conseiller|alder/.test(office))return 'municipal';return null;}
function roleEmail(r){
 const e=clean(r.email);if(!emailValid(e))return '';
 const [local,domain]=e.toLowerCase().split('@');const l=norm(local),district=norm(r.district_name);
 // Explicit office/riding forms only. Never construct a mailbox from a ward or riding.
 const names=[r.first_name,r.last_name].map(norm).filter(n=>n.length>=3);
 if(names.some(n=>l.includes(n)))return '';
 if(domain==='assembly.ab.ca'&&district&&l===district)return e;
 if(/^(ward|district)[0-9]+$/.test(l)&&/council|alder|conseill/i.test(r.elected_office||'')&&l===norm(r.district_name))return e;
 if(/^(mayor|mayorsoffice|council|councillors|citycouncil)$/.test(l))return e;
 return '';
}
function publishedEmail(r){return emailValid(clean(r.email))?clean(r.email):'';}
const directoryById=new Map(R.contacts.map(c=>[c.id,c]));
let searchable=R.contacts.map(c=>({c,text:norm([c.role,c.name,c.email,c.jurisdiction,c.city,c.district].join(' '))}));
function serviceMatches(c,s){
 const tags={garbage:['garbage','organics','leaf-and-yard','bulk-items','regional-waste-site'],recycling:['residential-blue-box','recycling','recycling-escalation'],water:['water','sewage','drinking-water','stormwater']}[s.serviceDetail];
 return s.issue!=='waste'||!tags||!Array.isArray(c.serviceScope)||!c.serviceScope.length||c.serviceScope.some(t=>tags.includes(t));
}
function directoryEligible(c,s){return currentRecord(c)&&(!c.province||c.province===s.province)&&(s.levels||[]).includes(c.level)&&(!c.issues||!c.issues.length||c.issues.includes(s.issue))&&serviceMatches(c,s);}
const dateFormatters=new Map(),localDates=new Map();
function currentRecord(c,today=new Date()){
 if(['needs-verification','needs_verification'].includes(c.refreshReview?.status)||c.refreshStatus==='needs_verification')return false;
 if(!c.validUntil&&!c.validFrom)return true;
 if(today instanceof Date){
  if(!c.validTimezone)today=today.toISOString().slice(0,10);
  else{
   const zone=c.validTimezone,minute=Math.floor(today.getTime()/60000),cached=localDates.get(zone);
   if(cached?.minute===minute)today=cached.date;
   else{
    if(!dateFormatters.has(zone))dateFormatters.set(zone,new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}));
    today=dateFormatters.get(zone).format(today);localDates.set(zone,{minute,date:today});
   }
  }
 }
 return (!c.validUntil||today<=c.validUntil)&&(!c.validFrom||today>=c.validFrom);
}
let municipalIndexCache;
function municipalIndex(){
 const mappings=D.municipalPlaces?.mappings,ambiguities=D.municipalPlaces?.ambiguities;
 if(municipalIndexCache?.mappings===mappings&&municipalIndexCache?.ambiguities===ambiguities&&municipalIndexCache?.cities===D.cities&&municipalIndexCache?.cityCount===D.cities.length)return municipalIndexCache;
 const key=(province,name)=>province+'|'+norm(name),map=new Map(),ambiguous=new Map(),cities=new Map();
 for(const row of mappings||[])map.set(key(row.province,row.community),row);
 for(const row of ambiguities||[])if(row.status!=='merged')ambiguous.set(key(row.province,row.locality),row);
 for(const city of D.cities)for(const alias of [city.name,...(city.aliases||[])])if(!cities.has(key(city.province,alias)))cities.set(key(city.province,alias),norm(city.name));
 municipalIndexCache={mappings,ambiguities,cities:D.cities,cityCount:D.cities.length,map,ambiguous,cityKeys:cities,key};return municipalIndexCache;
}
function cityKey(value,province){
 const index=municipalIndex(),alias=index.map.get(index.key(province,value)),target=alias?.kind==='name-alias'?alias.municipality:value;
 return index.cityKeys.get(index.key(province,target))||norm(target);
}
function municipalityFor(s){
 const index=municipalIndex(),key=index.key(s.province,s.city),ambiguous=index.ambiguous.get(key),mapping=index.map.get(key);
 const choices=ambiguous?(ambiguous.options||[]):mapping?.requiresConfirmation?[{name:mapping.municipality,source:mapping.source}]:[];
 if(choices.length){
  const chosen=choices.find(c=>cityKey(c.name,s.province)===cityKey(s.municipality,s.province));
  return {status:chosen?'confirmed':ambiguous?'ambiguous':'confirmation-needed',name:chosen?.name||'',choices,source:ambiguous?.source||mapping?.source||'',community:s.city};
 }
 // An arbitrary/stale municipality value cannot override a different locality.
 return {status:'resolved',name:mapping?.municipality||s.city,choices:[],source:mapping?.source||'',community:s.city};
}
function servesCity(c,s){
 if(c.province&&c.province!==s.province)return false;
 const municipality=municipalityFor(s);if(!['resolved','confirmed'].includes(municipality.status))return false;
 const key=cityKey(municipality.name,s.province);if(!key)return false;
 // Regional services list the communities they actually serve. An office's
 // mailing city is not evidence that it serves the entire province.
 const places=c.servedMunicipalities?.length?c.servedMunicipalities:[c.city,c.jurisdiction,...(c.cityAliases||[])];
 return places.some(n=>n&&cityKey(n,s.province)===key);
}
function municipalScopeMatches(c,s){
 if(!servesCity(c,s))return false;
 const ward=!!s.ward&&[c.district,...(c.districtAliases||[])].some(d=>d&&norm(d)===norm(s.ward));
 return c.borough?ward:!c.district||c.atLarge||norm(c.district)===norm(c.city)||ward;
}
function districtMatches(c,d){
 if(c.level!==d.level||c.province!==d.province||d.city&&cityKey(c.city,c.province)!==cityKey(d.city,d.province))return false;
 if(c.borough&&norm(c.borough)!==norm(d.borough))return false;
 if(c.boroughWide&&c.borough)return true;
 if(c.atLarge&&d.atLarge)return true;
 const names=[d.name,...(d.aliases||[])].map(norm);
 return [c.district,...(c.districtAliases||[])].some(n=>n&&names.includes(norm(n)));
}
function directorySearch(filters={}){
 const terms=String(filters.query||'').trim().split(/\s+/).map(norm).filter(Boolean);
 let rows=searchable.filter(({c,text})=>(!filters.province||!c.province||c.province===filters.province)&&(!filters.level||c.level===filters.level)&&(!filters.levels||filters.levels.includes(c.level))&&(!filters.jurisdiction||c.jurisdiction===filters.jurisdiction)&&(!filters.issue||!c.issues?.length||c.issues.includes(filters.issue))&&(!filters.genericOnly||c.emailType==='office')&&terms.every(t=>text.includes(t))).map(x=>x.c);
 rows.sort((a,b)=>(Number(b.emailType==='office')-Number(a.emailType==='office'))||a.jurisdiction.localeCompare(b.jurisdiction)||a.role.localeCompare(b.role)||a.email.localeCompare(b.email));
 const offset=Math.max(0,Number(filters.offset)||0),limit=Math.min(100,Math.max(1,Number(filters.limit)||24));return {total:rows.length,results:rows.slice(offset,offset+limit)};
}
function jurisdictions(province,level){return [...new Set(R.contacts.filter(c=>(!province||!c.province||c.province===province)&&(!level||c.level===level)).map(c=>c.jurisdiction))].sort((a,b)=>a.localeCompare(b));}
function ridings(province,level){return [...new Set(R.contacts.filter(c=>c.province===province&&c.level===level&&c.scope==='riding').map(c=>c.district))].sort((a,b)=>a.localeCompare(b));}
function municipalityNames(province){return [...new Set([...D.cities.filter(c=>c.province===province).map(c=>c.name),...(D.municipalPlaces?.mappings||[]).filter(m=>m.province===province).map(m=>m.community),...R.contacts.filter(c=>c.province===province&&c.level==='municipal'&&c.city).map(c=>c.city)])].sort((a,b)=>a.localeCompare(b));}
function directoryMatches(s){return R.contacts.filter(c=>{
 if(!directoryEligible(c,s))return false;
 if(c.manualOnly||c.officeStaff||!currentRecord(c))return false;
 if(c.scope==='riding')return !!c.district&&norm(c.district)===norm(c.level==='federal'?s.fedRiding:s.provRiding);
 if(c.level==='school'){
  if(!s.schoolBoard||c.jurisdiction!==s.schoolBoard)return false;
  if(c.trusteeMunicipalWards){const ward=/^(?:ward\s*)?(\d+)$/i.exec(String(s.ward||'').trim());return c.province==='AB'&&norm(c.city)==='calgary'&&norm(s.city)==='calgary'&&!!c.trusteeMappingSource&&!!ward&&c.trusteeMunicipalWards.includes(ward[1]);}
  return true;
 }
 if(c.level==='municipal')return municipalScopeMatches(c,s);
 if(c.scope==='ministry')return c.issues?.includes(s.issue)&&!c.optional;
 return false;
});}
let liveIdentityCache;
function blockedLiveIdentity(r,s={}){
 // A saved/API row can predate a reviewed departure and have none of the new
 // expiry fields. Compare the exact named mailbox and any supplied holder, not a mailbox
 // pattern or a person's name alone. Generic role inboxes remain independent.
 if(!r.email)return;
 if(liveIdentityCache?.contacts!==R.contacts||liveIdentityCache?.count!==R.contacts.length){
  const byEmail=new Map();
  for(const c of R.contacts)if(c.emailType==='named'&&c.email){const key=c.email.toLowerCase();if(!byEmail.has(key))byEmail.set(key,[]);byEmail.get(key).push(c);}
  liveIdentityCache={contacts:R.contacts,count:R.contacts.length,byEmail};
 }
 const province=String(s.province||r.province||''),code=D.provinces.find(p=>norm(p.code)===norm(province)||norm(p.name)===norm(province))?.code||province;
 const candidates=(liveIdentityCache.byEmail.get(clean(r.email).toLowerCase())||[]).filter(c=>c.level===r.level&&(!code||!c.province||c.province===code)&&(!r.name||norm(r.name)===norm(c.name))&&(!r.district||!c.district||[c.district,...(c.districtAliases||[])].some(d=>norm(d)===norm(r.district))));
 if(candidates.some(c=>currentRecord(c)))return;
 return candidates.find(c=>!currentRecord(c));
}
function parseLookup(raw,{origin='Open North',trustedOfficeTypes=false,checked=new Date().toISOString().slice(0,10),recordSources=[]}={}){
 if(!raw||typeof raw!=='object')throw Error('No matching districts were returned.');
 const reps=[...(Array.isArray(raw.representatives_centroid)?raw.representatives_centroid:[]),...(Array.isArray(raw.representatives_concordance)?raw.representatives_concordance:[])];
 const out=[];const seen=new Set();
 for(const [index,r] of reps.slice(0,200).entries()){if(!r||typeof r!=='object')continue;const level=levelFor(r);if(!level)continue;const provenance=recordSources[index]||{},recordOrigin=provenance.origin||origin,recordChecked=provenance.checked||checked,recordTrusted=provenance.trustedOfficeTypes===true||trustedOfficeTypes;
 const district=clean(r.district_name).slice(0,160),office=clean(r.elected_office).slice(0,50),set=clean(r.representative_set_name).slice(0,160);const source=safeURL(r.url)||safeURL(r.source_url);if(!source)continue;
 const key=[level,district,set,office,clean(r.name),clean(r.email).toLowerCase(),source].join('|');if(seen.has(key))continue;seen.add(key);
 const generic=recordTrusted&&r.email_type==='office'?publishedEmail(r):roleEmail(r),contact={id:'live-'+out.length,level,district,role:(recordTrusted&&r.contact_role?clean(r.contact_role).slice(0,100):office)+' — '+district,name:clean(r.name).slice(0,160),source,email:generic||publishedEmail(r),emailType:generic?'office':'named',kind:'live',set,note:'From '+recordOrigin+'. Confirm the district and current office on its official page.',checked:recordChecked};
 const blocked=blockedLiveIdentity(contact,raw);
 if(blocked){contact.email='';contact.reviewedContactId=blocked.id;contact.refreshReview=blocked.refreshReview;for(const field of ['validFrom','validUntil','validTimezone','refreshStatus'])if(blocked[field])contact[field]=blocked[field];contact.note+=' The reviewed directory withholds this named contact. Use the current official office page.';}
 out.push(contact);
 }
 return {province:clean(raw.province).slice(0,60),city:clean(raw.city).slice(0,120),reps:out};
}
function cityFor(s){const municipality=municipalityFor(s);if(!municipality.name)return;const key=cityKey(municipality.name,s.province);const city=D.cities.find(c=>c.province===s.province&&cityKey(c.name,s.province)===key);if(!city)return city;const m=root.CivicOfflineData||(typeof module!=='undefined'?require('./offline-metadata.js'):null);const wards=(m?.districts||[]).filter(d=>d.level==='municipal'&&d.province===s.province&&cityKey(d.city,s.province)===key&&currentRecord(d)).map(d=>d.name);return {...city,wards:[...new Set([...city.wards,...wards])]};}
function contactsFor(s){
 const p=D.provinces.find(p=>p.code===s.province);if(!p)return [];
 const issue=D.issues.find(i=>i.id===s.issue);if(!issue)return [];
 const levels=s.levels||issue.levels;const online=root.CivicWeb?.androidRows?.(s);
 if(online)return finishContacts(online,s,levels);
 const city=cityFor(s);let out=D.contacts.filter(c=>levels.includes(c.level)&&(!c.province||c.province===s.province)&&(!c.city||norm(c.city)===norm(s.city))&&(!c.ward||norm(c.ward)===norm(s.ward))&&(!c.issues||c.issues.includes(s.issue)));
 const selectedLive=(root.CivicWeb?.reviewLiveContacts(s.liveReps||[],s)||[]).filter(r=>(s.liveChosen||[]).includes(r.id)&&levels.includes(r.level)&&currentRecord(r)&&!blockedLiveIdentity(r,s));
 out.push(...selectedLive);out.push(...(root.CivicWeb?.contactsForState(s)||[]));
 const matched=directoryMatches(s);
 out.push(...matched);
 out.push(...(R.routes||[]).filter(c=>directoryEligible(c,s)&&usableServiceRoute(c,s)));
 out.push(...(s.directoryAdded||[]).map(id=>directoryById.get(id)).filter(c=>c&&directoryEligible(c,s)));
 const add=(id,role,level,source,note)=>out.push({id,role,level,source,email:'',note,kind:'directory'});
 if(levels.includes('municipal')&&!selectedLive.some(r=>r.level==='municipal')){const authority=municipalityFor(s),pending=['ambiguous','confirmation-needed'].includes(authority.status);add('municipal-directory',pending?'Confirm your municipal government':s.ward?`Councillor — ${s.ward}`:'Your municipal council','municipal',city?.council||authority.source||p.government,pending?'Review your municipal government in Your location before choosing municipal recipients.':city?'Open the official directory to confirm your ward contact.':'This municipality is not in the bundled directory. Add its official office contact below; the provincial portal is a starting point.');}
 if(levels.includes('provincial')&&!selectedLive.some(r=>r.level==='provincial')&&!matched.some(c=>c.scope==='riding'&&c.level==='provincial'))add('provincial-member',`Your ${p.title}${s.provRiding?' — '+s.provRiding:''}`,'provincial',p.members,'Choose your riding in Your location, or search the contact directory below. Confirm the current member on the legislature’s website.');
 if(levels.includes('provincial')&&s.issue==='education'&&!out.some(c=>c.issues?.includes('education')))add('education-directory','Education ministry / department','provincial',p.education,'An official contact page is available. A generic inbox has not been verified for this release.');
 if(levels.includes('provincial')&&s.issue!=='education')add('provincial-ministry','Relevant provincial / territorial ministry','provincial',p.government,'Choose the ministry responsible for the specific program or policy.');
 if(levels.includes('federal')&&!selectedLive.some(r=>r.level==='federal')&&!matched.some(c=>c.scope==='riding'&&c.level==='federal'))add('federal-member',`Your Member of Parliament${s.fedRiding?' — '+s.fedRiding:''}`,'federal',D.federalMembers,'Choose your federal riding in Your location, or search below. Official work emails containing the member’s name are available when no generic office address is published.');
 if(levels.includes('federal')&&s.issue!=='foreign')add('federal-department','Relevant federal department','federal','https://www.canada.ca/en/government/dept.html','Find the department responsible for your concern. Use secure service channels for individual applications and accounts.');
 if(levels.includes('school')&&!matched.some(c=>c.level==='school'))add('school-authority','Your school authority / board','school',p.education,'Choose your actual school board in Your location or use the directory below. City wards and mailing addresses cannot identify which school board serves you.');
 if(levels.includes('community'))add('community-authority','Your Indigenous / community government','community','https://www.sac-isc.gc.ca/eng/1100100013785/1529102490303','Use the government and contact relevant to your community. No community affiliation is inferred from location.');
 if(s.opposition&&levels.includes('federal'))add('federal-opposition','Leader of the Official Opposition — federal','federal',D.federalLeaders,'Optional oversight contact. Use the official parliamentary directory; no permanent generic email has been verified.');
 if(s.opposition&&levels.includes('provincial')&&!['NT','NU'].includes(s.province))add('provincial-opposition','Official Opposition — '+p.name,'provincial',p.members,'Optional oversight contact. Select the opposition leader or relevant critic from the legislature’s official information.');
 return finishContacts(out,s,levels);
}
function finishContacts(out,s,levels){
 out.push(...(s.custom||[]).filter(c=>levels.includes(c.level)&&c.province===s.province&&(!['municipal','school','community'].includes(c.level)||norm(c.city)===norm(s.city))));
 const seen=new Set();return out.sort((a,b)=>Number((s.selected||[]).includes(b.id))-Number((s.selected||[]).includes(a.id))||Number(b.emailType==='office')-Number(a.emailType==='office')).filter(c=>{const key=c.email?c.email.toLowerCase():c.id;if(seen.has(key))return false;seen.add(key);return true;});
}
function usableServiceRoute(c,s){return !!safeURL(c.source)&&(!c.email)&&((c.level==='municipal'&&municipalScopeMatches(c,s))||(c.scope==='ministry'&&c.issues?.includes(s.issue))||(c.level==='school'&&s.schoolBoard===c.jurisdiction));}
function contactRelevance(c,s){
 if(c.kind==='service-route')return {score:85,reason:c.servicePurpose||'Official service-request channel for this issue and community.'};
 if(!c.email)return {score:0,reason:'Use this official finder when an email or district is missing.'};
 if(c.kind==='shared'||c.kind==='custom')return {score:20,reason:'Added to this draft. Check the office and purpose before sending.'};
 if(c.level==='school'){
  if(c.schoolOffice)return {score:10,reason:'Individual school office; use only for that school.'};
  if(c.specialist)return {score:100,reason:'Published service contact for this issue in your chosen school authority.'};
  if(c.trusteeMunicipalWards)return {score:95,reason:'Matches your chosen board and ward using the board’s published trustee mapping.'};
  if(/board of trustees|board office|general inquir|general contact|public information|reception|administration office/i.test(c.role))return {score:90,reason:'General contact for the school authority you selected.'};
  if(/trustee|chair|commissioner/i.test(c.role))return {score:40,reason:'School-board governance. Confirm the trustee area; your municipal ward does not establish it.'};
  return {score:30,reason:'Board leadership or administration. Check whether this role handles your concern.'};
 }
 if(c.scope==='ministry'&&c.issues?.includes(s.issue))return {score:90,reason:'This ministry or public service is listed for your selected issue.'};
 if(c.scope==='riding'||c.kind==='live'&&c.district)return {score:95,reason:'Matches the district you chose. Confirm it serves your address.'};
 if(c.level==='municipal'){
  if(c.servedMunicipalities?.length)return {score:90,reason:'Published service contact for '+s.city+'. '+(c.servicePurpose||'Check the listed service before sending.')};
  if(/mayor/i.test(c.role))return {score:50,reason:'City-wide leadership; additional to the relevant service or councillor.'};
  if(c.district)return {score:90,reason:'Matches your selected municipal ward or district.'};
  return {score:80,reason:'Published municipal office for the community and issue you chose.'};
 }
 return {score:60,reason:'Matches the government level and issue you selected.'};
}
// Only confirmed districts can populate the two local-member choices.
function bankingOffices(s){
 const p=D.provinces.find(province=>province.code===s.province);
 if(!p||s.issue!=='banking')return [];
 const contacts=contactsFor(s);
 return (s.levels||[]).filter(level=>level==='federal'||level==='provincial').flatMap(level=>{
  const federal=level==='federal',ridingKey=federal?'fedRiding':'provRiding',district=s[ridingKey];
  const atLevel=contacts.filter(c=>c.level===level&&c.email);
  return [
   {key:level+'-finance',label:federal?'Federal finance ministry':p.name+' finance ministry',level,
    source:federal?'https://www.canada.ca/en/department-finance/corporate/contact-us.html':p.government,
    contacts:atLevel.filter(c=>c.scope==='ministry'&&c.issues?.includes('banking'))},
   {key:level+'-member',label:federal?'Your federal MP':'Your '+p.title+' in '+p.name,level,ridingKey,district,
    source:federal?D.federalMembers:p.members,
    contacts:atLevel.filter(c=>district&&(c.scope==='riding'||c.kind==='live')&&!c.officeStaff&&!c.manualOnly&&
     [c.district,...(c.districtAliases||[])].some(name=>name&&norm(name)===norm(district)))}
  ];
 });
}
function recipientGroups(s){
 const contacts=contactsFor(s),rank=c=>contactRelevance(c,s).score;
 const ordered=[...contacts].sort((a,b)=>rank(b)-rank(a)||Number(b.emailType==='office')-Number(a.emailType==='office'));
 const chosen=ordered.filter(c=>(s.selected||[]).includes(c.id));
 const recommended=ordered.filter(c=>c.email&&rank(c)>=70&&!(s.selected||[]).includes(c.id)).slice(0,3);
 const main=[...chosen,...recommended],ids=new Set(main.map(c=>c.id));
 return {main,additional:ordered.filter(c=>c.email&&!ids.has(c.id)),serviceRoutes:ordered.filter(c=>c.kind==='service-route'),finders:ordered.filter(c=>!c.email&&c.kind!=='service-route')};
}
function coverageFor(s){
 const groups=recipientGroups(s),emailCount=groups.main.length+groups.additional.length,serviceRouteCount=groups.serviceRoutes.length;
 return {status:emailCount?'email':serviceRouteCount?'service':'uncovered',emailCount,serviceRouteCount,needsSchoolBoard:(s.levels||[]).includes('school')&&!s.schoolBoard};
}
function selectedContacts(s){const valid=new Set(s.selected||[]);return contactsFor(s).filter(c=>valid.has(c.id)&&emailValid(c.email));}
function draft(s){const issue=D.issues.find(i=>i.id===s.issue);const p=D.provinces.find(p=>p.code===s.province);const place=[clean(s.city),p?.name].filter(Boolean).join(', ');const lang=s.language||'en';
 const title=clean(s.topic)||issue?.name|| (lang==='fr'?'Ma préoccupation':'My concern');const concern=clean(s.concern),impact=clean(s.impact),request=clean(s.request),name=clean(s.name);
 if(lang==='fr')return {subject:`Préoccupation d’une personne résidente : ${title}`,body:[`Bonjour,`,`Je réside à ${place||'[ville, province ou territoire]'}.${s.ward?' Mon quartier municipal est '+clean(s.ward)+'.':''}`,`Je vous écris au sujet de ${title}.`,concern,impact?`Conséquences pour moi ou ma communauté :\n${impact}`:'',request?`Ce que je vous demande :\n${request}`:'Je vous prie de m’indiquer les mesures possibles pour répondre à cette préoccupation.',s.tone==='firm'?'Je souhaite recevoir une réponse écrite précisant les prochaines étapes et leur échéancier.':'Merci de m’indiquer les prochaines étapes et les délais prévus.',`Si cette question relève d’un autre service, merci de m’orienter vers le bon interlocuteur.`,`Cordialement,`,name||'[Votre nom]',s.includePostal&&s.postal?'Code postal : '+postal(s.postal):''].filter(Boolean).join('\n\n')};
 return {subject:`Resident concern: ${title}`,body:[`Dear Office Team,`,`I am a resident of ${place||'[city, province or territory]'}.${s.ward?' My municipal ward is '+clean(s.ward)+'.':''}`,`I am writing about ${title}.`,concern,impact?`How this affects me or my community:\n${impact}`:'',request?`What I am asking for:\n${request}`:'Please let me know what action your office can take to address this concern.',s.tone==='firm'?'I would appreciate a written response explaining the next steps and a timeframe for action.':'I would appreciate your response and any information about the next steps.',`If another office is responsible, please direct me to the appropriate contact.`,`Thank you,`,name||'[Your name]',s.includePostal&&s.postal?'Postal code: '+postal(s.postal):''].filter(Boolean).join('\n\n')};
}
function mailto(s){const rec=selectedContacts(s);const to=rec.filter(c=>(s.recipientModes||{})[c.id]!=='cc').map(c=>c.email);const cc=rec.filter(c=>(s.recipientModes||{})[c.id]==='cc').map(c=>c.email);if(!to.length)throw Error('Choose at least one To recipient.');const subject=clean(s.subject).replace(/[\r\n]+/g,' ');const body=String(s.body||'');if(!subject||!body.trim())throw Error('Add a subject and a message first.');const params=new URLSearchParams();if(cc.length)params.set('cc',cc.join(','));params.set('subject',subject);params.set('body',body);return 'mailto:'+to.map(email=>encodeURIComponent(email).replace('%40','@')).join(',')+'?'+params.toString().replace(/\+/g,'%20');}
function refreshDirectory(){directoryById.clear();for(const c of R.contacts)directoryById.set(c.id,c);searchable=R.contacts.map(c=>({c,text:norm([c.role,c.name,c.email,c.jurisdiction,c.city,c.district].join(' '))}));}
const E={refreshDirectory,currentRecord,cityKey,municipalityFor,municipalScopeMatches,usableServiceRoute,servesCity,serviceMatches,bankingOffices,districtMatches,norm,clean,emailValid,safeURL,postal,postalValid,parseLookup,roleEmail,publishedEmail,levelFor,contactsFor,contactRelevance,recipientGroups,coverageFor,selectedContacts,draft,mailto,cityFor,directorySearch,directoryMatches,directoryEligible,jurisdictions,ridings,municipalityNames,directoryById};if(typeof module!=='undefined')module.exports=E;root.CivicEngine=E;
})(typeof globalThis!=='undefined'?globalThis:this);
