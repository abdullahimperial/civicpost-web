'use strict';
/* Legal copy is shared with the standalone, offline-readable policy pages. */
const legalContent=window.CivicLegalContent;
const civicLocalKeys=['civicpost-drafts-v1','civicpost-location-v1','civicpost-postal-lookup-v1','civicpost-notice-v1'];
function legalHome(){
 modal(`<div class="legal-copy"><p class="section-kicker">CIVICPOST CANADA · 1.10.0</p><h2>Privacy, terms &amp; safety</h2><p>By ${esc(legalContent.developerName)}. An independent, nonpartisan tool. Not affiliated with or acting for any government, political party or public office.</p><p>Check official sources and review your letter. No delivery or response is guaranteed. Not for emergencies or formal deadlines.</p><div class="legal-actions">${Object.entries(legalContent.pages).map(([key,p])=>`<button class="button secondary" data-legal="${key}">${esc(p.title)}</button>`).join('')}</div><h3>Your data and choices</h3><p>Saved drafts and remembered locations stay in this app or browser profile. Optional online lookups and email services receive the information described in the privacy policy.</p><div class="legal-actions"><button class="button secondary" data-legal="delete">Delete saved app data</button><button class="button secondary" data-legal="ads">Advertising choices</button></div>${legalContent.pending?'<p class="legal-notice">This test build is awaiting public support and policy setup before store release.</p>':''}</div>`);
}
function legalPage(key){const p=legalContent.pages[key];if(!p)return;modal(`<div class="legal-copy"><button class="text-button" data-legal="home">← Privacy, terms &amp; safety</button><h2>${esc(p.title)}</h2><p class="small">Updated ${esc(legalContent.version)}</p>${p.html}</div>`);$('#dialog-content').scrollTop=0;}
// Keep the established About action working from both compact and classic UI.
about=legalHome;
function deleteCivicData(){
 // Cancel active lookups before touching storage so late responses cannot repopulate it.
 cancelLocationSuggestion();clearLookup();
 try{for(const key of civicLocalKeys)localStorage.removeItem(key);}
 catch{toast('Some saved data could not be removed. Use Android app storage or browser site-data settings.');return false;}
 saved=[];rememberLocation=false;state=initial();step=0;editor='guide';
 // Shared links may contain a private draft; remove that payload from this session URL.
 if(location.hash)history.replaceState(null,'',location.pathname+location.search);
 if(document.documentElement.dataset.webAgreement){location.reload();return true;}
 $('#dialog').close();render();toast('Saved app data and the current letter were cleared. Exports and emails are unchanged.');return true;
}
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-legal]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();
 const action=b.dataset.legal;
 if(action==='home')legalHome();
 else if(legalContent.pages[action])legalPage(action);
 else if(action==='delete')modal('<div class="legal-copy"><h2>Delete saved app data?</h2><p>This removes all saved CivicPost drafts, remembered location, saved postal lookup and the notice acknowledgement, and discards your current unsaved letter.</p><p>It cannot delete exported files, QR codes, emails or information already sent to other services. Advertising consent, where available, is managed separately through Advertising choices.</p><button class="button" data-legal="confirm-delete">Delete app data and current letter</button> <button class="button secondary" data-legal="home">Cancel</button></div>');
 else if(action==='confirm-delete')deleteCivicData();
 else if(action==='ads'){
   if(window.CivicAds?.postMessage){$('#dialog').close();window.CivicAds.postMessage(JSON.stringify({type:'show'}));}
   else modal('<div class="legal-copy"><h2>No ads in this edition</h2><p>This edition has no Google advertising SDK or advertising identifiers. Your letter and chosen recipients are not used for ad targeting.</p><p>The optional AdMob Android edition provides separate advertising and consent controls. All drafting features work without ads.</p><button class="button secondary" data-legal="privacy">Read privacy policy</button></div>');
 }
 else if(action==='notice-done'){try{localStorage.setItem('civicpost-notice-v1',legalContent.version);}catch{}$('#dialog').close();}
},true);
// Informational notice only: it is not ad consent, a legal waiver or a condition to use the app.
// Do not obscure an imported-link preview or any dialog already opened by the user.
setTimeout(()=>{let seen=false;try{seen=localStorage.getItem('civicpost-notice-v1')===legalContent.version;}catch{}
 if(document.documentElement.dataset.webAgreement||seen||location.hash||$('#dialog').open)return;
 modal('<div class="legal-copy"><p class="section-kicker">BEFORE YOU START</p><h2>Your words. Your choice.</h2><p>CivicPost is independent and is not a government service. Verify office details and review your message before sending. It is not for emergencies or official deadlines.</p><p>Your draft stays on this device until you choose to share or open it in an email service. Online location options disclose what they send.</p><div class="legal-actions"><button class="button" data-legal="notice-done">Continue</button><button class="button secondary" data-legal="home">Privacy, terms &amp; safety</button></div></div>');
},0);
