const CACHE='control-rt-v3';
const CORE=['/','/manifest.json','/control-symbol-gold.svg','/control-logo-gold.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  const u=new URL(e.request.url); if(u.pathname.startsWith('/api/')) return;
  if(e.request.mode==='navigate') e.respondWith(fetch(e.request).then(r=>{const x=r.clone();caches.open(CACHE).then(c=>c.put('/',x));return r}).catch(()=>caches.match('/')));
  else e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).then(r=>{if(r.ok) caches.open(CACHE).then(x=>x.put(e.request,r.clone()));return r})));
});
