// Only the solo application shell is cached. API responses never enter CacheStorage.
const PREFIX='hexa-arena-'+self.registration.scope;
const CACHE=PREFIX+'v6.0.1';
const FILES=['./','./index.html','./app.mjs','./style.css','./shared/engine.mjs','./shared/storage.mjs','./manifest.webmanifest','./icon.svg'];
const allowed=new Set(FILES.map(p=>new URL(p,self.registration.scope).href));
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET'||!allowed.has(req.url))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    try{
      const response=await fetch(req);
      const isPage=req.mode==='navigate';
      const valid=response.ok&&(!isPage||(response.headers.get('content-type')||'').includes('text/html'));
      if(valid){event.waitUntil(cache.put(req,response.clone()));return response;}
      return await cache.match(req)||response;
    }catch{
      const hit=await cache.match(req);
      return hit||new Response('Hors ligne : ouvre le jeu une première fois avec une connexion.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
    }
  })());
});
