'use strict';
/* Presentation only. The existing state, routing, lookup, draft and sharing
   functions remain the source of truth. No decisions are inferred here. */
const classicUI={location:locationPanel,contacts:contactsPanel,sidebar:renderSidebar};
const flow={view:'start',history:[],page:0,group:'main',district:0,search:'',returnView:'location-review',stateRef:state,previousEditor:editor,lookupStarted:false};
const startLookupCore=startLookup;
startLookup=function(){flow.lookupStarted=true;return startLookupCore();};
const flowStages=['Your location','Your issue','The right offices','Your message'];
const flowBtn=(label,action,cls='secondary',attrs='')=>`<button class="button ${cls}" data-flow="${action}" ${attrs}>${label}</button>`;
const tile=(title,detail,action,symbol='message',attrs='')=>`<button class="choice-tile" data-flow="${action}" ${attrs}>${icon(symbol)}<span><b>${title}</b>${detail?`<small>${detail}</small>`:''}</span><span class="tile-arrow" aria-hidden="true">›</span></button>`;
function flowShell(title,intro,body,{next='',action='',skip='',skipAction='',back=true,footer='',cls=''}={}){
 return `<div class="flow-heading"><p class="section-kicker">${flowStages[step]} · ${step+1} of 4</p><h2 id="flow-title">${title}</h2>${intro?`<p class="flow-intro">${intro}</p>`:''}</div><div class="flow-content ${cls}" id="flow-content">${body}</div><div class="flow-actions">${back?flowBtn('← Back','back','text-button'): '<span></span>'}<div class="flow-forward">${skip?flowBtn(skip,skipAction,'text-button'):''}${next?flowBtn(next,action,''):''}${footer}</div></div>`;
}
function flowMove(view,{stage=step,remember=true}={}){
 if(remember)flow.history.push({view:flow.view,stage:step,page:flow.page,group:flow.group,district:flow.district,returnView:flow.returnView});
 if(flow.history.length>80)flow.history.shift();
 step=stage;flow.view=view;flow.page=0;flow.search='';render();$('#panel').focus({preventScroll:true});
}
function flowBack(){const p=flow.history.pop();if(p){step=p.stage;Object.assign(flow,p);render();$('#panel').focus({preventScroll:true});}else if(step)go(step-1);else flowMove('start',{remember:false});}
go=function(n){
 if(n>0&&!locationValid()){toast(state.locationConfirmed===false?'Confirm the suggested city first.':'Choose your province or territory and community first.');return;}
 if(n>0&&step===0&&flowMunicipalityPending()&&flow.municipalitySkipped!==flowMunicipalityKey()){flowMove('municipality');return;}
 if(n>1&&(!state.issue||!state.levels.length)){toast('Choose an issue and at least one level of government.');return;}
 if(step===0&&n>0)persistLocation();
 if($('#dialog').open)$('#dialog').close();
 const view=n===0?(locationValid()?'location-review':'start'):n===1?'issues':n===2?(state.levels.includes('school')&&!state.schoolBoard?'board':'recipients'):(state.body?'edit':'message-start');
 if(n===2){flow.group='main';flow.returnView='recipients';}
 flowMove(view,{stage:n});
};
function flowPages(items,make,size=4){
 if(window.innerWidth<340&&window.innerHeight<620&&size>2)size=2;
 const pages=Math.max(1,Math.ceil(items.length/size));flow.page=Math.max(0,Math.min(flow.page,pages-1));
 return `<div class="choice-grid">${items.slice(flow.page*size,(flow.page+1)*size).map(make).join('')}</div>${pages>1?`<div class="flow-pagination">${flowBtn('‹ Previous','page-prev','secondary small',flow.page?'':'disabled')}<span aria-live="polite">${flow.page+1} / ${pages}</span>${flowBtn('More ›','page-next','secondary small',flow.page+1<pages?'':'disabled')}</div>`:''}`;
}
function flowLocationReview(){
 const municipality=E.municipalityFor(state),municipalLabel=municipality.name&&E.norm(municipality.name)!==E.norm(state.city)?`<small>Municipal services: ${esc(municipality.name)}</small>`:flowMunicipalityPending()?'<small>Municipal authority needs confirmation</small>':'';
 return flowShell('Your community.', 'Confirm the place your message is about.',`<div class="location-card">${icon('pin')}<div><strong>${esc(state.city)}</strong><span>${esc(D.provinces.find(p=>p.code===state.province)?.name||state.province)}</span>${municipalLabel}${state.postal?`<small>${esc(state.postal)}</small>`:''}</div>${flowBtn('Change','start','text-button')}</div>${municipality.choices.length?flowBtn('Review municipal authority','municipality','text-button'):''}<div class="choice-grid compact">${tile('Districts & school board','Review or add optional details','location-details','building')}${tile(rememberLocation?'Location remembered':'Remember this location','Only on this device','remember','lock',`aria-pressed="${rememberLocation}"`)}</div><p class="flow-hint">${state.ward||state.provRiding||state.fedRiding||state.schoolBoard?'District or board choices saved. Review them above.':'Ward, riding and school board are optional. Add them for more precise matches.'}</p>`,{next:'Choose issue →',action:'next-stage'});
}
function flowMunicipalityKey(){return state.province+'|'+E.norm(state.city);}
function flowMunicipalityPending(){return ['ambiguous','confirmation-needed'].includes(E.municipalityFor(state).status);}
function flowMunicipality(){
 const m=E.municipalityFor(state);
 return flowShell('Which municipal authority?',m.status==='ambiguous'?'This community name can refer to different municipal governments. Choose the one serving the address.':`Confirm the municipality serving ${esc(state.city)}.`,flowPages(m.choices,o=>tile(esc(o.name),state.municipality===o.name?'Your confirmed choice':'Confirm for this address','pick-municipality','building',`data-value="${esc(o.name)}"`),2)+`<p class="flow-hint">A community name does not establish a ward or electoral division. <a href="${esc(E.safeURL(m.source))}" target="_blank" rel="noopener noreferrer">Check the official source ↗</a></p>`,{skip:'Leave municipal authority unresolved',skipAction:'municipality-skip'});
}
function flowDistricts(){return ['municipal','provincial','federal'].filter(l=>lookup&&lookupGroups(l).length);}
function flowLookupDetails(){modal(`<h2>Postal lookup details</h2><p class="small" role="status">${esc(lookupError||lookupStatus)}</p>${lookup?lookupChoices():''}${lookupRecovery()}${button('Offline coverage','offline-coverage','secondary small')}`);}
function flowManualField(key,label,help,list){return flowShell(label,'Optional — leave it unresolved if you are unsure.',`${field(key,label,'Type or choose the exact name')}<datalist id="flow-field-options">${list.map(x=>`<option value="${esc(x)}">`).join('')}</datalist><p class="flow-hint">${help}</p>`,{next:'Keep this choice →',action:'field-done',skip:state[key]?'Clear choice':'Skip for now',skipAction:'field-skip'});}
locationPanel=function(){
 const v=flow.view,p=D.provinces.find(p=>p.code===state.province),city=E.cityFor(state);
 if(v==='municipality')return flowMunicipality();
 if(v==='start')return flowShell('Where is your community?','Start with the option that suits you.',`<div class="choice-stack">${tile('Use a postal code','Find possible districts from the downloaded database','postal','pin')}${tile('Choose manually','Select a province and enter any community','province','city')}${tile('Suggest my city','Approximate internet location · no GPS','suggest','globe')}${locationValid()?tile('Use '+esc(state.city),'Continue with your current location','location-review','check'):''}</div>`,{back:false});
 if(v==='province')return flowShell('Province or territory?','Choose where your community is.',flowPages(D.provinces,p=>tile(esc(p.name),'','pick-province','pin',`data-value="${p.code}"`)));
 if(v==='city')return flowShell('Which community?','Any Canadian city, town or community can be entered.',`${field('city','City, town or community','e.g. Edmonton')}<datalist id="cities">${E.municipalityNames(state.province).map(n=>`<option value="${esc(n)}">`).join('')}</datalist><p class="flow-hint">${esc(p?.name||'Choose a province first.')} ${flowBtn('Change province','province','text-button')}</p>`,{next:'Use this community →',action:'city-done'});
 if(v==='suggest')return flowShell('Suggest a starting city.','You will confirm the result before continuing.',`<div class="flow-explanation">${icon('globe')}<p>Uses your approximate internet location through <a href="https://www.bigdatacloud.com/privacy-and-cookie-policy" target="_blank" rel="noopener noreferrer">BigDataCloud</a>, which receives your IP address. No GPS, name or message is sent.</p><p>Mobile networks and VPNs can suggest a different city.</p></div><p class="flow-hint" role="status">${esc(locationStatus)}</p>`,{next:locationPending?'Finding…':'Suggest my city',action:'suggest-run',skip:'Choose manually',skipAction:'province'});
 if(v==='postal')return flowShell('Your postal code?','Get possible districts, then confirm your choices.',`${field('postal','Canadian postal code','A1A 1A1')}<p class="flow-hint">Checks the downloaded database first, then sends only your postal code to <a href="https://represent.opennorth.ca/" target="_blank" rel="noopener noreferrer">Open North</a>. Your name and message stay here.</p><p class="lookup-status" id="postal-status" role="status">${esc(lookupError||lookupStatus)}</p><div class="inline-options">${flowBtn('Lookup details','lookup-details','text-button')}${button('Offline coverage','offline-coverage','text-button')}</div>`,{next:lookupPending?'Finding…':'Find districts →',action:'lookup-run',skip:'Choose manually',skipAction:'province'});
 if(v==='city-confirm')return flowShell(state.city?'Is this your community?':'Which community is this?','A postal code or internet location is a starting point.',`<div class="location-card">${icon('pin')}<div><strong>${esc(state.city||'Community not resolved')}</strong><span>${esc(p?.name||state.province)}</span><small>${esc(state.postal)}</small></div></div><p class="flow-hint">${lookup?'Postal codes can cross boundaries. Confirm each suggested district on its official page.':'The city is approximate. It does not identify your ward or school board.'}</p>${lookup?flowBtn('Results, warnings & sources','lookup-details','secondary small'):''}<p class="lookup-status" role="status">${esc(lookupStatus||locationStatus)}</p>`,{next:state.city?'Yes, this is my community →':'Enter my community →',action:state.city?'confirm-city':'edit-city',skip:'Change',skipAction:'edit-city'});
 if(v==='district'){
  const levels=flowDistricts(),level=levels[flow.district];if(!level)return flowLocationReview();
  const groups=lookupGroups(level);return flowShell(level==='municipal'?'Which ward or district?':level==='provincial'?'Which provincial riding?':'Which federal riding?',`Possible matches · ${flow.district+1} of ${levels.length}. Choose only after checking.`,flowPages(groups,g=>tile(esc(g.first.district),g.reps.some(r=>state.liveChosen.includes(r.id))?'Your current choice':'Choose this district','pick-district','building',`data-value="${esc(g.first.id)}"`),3)+`<p class="flow-hint">Postal codes can cross boundaries. ${flowBtn('Official sources & warnings','lookup-details','text-button')}</p>`,{skip:'Leave unresolved',skipAction:'district-skip'});
 }
 if(v==='location-details')return flowShell('Make your matches more precise.','Every choice here is optional.',`<div class="choice-grid">${tile('Ward / district',esc(state.ward||'Not selected'),'ward','city')}${tile('Provincial riding',esc(state.provRiding||'Not selected'),'provRiding','building')}${tile('Federal riding',esc(state.fedRiding||'Not selected'),'fedRiding','globe')}${tile('School authority',esc(state.schoolBoard||'Choose your actual board'),'board','book')}</div><div class="inline-options">${flowBtn('Postal lookup','postal','text-button')}${flowBtn('Location privacy','location-privacy','text-button')}</div>`,{next:'Done →',action:'location-review',skip:'Skip optional details',skipAction:'location-review'});
 if(v==='ward')return flowManualField('ward','Municipal ward or district',city?`<a href="${esc(city.wardFinder)}" target="_blank" rel="noopener noreferrer">Find your ward on the official city website ↗</a>`:'Not every municipality has wards. A city alone cannot identify a riding.',city?.wards||[]);
 if(v==='provRiding'||v==='fedRiding')return flowManualField(v,v==='provRiding'?'Provincial / territorial riding':'Federal riding',`Choose an exact directory name to match its office. Wards and ridings are different areas. <a href="${esc(v==='provRiding'?p?.members:D.federalMembers)}" target="_blank" rel="noopener noreferrer">Official member finder ↗</a>`,E.ridings(state.province,v==='provRiding'?'provincial':'federal'));
 if(v==='board'||v==='board-manual')return flowBoard();
 return flowLocationReview();
};
function flowBoard(){
 if(flow.view==='board-manual')return flowShell('Enter your school authority.','Use its full official name.',`${field('schoolBoard','School board / authority','Official board or authority name')}<p class="flow-hint">A name outside the directory may have no matching contacts. You can still add its verified public email from Recipient options. Attendance eligibility is your choice.</p>`,{next:'Keep this board →',action:'board-done',skip:'Skip for now',skipAction:'board-done'});
 const boards=E.jurisdictions(state.province,'school').filter(x=>E.norm(x).includes(E.norm(flow.search)));
 return flowShell('Your school authority?','Choose your actual board, language and school system.',`<div class="field"><label for="board-search">Search the board’s name</label><input id="board-search" type="search" data-flow-search="board" value="${esc(flow.search)}" placeholder="Type part of the name" autocomplete="off"></div><div id="flow-search-results">${flowBoardResults(boards)}</div><p class="flow-hint">An office city is not an attendance area. Trustee wards differ from city wards.</p>`,{skip:state.schoolBoard?'Keep current board':'Skip for now',skipAction:'board-done',footer:state.schoolBoard?flowBtn('Clear board','board-clear','secondary small'):''});
}
function flowBoardResults(boards){return boards.length?flowPages(boards,b=>tile(esc(b),b===state.schoolBoard?'Current choice':'','pick-board','book',`data-value="${esc(b)}"`),window.innerWidth<=700?1:2):'<p>No matching authority. Try a broader name or leave it unresolved.</p>'+flowBtn('Board not listed? Enter its name','board-manual','text-button');}
issuePanel=function(){
 const issue=D.issues.find(i=>i.id===state.issue);
 if(flow.view==='issues')return flowShell('What would you like to raise?','Choose the closest topic.',flowPages(D.issues,i=>`<button class="choice-tile ${state.issue===i.id?'chosen':''}" data-issue="${i.id}" aria-pressed="${state.issue===i.id}">${icon(i.icon)}<span><b>${esc(i.name)}</b></span><span class="tile-arrow" aria-hidden="true">›</span></button>`,4));
 if(flow.view==='service')return flowShell('Which local service?','Different providers can handle these services.',`<div class="choice-grid">${[['garbage','Garbage & organics'],['recycling','Recycling / Blue Box'],['water','Water & sewer'],['','All / not sure']].map(([id,n])=>tile(n,'','pick-service','leaf',`data-value="${id}"`)).join('')}</div>`,{skip:'Skip refinement',skipAction:'service-skip'});
 return flowShell('Who should hear about it?','Suggested levels are selected. Adjust them if needed.',`<div class="level-choices">${Object.entries(levelNames).map(([l,name])=>`<button class="level-choice ${state.levels.includes(l)?'chosen':''}" data-flow="toggle-level" data-value="${l}" aria-pressed="${state.levels.includes(l)}">${icon(state.levels.includes(l)?'check':'building')}<span>${name}</span></button>`).join('')}</div>${flowBtn('Responsibilities & guidance','issue-details','text-button')}`,{next:'Find offices →',action:'next-stage'});
};
function flowContactGroups(){const g=E.recipientGroups(state);return {...g,selected:E.selectedContacts(state)};}
function flowContactDetails(id){const c=E.contactsFor(state).find(c=>c.id===id)||E.selectedContacts(state).find(c=>c.id===id);if(c)modal(`<h2>Office details</h2>${contactCard(c)}`);}
function flowContactCard(c){
 const selected=state.selected.includes(c.id),label=c.kind==='shared'?'Shared draft · verify':c.kind==='custom'?'Added by you':c.email?(c.serviceProvider?'Service provider inbox':c.emailType==='office'||c.kind==='curated'?'Office / role inbox':'Published work email'):c.kind==='service-route'?'Official service channel':'Official finder';
 return `<article class="flow-contact ${selected?'selected':''}" data-office="${esc(c.id)}"><div class="office-label">${icon(c.email?'mail':'globe')}<span>${label}</span>${selected?'<span class="selected-mark">Added ✓</span>':''}</div><h3>${esc(c.role)}${c.district?' — '+esc(c.district):''}</h3><p class="office-place">${esc(c.jurisdiction||c.city||c.province||'Canada')}${c.name?' · '+esc(c.name):''}</p>${c.email?`<p class="contact-email">${esc(c.email)}</p>`:''}${c.specialist?'<p class="specialist-note">Specific service only · check details</p>':''}<p class="office-purpose">${esc(c.servicePurpose||E.contactRelevance(c,state).reason)}</p><div class="office-tools">${flowBtn('Details & source','contact-details','text-button',`data-value="${esc(c.id)}"`)}${c.email?`<div class="mode-buttons" aria-label="Recipient type"><button data-flow="mode" data-value="to" data-id="${esc(c.id)}" aria-pressed="${state.recipientModes[c.id]!=='cc'}">To</button><button data-flow="mode" data-value="cc" data-id="${esc(c.id)}" aria-pressed="${state.recipientModes[c.id]==='cc'}">Cc</button></div>`:''}</div><div class="office-decisions">${c.email?flowBtn(selected?'Remove recipient':'Add recipient','add-recipient',selected?'secondary':'',`data-value="${esc(c.id)}"`):`<a class="button" href="${esc(E.safeURL(c.source))}" target="_blank" rel="noopener noreferrer">Open official page ↗</a>`}${flowBtn('Skip →','next-contact','secondary')}</div></article>`;
}
contactsPanel=function(){
 if(flow.view==='board'||flow.view==='board-manual')return flowBoard();
 if(flow.view==='municipality')return flowMunicipality();
 if(state.levels.includes('municipal')&&flowMunicipalityPending()&&flow.municipalitySkipped!==flowMunicipalityKey())return flowMunicipality();
 const count=E.selectedContacts(state).length,coverage=E.coverageFor(state),groups=flowContactGroups();
 if(flow.view==='recipients-done')return flowShell(count?'Your recipients are ready.':'You can still write a message.',count?`${count} email recipient${count===1?'':'s'} selected. Review before opening your email app.`:'No email recipient is selected. Copy your draft for an official service form, or add a contact.',`<div class="choice-stack">${count?tile('Review selected recipients','Check addresses and To / Cc','selected','mail'):''}${tile('Browse more offices','Suggested offices and service channels','recipients','building')}${tile('Directory & more options','Opposition, school board or a verified contact','recipient-options','people')}</div>`,{next:'Write message →',action:'next-stage'});
 const available=['main','serviceRoutes','additional','finders'];if(!groups[flow.group]?.length&&flow.group!=='selected')flow.group=available.find(k=>groups[k].length)||'main';
 const list=groups[flow.group]||[];flow.page=Math.min(flow.page,Math.max(0,list.length-1));
 const labels={school:'School contacts',main:'Suggested offices',additional:'Additional offices',serviceRoutes:'Service channels',finders:'Official finders',selected:'Selected recipients'};
 const coverageText=coverage.status==='email'?`${coverage.emailCount} email matches${coverage.serviceRouteCount?' · '+coverage.serviceRouteCount+' service channels':''}`:coverage.status==='service'?'Service channel available · no matching email':'No matching email or service channel';
 return flowShell('Choose who receives it.','',`<div class="recipient-toolbar">${flowBtn('‹','contact-prev','secondary small',`aria-label="Previous office" ${flow.page?'':'disabled'}`)}${flowBtn(labels[flow.group]+(list.length?' · '+(flow.page+1)+'/'+list.length:'')+' ▾','recipient-groups','secondary small group-picker')}${flowBtn('⋯','recipient-options','secondary small','aria-label="Recipient options"')}</div><p id="recipient-coverage" data-coverage="${coverage.status}" class="flow-hint">${coverageText}</p>${list.length?flowContactCard(list[flow.page]):'<p class="flow-empty">No offices in this view. Try the directory or add a verified public contact.</p>'}`,{next:count?'Continue ('+count+') →':'Continue without email →',action:'recipients-done',footer:`<span id="selected-count" class="sr-only">${count} email recipients selected</span>`});
};
const promptPages=[['topic','Give it a short title.','A few words about the issue.',false],['concern','What needs to change?','Describe the concern, relevant dates or service involved.',true],['impact','How does it affect you?','Explain the effect on you or your community. Avoid sensitive identifiers.',false],['request','What action would help?','For example: a review, an explanation or a timeline.',false],['name','How would you like to sign?','Your name is optional.',false]];
messagePanel=function(){
 const rec=E.selectedContacts(state),v=flow.view;
 if(v==='message-start')return flowShell('Put it in your words.','Choose how you would like to start.',`<div class="choice-stack">${tile('Help me write','Short prompts build an editable draft','guide','message')}${tile('Write myself','Start with a subject and your own message','edit','mail')}</div><p class="flow-hint">The guided draft uses your words and local templates. Your message is not sent to an AI service.</p>`);
 if(v.startsWith('prompt-')){const i=Number(v.slice(7)),[key,title,hint,required]=promptPages[i];return flowShell(title,hint,`${['topic','name'].includes(key)?field(key,key==='topic'?'Issue title':'Your name',key==='topic'?'e.g. Accessible school transport':'Your name'):area(key,({concern:'Your concern',impact:'Effect on you or your community',request:'Requested action'})[key],'Write in your own words.',4)}<p class="flow-hint">Prompt ${i+1} of ${promptPages.length}${required?' · Required':' · Optional'}</p>`,{next:'Continue →',action:'prompt-next',skip:required?'':'Skip for now',skipAction:'prompt-next',cls:'writing-prompt'});}
 if(v==='style')return flowShell('Make the draft yours.','Choose a tone and letter framework.',`<p class="choice-label">Tone</p><div class="choice-row">${[['respectful','Constructive'],['firm','Firm & respectful']].map(([id,n])=>flowBtn(n,'preference','choice-pill',`data-key="tone" data-value="${id}" aria-pressed="${state.tone===id}"`)).join('')}</div><p class="choice-label">Letter framework</p><div class="choice-row">${[['en','English'],['fr','Français']].map(([id,n])=>flowBtn(n,'preference','choice-pill',`data-key="language" data-value="${id}" aria-pressed="${state.language===id}"`)).join('')}</div><p class="flow-hint">Your own words stay exactly as written; they are not translated.</p>${flowBtn(state.includePostal?'Postal code included ✓':'Include my postal code','include-postal','choice-pill',`aria-pressed="${state.includePostal}"`)}<p class="error" id="draft-error" role="status"></p>`,{next:'Build my draft →',action:'generate'});
 if(v==='review')return flowReview();
 if(v==='send-options')return flowShell('Open your draft with…','Uses your existing account. No email password is stored here.',`<div class="choice-stack">${[['default','My email app'],['gmail','Gmail in browser'],['outlook','Outlook in browser']].map(([id,n])=>tile(n,state.emailApp===id?'Current choice':'','email-app','mail',`data-value="${id}"`)).join('')}</div><p class="flow-hint">Opening Gmail or Outlook passes your recipients and draft to that service. You decide when to send.</p>`);
 const changed=state.body&&state.draftContext&&state.draftContext!==[state.province,state.city,state.municipality||'',state.ward,state.issue].join('|');
 return flowShell('Your message.',changed?'Location or issue changed. Update this letter before sending.':'Edit freely. You can attach files later in your email app.',`<div class="field subject-field"><label for="subject">Subject</label><input id="subject" data-bind="subject" maxlength="200" value="${esc(state.subject)}" placeholder="A clear subject"></div>${area('body','Message','Write your message here.',5)}<div class="inline-options">${flowBtn('Writing prompts','guide','text-button')}${flowBtn('Save, copy & QR','draft-tools','text-button')}</div>`,{next:'Review & open →',action:'review',cls:'message-editor'});
};
function flowReview(){
 const rec=E.selectedContacts(state),services=E.recipientGroups(state).serviceRoutes;
 return flowShell('Ready for your review.','Nothing is sent automatically.',`<div class="review-card"><button data-flow="review-recipients"><span>Recipients</span><b>${rec.length} selected · review To / Cc ›</b></button><button data-flow="edit"><span>Message</span><b>${esc(state.subject||'Add a subject')} ›</b></button><button data-flow="send-options"><span>Open with</span><b>${({default:'My email app',gmail:'Gmail in browser',outlook:'Outlook in browser'})[state.emailApp]} · Change ›</b></button></div><label class="checkrow review-check"><input id="review-confirm" type="checkbox">I have reviewed the recipients and message.</label><p id="send-error" class="error" role="status"></p><p class="flow-hint">Opening a draft shares its content with your email service. Check facts and official addresses. You press Send there.</p><div class="inline-options">${flowBtn('Save, copy & QR','draft-tools','text-button')}${services.length?flowBtn('Service channels','service-links','text-button'):''}</div>`,{footer:'<a class="button" id="send-link" href="#" aria-disabled="true">Open email draft ↗</a>'});
}

renderSidebar=function(){
 const issue=D.issues.find(i=>i.id===state.issue);$('#sidebar').innerHTML='';
 const summary=$('#flow-summary');if(summary)summary.innerHTML=`<button data-flow="summary" aria-label="Review or change your choices">${icon('pin')}<span>${esc(state.city||'Choose a community')}${issue?' · '+esc(issue.name):''}</span><b>Review ›</b></button>`;
};
const baseRender=render;
render=function(){
 if(flow.stateRef!==state){flow.stateRef=state;flow.history=[];flow.view=step===3?'edit':'start';flow.previousEditor=editor;}
 if(step===3&&editor==='edit'&&flow.previousEditor!=='edit')flow.view='edit';flow.previousEditor=editor;
 if(flow.lookupStarted&&lookup&&flow.view==='postal'){flow.lookupStarted=false;flow.history.push({view:'postal',stage:0,page:0,group:flow.group,district:0});flow.view='city-confirm';flow.district=0;}
 if(flow.view==='suggest'&&!locationPending&&state.locationConfirmed===false&&state.city)flow.view='city-confirm';
 baseRender();$('#panel').dataset.view=flow.view;$('#panel').dataset.stage=String(step);
 if(['city','postal'].includes(flow.view)){const el=$('#'+flow.view);if(el){el.autocomplete=flow.view==='city'?'address-level2':'postal-code';if(flow.view==='city')el.setAttribute('list','cities');else{el.maxLength=8;el.autocapitalize='characters';}}}
 if(['ward','provRiding','fedRiding'].includes(flow.view))$('#'+flow.view)?.setAttribute('list','flow-field-options');
 if(flow.view==='postal'||flow.view==='suggest')$('#panel [data-flow$="-run"]')?.toggleAttribute('disabled',flow.view==='postal'?lookupPending:locationPending);
 $('#flow-content')?.scrollTo(0,0);
};
function flowChooseProvince(code){if(state.province!==code){cancelLocationSuggestion();clearLookup();invalidate();Object.assign(state,{province:code,city:'',municipality:'',ward:'',provRiding:'',fedRiding:'',schoolBoard:'',locationConfirmed:true});}flowMove('city');}
function flowChooseDistrict(id){const level=flowDistricts()[flow.district];if(!level)return;state.liveChosen=state.liveChosen.filter(id=>!state.liveReps.some(r=>r.id===id&&r.level===level));const r=state.liveReps.find(r=>r.id===id);const key={municipal:'ward',provincial:'provRiding',federal:'fedRiding'}[level];state[key]=r?.district||'';if(r){const group=lookupGroups(level).find(g=>g.reps.some(x=>x.id===id));state.liveChosen.push(...(group?.reps||[r]).map(x=>x.id));}invalidate();flow.history.push({view:'district',stage:step,page:flow.page,group:flow.group,district:flow.district});flow.district++;flow.page=0;if(flow.district>=flowDistricts().length)flow.view='location-review';render();$('#panel').focus({preventScroll:true});}
function flowBoardDone(){flowMove(step===2?'recipients':flow.returnView==='location-details'?'location-details':'location-review');}
function flowRecipientOptions(){modal(`<h2>Recipient options</h2><div class="choice-stack">${tile(state.opposition?'Opposition included ✓':'Include opposition','Relevant oversight offices only','opposition','people')}${state.levels.includes('school')?tile('Choose school authority',esc(state.schoolBoard||'Not selected'),'board','book'):''}${tile('Search the directory','Find another published office','directory-choose','building')}${tile('Add a verified contact','Use its published email and official source','custom-contact','mail')}${tile('Review selected recipients',E.selectedContacts(state).length+' selected','selected','check')}</div><p class="small">Access/privacy and specialist inboxes are only for their listed service. Coverage is broad but incomplete.</p>${state.opposition&&['NT','NU'].includes(state.province)?'<p>The Northwest Territories and Nunavut use consensus government and do not have a party-based Official Opposition.</p>':''}`);}
function flowDraftTools(){modal(`<h2>Keep or share your draft</h2><div class="choice-stack">${button('Save draft on this device','save','secondary')}${button('Copy message','copy','secondary')}${button('Copy recipients','copy-recipients','secondary')}${button('Download .txt','download','secondary')}${button('Share QR / draft','share-draft','secondary')}</div><p class="small">Saving keeps the draft on this device. Anyone with a shared QR or draft file can read its message and recipients.</p>`);}
function flowMenu(){modal(`<h2>CivicPost</h2><div class="choice-stack">${tile('Review current choices','Location, issue and recipients','summary','check')}${tile('Import QR / draft','Preview before loading','import','mail')}${tile('Saved drafts',saved.length+' on this device','saved','message')}${tile('Contact directory',R.stats.uniqueEmails.toLocaleString()+' distinct emails','directory','building')}${tile('Coverage & sources','Data, source dates and limitations','coverage','globe')}${tile('Privacy, terms & safety','Policies, data controls and advertising','about','lock')}</div><p class="small">Version 1.10.0 · Independent. Nonpartisan.</p>`);}
document.addEventListener('click',e=>{
 const t=e.target.closest('button,a');if(!t)return;
 if(t.dataset.issue){flow.history.push({view:'issues',stage:1,page:flow.page,group:flow.group});flow.page=0;flow.view=t.dataset.issue==='waste'?'service':'levels';}
 if(t.dataset.editor){flow.view=t.dataset.editor==='guide'?'prompt-0':'edit';}
 if(!t.dataset.flow)return;
 if(lookupPending&&lookupResult)lookupInteracted=true;
 e.preventDefault();e.stopImmediatePropagation();const a=t.dataset.flow,val=t.dataset.value;
 const close=()=>{if($('#dialog').open)$('#dialog').close();};
 if(a==='back'){flowBack();return;}
 if(a==='page-next'||a==='page-prev'){flow.page+=a==='page-next'?1:-1;render();return;}
 if(a==='pick-province'){flowChooseProvince(val);return;}
 if(a==='city-done'){if(!state.province||!state.city.trim()){toast('Enter your province and community first.');return;}state.locationConfirmed=true;flowMove(flowMunicipalityPending()?'municipality':'location-review');return;}
 if(a==='edit-city'){flowMove(state.province?'city':'province');return;}
 if(a==='confirm-city'){state.locationConfirmed=true;flow.district=0;flowMove(flowMunicipalityPending()?'municipality':lookup&&flowDistricts().length?'district':'location-review');return;}
 if(a==='municipality'){flowMove('municipality');return;}
 if(a==='pick-municipality'){
  const choice=E.municipalityFor(state).choices.find(o=>o.name===val);if(!choice)return;
  state.municipality=choice.name;state.ward='';state.liveChosen=state.liveChosen.filter(id=>!state.liveReps.some(r=>r.id===id&&r.level==='municipal'));invalidate();flow.municipalitySkipped='';
  flowMove(step===2?'recipients':lookup&&flowDistricts().length?'district':'location-review');return;
 }
 if(a==='municipality-skip'){state.municipality='';state.ward='';state.liveChosen=state.liveChosen.filter(id=>!state.liveReps.some(r=>r.id===id&&r.level==='municipal'));invalidate();flow.municipalitySkipped=flowMunicipalityKey();flowMove(step===2?'recipients':'location-review');return;}
 if(a==='lookup-run'){flow.lookupStarted=true;startLookup();return;}
 if(a==='suggest-run'){suggestLocation();return;}
 if(a==='lookup-details'){flowLookupDetails();return;}
 if(a==='pick-district'||a==='district-skip'){flowChooseDistrict(a==='pick-district'?val:'');return;}
 if(a==='remember'){rememberLocation=!rememberLocation;if(rememberLocation)persistLocation();else try{localStorage.removeItem('civicpost-location-v1');}catch{}render();return;}
 if(a==='field-done'||a==='field-skip'){if(a==='field-skip'){state[flow.view]='';invalidate();}flowMove('location-details');return;}
 if(a==='pick-board'){state.schoolBoard=val;state.liveChosen=state.liveChosen.filter(id=>!state.liveReps.some(r=>r.id===id&&r.level==='school'));invalidate();flowBoardDone();return;}
 if(a==='board-done'){flowBoardDone();return;}
 if(a==='board-clear'){state.schoolBoard='';state.liveChosen=state.liveChosen.filter(id=>!state.liveReps.some(r=>r.id===id&&r.level==='school'));invalidate();flowBoardDone();return;}
 if(a==='location-privacy'){modal('<h2>Your location stays under your control.</h2><p>No street address is needed. Location is stored only when you choose Remember location, save a postal lookup or save a draft. Your unsaved message stays in this session.</p><p>Postal lookup sends only the postal code to Open North after reading the downloaded database. City suggestion sends your IP address to BigDataCloud. GPS is not used. School eligibility and Indigenous affiliation require your own choice.</p>');return;}
 if(a==='next-stage'){go(Math.min(3,step+1));return;}
 if(a==='pick-service'||a==='service-skip'){state.serviceDetail=a==='pick-service'?val:'';invalidate();flowMove('levels');return;}
 if(a==='toggle-level'){state.levels=state.levels.includes(val)?state.levels.filter(l=>l!==val):[...state.levels,val];invalidate();render();return;}
 if(a==='issue-details'){const issue=D.issues.find(i=>i.id===state.issue);modal(`<h2>Who handles this issue?</h2><p>${esc(issue?.summary)}</p><p>${esc(issue?.hint)}</p><p>Topic group: ${esc(issue?.group)}</p><p>Municipal: roads, parks, transit and local services.<br>Provincial / territorial: education, health and provincial programs.<br>Federal: foreign affairs, citizenship and national policy.</p><p>Some issues involve more than one level. <a href="${D.responsibilities}" target="_blank" rel="noopener noreferrer">How responsibility works ↗</a></p>`);return;}
 if(a==='recipient-options'){flowRecipientOptions();return;}
 if(a==='recipient-groups'){const g=flowContactGroups();modal(`<h2>Which offices?</h2><div class="choice-stack">${[['main','Suggested offices'],['school','School contacts'],['additional','Additional offices'],['serviceRoutes','Official service channels'],['finders','Official finders'],['selected','Selected recipients']].map(([id,n])=>tile(n,g[id].length+' available','contact-group','building',`data-value="${id}"`)).join('')}</div>`);return;}
 if(a==='contact-group'){flow.group=val;flow.page=0;close();render();return;}
 if(a==='selected'){flow.group='selected';close();flowMove('recipients');return;}
 if(a==='opposition'){state.opposition=!state.opposition;render();flowRecipientOptions();return;}
 if(a==='contact-details'){flowContactDetails(val);return;}
 if(a==='mode'){state.recipientModes[t.dataset.id]=val;render();return;}
 if(a==='add-recipient'){const c=E.contactsFor(state).find(c=>c.id===val);if(!c?.email)return;const had=state.selected.includes(val);state.selected=state.selected.filter(id=>id!==val);if(!had){state.selected.push(val);if(flow.page+1<flowContactGroups()[flow.group].length)flow.page++;else{flowMove('recipients-done');return;}}render();return;}
 if(a==='next-contact'){const list=flowContactGroups()[flow.group]||[];if(flow.page+1<list.length){flow.page++;render();}else flowMove('recipients-done');return;}
 if(a==='contact-prev'){flow.page=Math.max(0,flow.page-1);render();return;}
 if(a==='custom-contact'){const temp=document.createElement('template');temp.innerHTML=classicUI.contacts();const el=[...temp.content.querySelectorAll('details')].find(d=>d.querySelector('summary')?.textContent==='Add a published office email');modal('<h2>Add a published office email</h2>'+el.querySelector('.details-content').innerHTML);return;}
 if(a==='directory-choose'){openDirectory('choose');return;}
 if(a==='guide'){editor='guide';close();flowMove('prompt-0');return;}
 if(a==='prompt-next'){const i=Number(flow.view.slice(7));if(i===1&&!state.concern.trim()){toast('Describe your concern so the letter reflects your issue.');$('#concern').focus();return;}flowMove(i+1<promptPages.length?'prompt-'+(i+1):'style');return;}
 if(a==='preference'){state[t.dataset.key]=val;render();return;}
 if(a==='include-postal'){state.includePostal=!state.includePostal;render();return;}
 if(a==='generate'){generate();return;}
 if(a==='email-app'){state.emailApp=val;flowMove('review');return;}
 if(a==='review-recipients'){modal(`<h2>Review every recipient</h2>${E.selectedContacts(state).map(c=>`<div class="review-address"><b>${state.recipientModes[c.id]==='cc'?'Cc':'To'}: ${esc(c.email)}</b><p>${esc(c.role)}${c.jurisdiction?' · '+esc(c.jurisdiction):''}</p>${flowBtn('Details & source','contact-details','text-button',`data-value="${esc(c.id)}"`)}</div>`).join('')||'<p>No email recipients selected.</p>'}${flowBtn('Change recipients','change-recipients','secondary')}`);return;}
 if(a==='change-recipients'){go(2);return;}
 if(a==='draft-tools'){flowDraftTools();return;}
 if(a==='service-links'){const routes=E.recipientGroups(state).serviceRoutes;modal(`<h2>Official service channels</h2><p>Copy your message for a form where offered. Opening a page does not submit it.</p>${routes.map(contactCard).join('')}`);return;}
 if(a==='summary'){modal(`<h2>Your choices so far</h2><div class="choice-stack">${tile('Location',esc([state.city,state.province,state.ward,state.provRiding,state.fedRiding,state.schoolBoard].filter(Boolean).join(' · ')),'change-location','pin')}${tile('Issue',esc(D.issues.find(i=>i.id===state.issue)?.name||'Not chosen'),'change-issue','message')}${tile('Recipients',E.selectedContacts(state).length+' selected','change-recipients','mail')}</div>`);return;}
 if(a==='change-location'){go(0);return;}if(a==='change-issue'){go(1);return;}
 if(a==='menu'){flowMenu();return;}if(a==='import'){showImportDraft();return;}if(a==='saved'){showSaved();return;}if(a==='directory'){openDirectory('browse');return;}if(a==='coverage'){coverage();return;}if(a==='about'){about();return;}
 if(['start','province','city','postal','suggest','location-review','location-details','ward','provRiding','fedRiding','board','board-manual','recipients','recipients-done','review','send-options','edit'].includes(a)){
  if(a==='board')flow.returnView=step===2?'recipients':'location-details';
  if(a==='province'&&lookupPending)clearLookup();
  if(a==='edit')editor='edit';
  if(a==='recipients')flow.group='main';
  close();flowMove(a);return;
 }
},true);
document.addEventListener('input',e=>{if(e.target.dataset.flowSearch==='board'){flow.search=e.target.value;flow.page=0;$('#flow-search-results').innerHTML=flowBoardResults(E.jurisdictions(state.province,'school').filter(x=>E.norm(x).includes(E.norm(flow.search))));}});
document.addEventListener('change',e=>{if(e.target.dataset.contact||e.target.dataset.mode)render();});
function fitFlowViewport(){const v=window.visualViewport,h=v?.height||window.innerHeight;document.documentElement.style.setProperty('--flow-height',window.top===window.self?h+'px':'100dvh');document.body.classList.toggle('compact-keyboard',h<500);}
window.visualViewport?.addEventListener('resize',fitFlowViewport);window.addEventListener('resize',fitFlowViewport);fitFlowViewport();
document.body.classList.add('tap-flow');render();
