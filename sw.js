'use strict';
const RELEASE='af28a9b3bce463121fdd';
const BASE=new URL('./',self.location.href);
const PREFIX='civicpost-web:'+BASE.pathname+':';
const CACHE=PREFIX+RELEASE;
const SHELL=["analytics.js", "api-client.js", "api-ui.js", "app.js", "data.js", "engine.js", "flow.css", "flow.js", "icon-192.png", "icon-512.png", "icon.svg", "index.html", "legal-content.js", "legal-ui.js", "legal.css", "location.js", "manifest.webmanifest", "offline-postal.js", "postal-lookup.js", "privacy.html", "safety.html", "sharing-ui.js", "sharing.js", "sources.html", "style.css", "terms.html", "web-data.js", "web-manifest.js", "web.css"];
const EXTRA=['vendor/qrcode.js','vendor/jsQR.js','offline-postal/sources.html'];
self.addEventListener('install',event=>{
  // Never precache national data. Updates wait for old tabs to close, keeping
  // their running scripts and cache consistent until the next session.
  event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL.map(p=>new URL(p,BASE).href))));
});
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const key of await caches.keys())if(key.startsWith(PREFIX)&&key!==CACHE)await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==BASE.origin||!url.pathname.startsWith(BASE.pathname)||url.search)return;
  const relative=url.pathname.slice(BASE.pathname.length)||'index.html';
  if(!SHELL.includes(relative)&&!EXTRA.includes(relative)&&!relative.startsWith('data/'+RELEASE+'/'))return;
  const key=new URL(relative,BASE).href;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE),hit=await cache.match(key);
    if(hit)return hit;
    const response=await fetch(event.request);
    if(response.ok&&response.type!=='opaque'){
      try{await cache.put(key,response.clone());}catch{/* Reading still works when storage is full. */}
    }
    return response;
  })());
});
