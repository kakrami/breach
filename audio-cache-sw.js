const CACHE_NAME='breachline-fixed-audio-fallback-v3';
const CACHE_PREFIX='breachline-fixed-audio-fallback-';
self.addEventListener('install',event=>{self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith(CACHE_PREFIX)&&key!==CACHE_NAME)await caches.delete(key);await self.clients.claim();})());});
self.addEventListener('fetch',event=>{
  const req=event.request;if(req.method!=='GET'||req.destination!=='audio')return;
  event.respondWith((async()=>{const cache=await caches.open(CACHE_NAME),hit=await cache.match(req,{ignoreVary:true});if(hit)return hit;try{const response=await fetch(req);if(response.ok||response.type==='opaque')cache.put(req,response.clone()).catch(()=>{});return response;}catch(error){const fallback=await cache.match(req.url,{ignoreVary:true});if(fallback)return fallback;throw error;}})());
});
