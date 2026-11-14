/* FitnessDex v0.8.6: authenticated, opt-in background Web Push. */
(()=>{
'use strict';
const BASE='https://ntepqkhftnnwtowpuggt.supabase.co/functions/v1/fitnessdex-push';
const STATES={off:'Background reminders are off.',signin:'Sign in under More → Cloud saving to enable closed-app reminders.',permission:'Allow notifications in Android settings first.',connecting:'Connecting background reminders…',connected:'Background push connected. Reminders can arrive with the app closed.',error:'Background push is not connected. Try Connect again.'};
let mode='off',detail='',busy=null,connectedEndpoint='';
const state=()=>window.fdReminderStatus?.().config;
function setMode(next,extra=''){
 mode=next;detail=extra;
 const item=document.getElementById('fd-background-status');
 if(item)item.textContent=STATES[next]+(extra?' '+extra:'');
}
window.fdPushStatus=()=>({mode,connected:mode==='connected',text:STATES[mode]+(detail?' '+detail:'')});
window.fdPushIsConnected=()=>mode==='connected';
const toArray=s=>{
 const b64=s.replace(/-/g,'+').replace(/_/g,'/');
 const binary=atob(b64+'='.repeat((4-b64.length%4)%4));
 return Uint8Array.from(binary,c=>c.charCodeAt(0));
};
const client=()=>window.fdCloudClient?.();
async function session(){
 const api=client();
 if(!api)return null;
 const {data,error}=await api.auth.getSession();
 if(error)throw error;
 return data?.session||null;
}
function tz(){
 const zone=Intl.DateTimeFormat().resolvedOptions().timeZone||'Europe/London';
 return zone.length<=80?zone:'Europe/London';
}
function validEndpoint(subscription){
 try{
  const u=new URL(subscription.endpoint);
  const h=u.hostname.toLowerCase();
  return u.protocol==='https:'&&!u.port&&(h==='fcm.googleapis.com'||h==='updates.push.services.mozilla.com'||h==='web.push.apple.com'||h.endsWith('.push.apple.com')||h==='wns.notify.windows.com'||h.endsWith('.notify.windows.com'));
 }catch(e){return false;}
}
async function connect(){
 if(busy)return busy;
 busy=(async()=>{
  const prefs=state();
  if(!prefs?.enabled){setMode('off');return false;}
  if(!navigator.onLine){setMode('error','Connect when you are online.');return false;}
  if(!('PushManager' in window)||!('serviceWorker' in navigator)||!('Notification' in window)||!window.isSecureContext){setMode('error','Your browser does not support background Web Push.');return false;}
  if(Notification.permission!=='granted'){setMode('permission');return false;}
  const account=await session();
  if(!account?.user?.id){setMode('signin');return false;}
  setMode('connecting');
  try{
   const keyResponse=await fetch(BASE+'/public-key',{method:'GET',cache:'no-store'});
   if(!keyResponse.ok)throw Error('Could not get the push registration key.');
   const {publicKey}=await keyResponse.json();
   if(typeof publicKey!=='string'||publicKey.length<80)throw Error('Push registration key is invalid.');
   const registration=await navigator.serviceWorker.ready;
   let sub=await registration.pushManager.getSubscription();
   if(sub){
    const oldKey=sub.options?.applicationServerKey;
    const current=oldKey?new Uint8Array(oldKey):null;
    const wanted=toArray(publicKey);
    if(current&&(current.length!==wanted.length||current.some((v,i)=>v!==wanted[i]))){
     await sub.unsubscribe();sub=null;
    }
   }
   if(!sub)sub=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:toArray(publicKey)});
   if(!validEndpoint(sub))throw Error('The device returned an unsupported push endpoint.');
   const data=sub.toJSON(),api=client();
   if(!data?.keys?.p256dh||!data?.keys?.auth)throw Error('The browser subscription lacks encryption keys.');
   const row={user_id:account.user.id,endpoint:sub.endpoint,p256dh:data.keys.p256dh,auth_key:data.keys.auth,time_zone:tz(),water_times:prefs.slots,water_enabled:prefs.water,supplements_enabled:prefs.supplements,enabled:true,updated_at:new Date().toISOString()};
   const {error}=await api.from('fitnessdex_push_subscriptions').upsert(row,{onConflict:'user_id,endpoint'});
   if(error)throw Error('Could not save the device subscription.');
   connectedEndpoint=sub.endpoint;
   setMode('connected');
   return true;
  }catch(e){
   setMode('error',e?.message||'Connection failed.');
   return false;
  }
 })().finally(()=>{busy=null;});
 return busy;
}
window.fdPushConnect=connect;
window.fdPushSync=()=>{if(state()?.enabled)return connect();};
window.fdPushDisconnect=async()=>{
 const api=client();
 setMode('off');
 let unregistered=true;
 try{
  const reg=await navigator.serviceWorker.getRegistration('./');
  const sub=await reg?.pushManager?.getSubscription();
  if(sub){
   const current=await session();
   if(current?.user?.id){
    const {error}=await api.from('fitnessdex_push_subscriptions').delete().eq('user_id',current.user.id).eq('endpoint',sub.endpoint);
    if(error)unregistered=false;
   }
   if(!await sub.unsubscribe())unregistered=false;
  }
  connectedEndpoint='';
 }catch(e){unregistered=false;}
 if(!unregistered)setMode('off','This browser has stopped subscribing, but check cloud saving when reconnected.');
 return unregistered;
};
const handle=()=>{if(state()?.enabled&&'Notification' in window&&Notification.permission==='granted')void connect();else setMode('off');};

window.fdPushBackgroundTest=async()=>{
 if(mode!=='connected')return toast('Connect background push first, then try the test.');
 try{
  const account=await session();
  if(!account?.access_token)throw Error('Sign in to cloud saving to run a background test.');
  const registration=await navigator.serviceWorker.getRegistration('./');
  const sub=await registration?.pushManager?.getSubscription();
  if(!sub)throw Error('This device is not subscribed for background push.');
  const response=await fetch(BASE+'/test',{
   method:'POST',
   headers:{'Authorization':'Bearer '+account.access_token,'Content-Type':'application/json'},
   body:JSON.stringify({endpoint:sub.endpoint})
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(payload.error||'The server could not queue the test.');
  toast('Server test queued. Close FitnessDex; a notification should arrive in around 1–2 minutes.');
 }catch(e){toast('Background test: '+(e?.message||'failed'));}
};

window.addEventListener('fitnessdex:reminder-settings',handle);
window.addEventListener('online',handle);
window.addEventListener('focus',()=>{if(mode!=='connected')handle();});
window.addEventListener('fitnessdex:saved',()=>{if(mode==='connected')void connect();});
const api=client();
if(api?.auth?.onAuthStateChange){
 api.auth.onAuthStateChange((event,auth)=>{
  setTimeout(()=>{
   if(event==='SIGNED_OUT'){connectedEndpoint='';setMode('signin');return;}
   if(auth?.user&&state()?.enabled)void connect();
  },0);
 });
}
void handle();
})();
