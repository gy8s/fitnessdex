/* FitnessDex cloud-save bridge v0.5.3 — local saves remain the primary fallback. */
(() => {
'use strict';
const URL = 'https://ntepqkhftnnwtowpuggt.supabase.co';
const KEY = 'sb_publishable_d_Qpc2_RyU9crexd9n5iTw_ie6OcUxw';
const STORAGE = 'fitnessdex-cloud-sync-';
const BACKUP = 'fitnessdex-cloud-before-restore';
const nav = document.querySelector('main .nav');
if (!nav) return;
const section = document.createElement('section');
section.id = 'fitnessdex-cloud';
section.style.cssText = 'margin:10px auto 14px;padding:12px 16px;border:1px solid #2a3950;border-radius:12px;background:#151d2c;color:#f2f5f9;font:14px system-ui,sans-serif';
document.getElementById('app')?.insertAdjacentElement('afterend', section);
const esc = s => String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fingerprint = s => JSON.stringify({logs:s?.logs||[],claimed:s?.claimed||[],recoveryDays:s?.recoveryDays||[],active:s?.v3?.active||[],completed:s?.v3?.completed||[],hunts:s?.v4?.hunts||[],serial:s?.v3?.nextSerial||0,workouts:s?.v5?.workouts||[],dismissed:s?.v5?.dismissed||[],habits:{baselineWeek:{alcohol:s?.v6?.baselineWeek?.alcohol??null,smoking:s?.v6?.baselineWeek?.smoking??null,takeaway:s?.v6?.baselineWeek?.takeaway??null},days:s?.v6?.days||[],awards:s?.v6?.awards||[]},campaigns:s?.v7?.campaigns||[],progression:{tracks:s?.v8?.tracks||[],sessions:s?.v8?.sessions||[]},dailyCare:{water:{baseGoal:s?.v9?.water?.baseGoal??2000,goals:s?.v9?.water?.goals||[],entries:s?.v9?.water?.entries||[]},supplements:{items:s?.v9?.supplements?.items||[],taken:s?.v9?.supplements?.taken||[]}}});
const meaningful = s => !!(s?.logs?.length || s?.claimed?.length || s?.recoveryDays?.length || s?.v3?.completed?.length || s?.v4?.hunts?.length || s?.v5?.workouts?.length || s?.v6?.days?.length || s?.v6?.awards?.length || Object.values(s?.v6?.baselineWeek||{}).some(x=>x!=null) || s?.v7?.campaigns?.length || s?.v8?.tracks?.length || s?.v8?.sessions?.length || s?.v9?.water?.entries?.length || s?.v9?.water?.goals?.length || (s?.v9?.water?.baseGoal??2000)!==2000 || s?.v9?.supplements?.items?.length || s?.v9?.supplements?.taken?.length);
let client, uid=null, email='', serverStamp=null, cloudData=null, cloudStamp=null, paused=false, choice=false, busy=false, dirty=false, timer=null, epoch=0;
let status='Saved on this device. Sign in for automatic cloud backups.';
const buttonStyle='background:#27344a;border:1px solid #3b4c64;color:#fff;padding:7px 10px;border-radius:8px;cursor:pointer;margin:3px;font:inherit';
function setStatus(msg){status=msg;window.fdSyncStatus?.(msg);draw();}
function draw(){
 if(!client){section.textContent='Cloud saving unavailable. Local saving still works.';return;}
 section.innerHTML='<div style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap"><div><b>☁ Cloud saves</b><div id="fd-sync-status" style="color:#adc0d5;font-size:12px;margin-top:5px">'+esc(status)+'</div></div><div id="fd-controls"></div></div><div id="fd-extra"></div>';
 const controls=section.querySelector('#fd-controls');
 if(uid){
   controls.innerHTML='<span style="color:#adc0d5;font-size:12px">'+esc(email)+'</span><button style="'+buttonStyle+'" id="fd-sync">Sync now</button><button style="'+buttonStyle+'" id="fd-logout">Sign out</button>';
   section.querySelector('#fd-sync').onclick=()=>{dirty=true;queue(0)};
   section.querySelector('#fd-logout').onclick=signOut;
 } else {
   controls.innerHTML='<button style="'+buttonStyle+'" id="fd-login">Connect cloud save</button>';
   section.querySelector('#fd-login').onclick=emailForm;
 }
 if(choice)askChoice();
}
function emailForm(){
 const extra=section.querySelector('#fd-extra');
 extra.innerHTML='<form id="fd-email-form" style="margin-top:12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center"><label for="fd-email">Email</label><input id="fd-email" type="email" required autocomplete="email" placeholder="you@example.com" style="padding:9px;border-radius:8px;border:1px solid #506078;background:#0b101a;color:#fff;max-width:100%"><button style="'+buttonStyle+'">Send sign-in link</button></form><p style="font-size:12px;color:#adc0d5">Check your email, open the link, then return to FitnessDex.</p>';
 extra.querySelector('form').onsubmit=async e=>{
  e.preventDefault();
  const mail=extra.querySelector('input').value.trim();
  const btn=extra.querySelector('button');btn.disabled=true;
  const r=await client.auth.signInWithOtp({email:mail,options:{emailRedirectTo:location.origin+location.pathname}});
  btn.disabled=false;
  setStatus(r.error?'Could not send email: '+r.error.message:'Sign-in email sent. Open the link to connect.');
 };
 extra.querySelector('input').focus();
}
function askChoice(){
 const x=section.querySelector('#fd-extra');if(!x)return;
 x.innerHTML='<p style="color:#adc0d5">Two different saves exist. Choose carefully; your device save is backed up before a cloud restore.</p><button style="'+buttonStyle+'" id="fd-device">Keep this device ('+S.logs.length+' records)</button><button style="'+buttonStyle+'" id="fd-cloud">Use cloud ('+(cloudData?.logs?.length||0)+' records)</button><button style="'+buttonStyle+'" id="fd-later">Decide later</button>';
 x.querySelector('#fd-device').onclick=()=>{serverStamp=cloudStamp;choice=false;paused=false;dirty=true;queue(0)};
 x.querySelector('#fd-cloud').onclick=()=>{choice=false;paused=false;if(restoreCloud(cloudData)){serverStamp=cloudStamp;remember(cloudStamp);setStatus('Cloud progress restored to this device.')}};
 x.querySelector('#fd-later').onclick=()=>{choice=false;paused=true;setStatus('Cloud sync paused. Device progress is safe. Refresh to choose again.')};
}
function restoreCloud(data){
 if(!data||!validBackup(data)){setStatus('Cloud data failed validation. Nothing was overwritten.');return false;}
 try{localStorage.setItem(BACKUP,JSON.stringify(S))}catch(e){setStatus('Cannot back up your current save. Cloud restore cancelled.');return false;}
 const next={...blankState(),...data};
 next.claimed=Array.isArray(next.claimed)?next.claimed:[];
 next.v3=next.v3||{active:[],completed:[],nextSerial:0};
 next.v4=next.v4||{hunts:[],lastResult:null};
 const before=JSON.stringify(S);
 paused=true;S=next;resetDerived();reconcileCompleted();ensureBoard();
 const ok=save();if(!ok){S=JSON.parse(before);resetDerived();}render();paused=false;
 return ok;
}
function remember(stamp){
 serverStamp=stamp;
 try{localStorage.setItem(STORAGE+uid,fingerprint(S))}catch(e){}
 dirty=false;
}
async function readCloud(account){
 const r=await client.from('fitnessdex_saves').select('save_data,updated_at').eq('user_id',account).maybeSingle();
 if(r.error)throw r.error;
 if(r.data && !validBackup(r.data.save_data))throw Error('Cloud record could not be validated');
 return r.data;
}
async function signOut(){
 const mine=epoch, wasPaused=paused;
 paused=true;clearTimeout(timer);
 try{
  const result=await client.auth.signOut();
  if(mine!==epoch)return;
  if(result.error)throw result.error;
  authChanged(null);
 }catch(e){
  if(mine!==epoch)return;
  paused=wasPaused;
  setStatus('Could not sign out: '+(e.message||'connection error'));
  if(dirty&&!paused)queue(0);
 }
}
function authChanged(session){
 const account=session?.user?.id||null;
 if(uid===account && account)return;
 const mine=++epoch;
 uid=account;email=session?.user?.email||'';serverStamp=null;cloudData=null;cloudStamp=null;
 choice=false;paused=false;dirty=false;busy=Boolean(account);clearTimeout(timer);
 if(!uid){setStatus('Local saving only. Sign in to back up online.');return;}
 setStatus('Signed in. Checking your cloud progress...');
 // Invalidate old requests now, and read outside Supabase's auth callback.
 setTimeout(()=>checkCloud(account,mine),0);
}
async function checkCloud(account,mine){
 if(mine!==epoch)return;
 try{
  const row=await readCloud(account);if(mine!==epoch)return;
  cloudData=row?.save_data||null;cloudStamp=row?.updated_at||null;
  const localFp=fingerprint(S),remoteFp=fingerprint(cloudData);
  let last=null;try{last=localStorage.getItem(STORAGE+uid)}catch(e){}
  if(!row){serverStamp=null;dirty=true;setStatus('First cloud save: uploading device progress...');}
  else if(localFp===remoteFp){remember(cloudStamp);setStatus('Cloud save up to date ✓');}
  else if(!meaningful(S)||(last===localFp && last!==remoteFp)){
    if(restoreCloud(cloudData)){remember(cloudStamp);setStatus('Cloud progress loaded ✓');}
  }else if(last===remoteFp && last!==localFp){
    serverStamp=cloudStamp;dirty=true;setStatus('New activity found on this device. Saving...');
  }else{choice=true;paused=true;setStatus('Both this device and cloud contain different progress. Choose which to keep.');}
 }catch(e){
  if(mine===epoch){paused=true;setStatus('Cloud unavailable: '+(e.message||'connection error')+'. Device save is safe.');}
 }finally{
  if(mine===epoch){busy=false;draw();if(dirty&&!paused)queue(0);}
 }
}
async function upload(){
 if(!uid||paused||choice||busy||!dirty||!navigator.onLine)return;
 const account=uid, mine=epoch;
 busy=true;setStatus('Saving to cloud...');
 const snapshot=JSON.parse(JSON.stringify(S));
 try{
  const remote=await readCloud(account);if(mine!==epoch||paused)return;
  if(remote && (!serverStamp||remote.updated_at!==serverStamp)){
    cloudData=remote.save_data;cloudStamp=remote.updated_at;paused=true;choice=true;
    setStatus('Cloud changed elsewhere. Choose which progress to keep.');return;
  }
  const stamp=new Date(Math.max(Date.now(),serverStamp?Date.parse(serverStamp)+2:0)).toISOString();
  let r;
  if(remote){
    r=await client.from('fitnessdex_saves').update({save_data:snapshot,updated_at:stamp}).eq('user_id',account).eq('updated_at',remote.updated_at).select('updated_at');
  }else{
    r=await client.from('fitnessdex_saves').insert({user_id:account,save_data:snapshot,updated_at:stamp}).select('updated_at');
  }
  if(mine!==epoch)return;
  if(r.error)throw r.error;
  if(remote&&r.data?.length!==1)throw Error('Concurrent update detected; nothing overwritten.');
  serverStamp=r.data?.[0]?.updated_at||stamp;
  try{localStorage.setItem(STORAGE+uid,fingerprint(snapshot))}catch(e){}
  dirty=fingerprint(S)!==fingerprint(snapshot);
  setStatus(dirty?'Cloud saved. More local changes pending…':'Saved to cloud ✓');
 }catch(e){
  if(mine===epoch){dirty=true;setStatus('Cloud save pending: '+(e.message||'connection issue')+'. Workouts remain on this device.');}
 }finally{
  if(mine===epoch){busy=false;if(dirty&&!paused&&navigator.onLine)queue(7000);}
 }
}
function queue(delay=1600){if(!uid||paused||choice)return;clearTimeout(timer);timer=setTimeout(upload,delay);}
window.addEventListener('fitnessdex:saved',()=>{if(uid&&!paused){dirty=true;queue();}});
window.addEventListener('online',()=>{if(dirty)queue(500);});
if(!window.supabase?.createClient){draw();return;}
client=window.supabase.createClient(URL,KEY,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true}});
window.fdCloudClient=()=>client;
draw();
client.auth.onAuthStateChange((event,session)=>{
 if(['INITIAL_SESSION','SIGNED_IN','SIGNED_OUT'].includes(event))authChanged(session);
});
})();
