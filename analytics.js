/* Public website only. The site token is public, never an account credential.
   Count page visits, not steps, letters, contacts, identities or send actions. */
(function(){
  'use strict';
  const settings=document.currentScript?.dataset;
  if(!settings||!/^[a-f0-9]{32}$/.test(settings.analyticsToken||''))return;
  let site;try{site=new URL(settings.analyticsSite);}catch{return;}
  // Keep local previews, other GitHub projects and the Android bundle out of
  // this property's traffic. An unavailable beacon never blocks drafting.
  if(site.protocol!=='https:'||location.origin!==site.origin||!location.pathname.startsWith(site.pathname))return;
  const page=location.pathname.slice(site.pathname.length);
  if(!['','index.html','privacy.html','terms.html','safety.html','sources.html'].includes(page))return;
  if(document.querySelector('script[data-cf-beacon]'))return;
  const beacon=document.createElement('script');
  beacon.type='module';
  beacon.src='https://static.cloudflareinsights.com/beacon.min.js';
  beacon.referrerPolicy='no-referrer';
  // CivicPost's four steps are one page. Do not count draft-related URL changes
  // as extra visits. Cloudflare's standard beacon receives no custom events.
  beacon.setAttribute('data-cf-beacon',JSON.stringify({token:settings.analyticsToken,spa:false}));
  document.head.appendChild(beacon);
})();
