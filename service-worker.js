const CACHE='oliveira-frota-v30-preview-manual';
const ASSETS=['./','./index.html','./styles.css','./app.js','./firebase-config.js','./cloud-sync.js','./manifest.webmanifest','./assets/logo-oliveira.png','./assets/oliveira-frota-banner.png','./assets/icons/icon-192.png','./assets/icons/icon-512.png','./assets/icons/favicon.png'];

self.addEventListener('message',e=>{
  if(e.data?.type==='SKIP_WAITING'){
    self.skipWaiting();
  }
});
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  const url=new URL(e.request.url);
  if(url.origin!==self.location.origin) return;
  if(e.request.mode==='navigate'){
    e.respondWith(fetch(e.request).then(resp=>{const copy=resp.clone();caches.open(CACHE).then(c=>c.put('./index.html',copy));return resp;}).catch(()=>caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(e.request).then(cached=>{
    const network=fetch(e.request).then(resp=>{if(resp&&resp.ok){const copy=resp.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return resp;}).catch(()=>null);
    return cached || network;
  }));
});
