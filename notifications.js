/* FitnessDex v0.8.4 — opt-in foreground reminders. No cloud schema or workout data changes. */
(()=>{
'use strict';
const KEY='fitnessdex-reminders-v1';
const SENT_KEY='fitnessdex-reminders-delivered-v1';
const TIME=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DEFAULT={enabled:false,water:true,supplements:true,slots:['10:00','14:00','18:00']};
const supported=()=>!!(window.isSecureContext&&'Notification' in window&&'serviceWorker' in navigator);
function read(){
 try{
  const value=JSON.parse(localStorage.getItem(KEY)||'null');
  if(!value||typeof value!=='object')return {...DEFAULT,slots:[...DEFAULT.slots]};
  const slots=Array.isArray(value.slots)&&value.slots.length===3&&value.slots.every(x=>typeof x==='string'&&TIME.test(x))&&new Set(value.slots).size===3?value.slots:DEFAULT.slots;
  return {enabled:value.enabled===true,water:value.water!==false,supplements:value.supplements!==false,slots:[...slots]};
 }catch(e){return {...DEFAULT,slots:[...DEFAULT.slots]};}
}
function write(next){
 try{localStorage.setItem(KEY,JSON.stringify(next));return true;}
 catch(e){toast('Could not save reminder settings on this device.');return false;}
}
function seen(key){
 try{const raw=JSON.parse(localStorage.getItem(SENT_KEY)||'{}');return raw&&raw.day===today()&&!!raw[key];}
 catch(e){return false;}
}
function mark(key){
 try{
  const raw=JSON.parse(localStorage.getItem(SENT_KEY)||'{}');
  const state=raw&&raw.day===today()?raw:{day:today()};
  state[key]=true;
  localStorage.setItem(SENT_KEY,JSON.stringify(state));
 }catch(e){}
}
const mins=str=>Number(str.slice(0,2))*60+Number(str.slice(3,5));
const localMinutes=()=>{const d=new Date();return d.getHours()*60+d.getMinutes();};
function inWindow(str){
 if(!TIME.test(str))return false;
 const offset=localMinutes()-mins(str);
 return offset>=0&&offset<=45;
}
function waterPending(){
 const d=today(),w=S.v9?.water;
 if(!w)return true;
 const goal=w.goals?.find(x=>x.date===d)?.ml||w.baseGoal||2000;
 const rows=(w.entries||[]).filter(x=>x.date===d);
 if(rows.reduce((sum,x)=>sum+(Number(x.ml)||0),0)>=goal)return false;
 // Do not nudge just after someone has logged a drink.
 return !rows.some(x=>{const dt=Date.parse(x.at);return Number.isFinite(dt)&&dt<=Date.now()&&Date.now()-dt<=75*60000;});
}
function outstandingSupplements(){
 const d=today(),weekday=new Date(d+'T12:00:00').getDay(),care=S.v9?.supplements;
 if(!care)return [];
 return (care.items||[]).filter(x=>{
  if(!x||!TIME.test(x.time||'')||!Array.isArray(x.days)||!x.days.includes(weekday))return false;
  if(x.createdAt&&String(x.createdAt).slice(0,10)>d)return false;
  if(x.archivedAt&&String(x.archivedAt).slice(0,10)<=d)return false;
  return !(care.taken||[]).some(t=>t.date===d&&t.supplementId===x.id);
 });
}
async function notify(title,body,section,tag){
 if(!supported()||Notification.permission!=='granted')throw Error('Notification permission is not available.');
 const registration=await navigator.serviceWorker.getRegistration('./');
 if(!registration||!registration.active||typeof registration.showNotification!=='function')throw Error('The FitnessDex notification service is not ready. Try reopening the app.');
 await registration.showNotification(title,{body,icon:'./icons/icon-192.png',badge:'./icons/icon-192.png',tag:'fitnessdex-'+tag,data:{section}});
}
let working=false;
async function check(){
 const s=read();
 if(working||!s.enabled||!supported()||Notification.permission!=='granted'||window.fdPushIsConnected?.())return;
 working=true;
 try{
  if(s.water&&waterPending()){
   for(const slot of s.slots){
    const key='water-'+slot;
    if(!inWindow(slot)||seen(key))continue;
    try{await notify('Time for a water check-in','Log some water if you have had a drink.','water',key);mark(key);}
    catch(e){break;}
   }
  }else if(s.water){
   for(const slot of s.slots)if(inWindow(slot))mark('water-'+slot);
  }
  if(s.supplements){
   const rows=outstandingSupplements().filter(x=>inWindow(x.time)&&!seen('supp-'+x.id+'-'+x.time));
   // One discreet check-in covers multiple routines due at the same time.
   const groups=new Map();
   for(const item of rows){if(!groups.has(item.time))groups.set(item.time,[]);groups.get(item.time).push(item);}
   for(const [time,items] of groups){
    try{
     await notify('Supplement check-in',items.length===1?'Your scheduled supplement is due.':'You have '+items.length+' scheduled supplements to check in.','supplements','supp-'+time);
     for(const item of items)mark('supp-'+item.id+'-'+time);
    }catch(e){break;}
   }
  }
 }finally{working=false;}
}
function view(){
 const s=read(),available=supported(),permission=available?Notification.permission:'unsupported',active=s.enabled&&permission==='granted';
 const slots=s.slots.map((t,i)=>'<label>Reminder '+(i+1)+'<input type="time" id="fd-reminder-slot-'+i+'" value="'+t+'"></label>').join('');
 return '<section class="fd-care-page fd-reminders-page"><div class="fd-care-top"><button class="fd-care-back" onclick="navigate(\'more\')">‹ More</button><small>DAILY CARE</small><h1>Reminders</h1><p>Gentle prompts to keep your routines on track. Nothing is enabled without your permission.</p></div>'+
 '<div class="fd-reminder-status '+(active?'is-on':'')+'"><span class="fd-reminder-status-icon" aria-hidden="true">'+(active?'✓':'◌')+'</span><span><strong>'+(active?'Reminders enabled':permission==='denied'?'Notifications blocked':available?'Reminders off':'Not supported here')+'</strong><small>'+(active?'On this device · while FitnessDex is running':permission==='denied'?'Allow notifications in Android or browser settings to enable them':available?'You are in control of when you receive them':'This browser cannot display FitnessDex system notifications')+'</small></span></div>'+
 '<div class="fd-reminder-panel"><h2>What should I remind you about?</h2><label class="fd-reminder-check"><input type="checkbox" id="fd-reminder-water" '+(s.water?'checked':'')+'><span><strong>Water</strong><small>Skip when your daily target is met or you drank recently</small></span></label>'+
 '<div class="fd-reminder-times">'+slots+'</div>'+
 '<label class="fd-reminder-check"><input type="checkbox" id="fd-reminder-supp" '+(s.supplements?'checked':'')+'><span><strong>Supplements</strong><small>Use the times and days from your registered routines. No time means no reminder.</small></span></label>'+
 '<button class="fd-care-secondary" onclick="fdReminderSave()">Save reminder preferences</button></div>'+
 (active?'<button class="fd-care-primary" onclick="fdReminderTest()">Send test notification</button><button class="fd-care-muted" onclick="fdReminderDisable()">Turn off reminders</button>':
 '<button class="fd-care-primary" '+(!available||permission==='denied'?'disabled':'')+' onclick="fdReminderEnable()">Enable notifications</button>')+
 '<div class="fd-reminder-push"><strong>Background delivery</strong><p id="fd-background-status">'+(window.fdPushStatus?.().text||'Sign in to cloud saving to connect.')+'</p>'+(active?'<button class="fd-care-secondary" onclick="fdPushConnect()">Connect / refresh background push</button>':'')+'</div>'+ 
 '<p class="fd-care-note">When background push is connected, FitnessDex can notify you while closed. Otherwise these are foreground reminders: FitnessDex needs to be running to check the schedule. They are not guaranteed with the app closed, the phone asleep or Android restricting background activity. Reliable closed-app delivery requires a future push service. This feature does not send your health or supplement records to any notification provider.</p></section>';
}
window.fdReminderStatus=()=>({config:read(),permission:supported()?Notification.permission:'unsupported'});
window.fdReminderView=view;
window.fdReminderOpen=()=>navigate('notifications');
window.fdReminderSave=()=>{
 const slots=[0,1,2].map(i=>document.getElementById('fd-reminder-slot-'+i)?.value||'');
 if(slots.some(x=>!TIME.test(x))||new Set(slots).size!==3)return toast('Choose three different, valid reminder times.');
 const curr=read(),next={...curr,water:!!document.getElementById('fd-reminder-water')?.checked,supplements:!!document.getElementById('fd-reminder-supp')?.checked,slots:slots.sort()};
 if(write(next)){window.dispatchEvent(new Event('fitnessdex:reminder-settings'));render();toast('Reminder preferences saved on this device.');}
};
window.fdReminderEnable=async()=>{
 if(!supported())return toast('System notifications are not available in this browser.');
 try{
  const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
  if(permission!=='granted')return render();
  const reg=await navigator.serviceWorker.getRegistration('./');
  if(!reg||!reg.active||typeof reg.showNotification!=='function')return toast('Reopen FitnessDex once its offline service is ready, then try again.');
  if(write({...read(),enabled:true})){render();window.dispatchEvent(new Event('fitnessdex:reminder-settings'));toast('Notifications enabled. Connecting background push when cloud saving is signed in.');}
 }catch(e){toast('Could not enable notifications: '+(e.message||'device error'));}
};
window.fdReminderDisable=async()=>{
 if(write({...read(),enabled:false})){await window.fdPushDisconnect?.();render();toast('FitnessDex reminders turned off on this device.');}
};
window.fdReminderTest=async()=>{
 if(!read().enabled)return toast('Enable reminders first.');
 try{await notify('FitnessDex notifications are working','You will only be reminded about the routines you enable.','water','test');toast('Test notification sent.');}
 catch(e){toast('Could not send notification: '+(e.message||'device error'));}
};
const previousRender=render;
render=function(){
 if(tab==='notifications'){
  document.getElementById('app').innerHTML=view();
  document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab==='more'));
  document.body.dataset.fdTab='notifications';
  return;
 }
 previousRender();
};
function openSection(section){
 if(section==='water')window.fdCareWater?.();
 else if(section==='supplements')window.fdCareSupplements?.();
}
if(navigator.serviceWorker){
 navigator.serviceWorker.addEventListener('message',event=>{
  if(event.data?.type==='fitnessdex:reminder-open')openSection(event.data.section);
 });
}
try{
 const section=new URLSearchParams(location.search).get('fd-reminder');
 if(['water','supplements'].includes(section)){
  // App-level history() is a separate function; opening the section requires no URL mutation.
  openSection(section);
 }
}catch(e){}
setInterval(()=>{void check();},60000);
window.addEventListener('focus',()=>{void check();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void check();});
})();
