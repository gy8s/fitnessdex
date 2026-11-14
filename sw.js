/* FitnessDex PWA shell: fresh network responses first, local fallback when offline. Workout data remains outside this cache. */
const CACHE='fitnessdex-shell-v20';
const FILES=['./','./index.html','./ui.css','./exercise-reference.js','./workouts.js','./habits.js','./log-flow.js','./ui-shell.js','./campaigns.js','./progression.js','./set-ui.js','./daily-care.js','./quick-tools.js','./notifications.js','./push-client.js','./cloud.js','./updates.js','./version.json','./manifest.json','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('fitnessdex-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);if(u.origin!==self.location.origin||!u.pathname.startsWith('/fitnessdex/'))return;
if(u.pathname.endsWith('/version.json')){e.respondWith(fetch(e.request));return;}e.respondWith(fetch(e.request).then(res=>{if(res.ok){const copy=res.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request,copy)))}return res}).catch(()=>caches.match(e.request).then(hit=>hit||(e.request.mode==='navigate'?caches.match('./index.html'):Response.error()))))});

self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const section=event.notification.data?.section;
 if(!['water','supplements'].includes(section))return;
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{
  const existing=clients.find(client=>client.url.startsWith(self.registration.scope));
  if(existing){
   const focused=await existing.focus();
   focused.postMessage({type:'fitnessdex:reminder-open',section});
   return;
  }
  return self.clients.openWindow(self.registration.scope+'?fd-reminder='+encodeURIComponent(section));
 }));
});

/* Background Web Push. Only generic messages; no supplement names or doses. */
self.addEventListener('push',event=>{
 let incoming={};
 try{if(event.data)incoming=event.data.json();}catch(e){}
 const section=['water','supplements'].includes(incoming.section)?incoming.section:'water';
 const title=section==='supplements'?'Supplement check-in':'Water check-in';
 const body=section==='supplements'?'You have a scheduled routine to check in.':'A good moment to check your water intake.';
 event.waitUntil(self.registration.showNotification(title,{
  body,icon:'./icons/icon-192.png',badge:'./icons/icon-192.png',
  tag:'fitnessdex-'+String(incoming.tag||section).slice(0,40),
  data:{section},
 }));
});
