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
let cloudCheckFailed=false, choiceDeferred=false, cloudInvalid=false, savedInvalidCopy=false;
let status='Saved on this device. Sign in for automatic cloud backups.';
const buttonStyle='background:#27344a;border:1px solid #3b4c64;color:#fff;padding:7px 10px;border-radius:8px;cursor:pointer;margin:3px;font:inherit';
function setStatus(msg){status=msg;window.fdSyncStatus?.(msg);draw();}
function draw(){
 if(!client){section.textContent='Cloud saving unavailable. Local saving still works.';return;}
 section.innerHTML='<div style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap"><div><b>☁ Cloud saves</b><div id="fd-sync-status" style="color:#adc0d5;font-size:12px;margin-top:5px">'+esc(status)+'</div></div><div id="fd-controls"></div></div><div id="fd-extra"></div>';
 const controls=section.querySelector('#fd-controls');
 if(uid){
   controls.innerHTML='<span style="color:#adc0d5;font-size:12px">'+esc(email)+'</span><button style="'+buttonStyle+'" id="fd-sync">Sync now</button><button style="'+buttonStyle+'" id="fd-logout">Sign out</button>';
   section.querySelector('#fd-sync').onclick=syncNow;
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
 const button=(id,label)=>'<button style="'+buttonStyle+'" id="'+id+'">'+label+'</button>';
 if(cloudInvalid){
  const problem=backupProblem(cloudData)||'The cloud backup could not be opened.';
  x.innerHTML='<p style="color:#adc0d5">'+esc(problem)+' Save a copy before replacing it with your device progress.</p>'
   +button('fd-copy-cloud','Save cloud backup file')
   +(savedInvalidCopy?button('fd-device','Replace cloud with this device'):'')
   +button('fd-later','Decide later');
  x.querySelector('#fd-copy-cloud').onclick=saveInvalidCopy;
 }else{
  x.innerHTML='<p style="color:#adc0d5">Two different saves exist. Your device save is backed up before a cloud restore.</p>'
   +button('fd-device','Keep this device ('+S.logs.length+' records)')
   +button('fd-cloud','Use cloud ('+(cloudData?.logs?.length||0)+' records)')
   +button('fd-later','Decide later');
  x.querySelector('#fd-cloud').onclick=()=>{
   if(restoreCloud(cloudData)){
    choice=false;paused=false;remember(cloudStamp);setStatus('Cloud progress restored to this device.');
   }
  };
 }
 const keep=x.querySelector('#fd-device');
 if(keep)keep.onclick=()=>{
  if(cloudInvalid&&(!savedInvalidCopy||!confirm('Replace the cloud backup with the progress saved on this device?')))return;
  serverStamp=cloudStamp;choice=false;paused=false;dirty=true;queue(0);
 };
 x.querySelector('#fd-later').onclick=()=>{
  choice=false;choiceDeferred=true;paused=true;
  setStatus('Cloud sync paused. Tap Sync now to revisit your choice.');
 };
}
async function saveInvalidCopy(){
 const mine=epoch,stamp=cloudStamp;
 try{
  const saved=await exportBlob(JSON.stringify(cloudData,null,2),'FitnessDex_cloud_recovery_'+today()+'.json');
  if(saved&&mine===epoch&&stamp===cloudStamp&&choice){
   savedInvalidCopy=true;draw();
  }
 }catch{
  if(mine===epoch&&choice)setStatus('Could not save a cloud recovery file. Your device save is safe.');
 }
}
function offerCloudChoice(row,message){
 cloudData=row.save_data;cloudStamp=row.updated_at;
 cloudInvalid=!validBackup(cloudData);savedInvalidCopy=false;
 paused=true;choice=true;
 setStatus(cloudInvalid?'Cloud backup needs recovery. Your device save is safe.':message);
}
function restoreCloud(data){
 if(!data||!validBackup(data)){setStatus('Cloud data failed validation. Nothing was overwritten.');return false;}
 try{localStorage.setItem(BACKUP,JSON.stringify(S))}catch(e){setStatus('Cannot back up your current save. Cloud restore cancelled.');return false;}
 const next=completeProfile(JSON.parse(JSON.stringify(data)));
 const before=JSON.stringify(S);
 paused=true;
 let ok=false;
 try{
  S=next;resetDerived();reconcileCompleted();ensureBoard();
  ok=save(true);
 }catch{
  // Keep the device save available if preparing the restore fails.
 }finally{
  if(!ok){S=JSON.parse(before);resetDerived();}
 }
 if(ok)render();
 else setStatus('Cloud restore could not be saved. Your device save is safe.');
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
 choice=false;paused=false;cloudCheckFailed=false;choiceDeferred=false;cloudInvalid=false;savedInvalidCopy=false;dirty=false;busy=false;clearTimeout(timer);
 if(!uid){setStatus('Local saving only. Sign in to back up online.');return;}
 // Invalidate old requests now, and read outside Supabase's auth callback.
 startCloudCheck(mine);
}
function startCloudCheck(mine=epoch){
 if(!uid||busy||choice)return;
 const account=uid;
 busy=true;paused=false;cloudCheckFailed=false;choiceDeferred=false;
 clearTimeout(timer);
 setStatus('Checking your cloud progress...');
 setTimeout(()=>checkCloud(account,mine),0);
}
function syncNow(){
 if(cloudCheckFailed||choiceDeferred){startCloudCheck();return;}
 if(!busy&&!paused&&!choice){dirty=true;queue(0);}
}
async function checkCloud(account,mine){
 if(mine!==epoch)return;
 try{
  const row=await readCloud(account);if(mine!==epoch||paused)return;
  if(row&&!validBackup(row.save_data)){
   offerCloudChoice(row,'');
   return;
  }
  cloudData=row?.save_data||null;cloudStamp=row?.updated_at||null;
  const localFp=fingerprint(S),remoteFp=fingerprint(cloudData);
  let last=null;try{last=localStorage.getItem(STORAGE+uid)}catch(e){}
  if(!row){serverStamp=null;dirty=true;setStatus('First cloud save: uploading device progress...');}
  else if(localFp===remoteFp){remember(cloudStamp);setStatus('Cloud save up to date ✓');}
  else if(!meaningful(S)||(last===localFp && last!==remoteFp)){
    if(restoreCloud(cloudData)){paused=false;remember(cloudStamp);setStatus('Cloud progress loaded ✓');}
   else choice=true;
  }else if(last===remoteFp && last!==localFp){
    serverStamp=cloudStamp;dirty=true;setStatus('New activity found on this device. Saving...');
  }else offerCloudChoice(row,'Both this device and cloud contain different progress. Choose which to keep.');
 }catch(e){
  if(mine===epoch){paused=true;cloudCheckFailed=true;setStatus('Cloud unavailable: '+(e.message||'connection error')+'. Device save is safe.');}
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
  if(!validBackup(snapshot)){
   dirty=false;
   setStatus('Device backup could not be validated. '+(backupProblem(snapshot)||'Your device save is still available.'));
   return;
  }
  const expected=serverStamp;
  const stamp=new Date(Math.max(Date.now(),expected?Date.parse(expected)+2:0)).toISOString();
  // The timestamp guard makes the common path a single write. Read the
  // remote save only if another device changed or created it.
  const table=client.from('fitnessdex_saves');
  const r=expected
   ? await table.update({save_data:snapshot,updated_at:stamp}).eq('user_id',account).eq('updated_at',expected).select('updated_at')
   : await table.insert({user_id:account,save_data:snapshot,updated_at:stamp}).select('updated_at');
  if(mine!==epoch||paused)return;
  const createdElsewhere=!expected&&r.error?.code==='23505';
  if(r.error&&!createdElsewhere)throw r.error;
  if(createdElsewhere||r.data?.length!==1){
   const remote=await readCloud(account);
   if(mine!==epoch||paused)return;
   if(remote)offerCloudChoice(remote,'Cloud changed elsewhere. Choose which progress to keep.');
   else{
    serverStamp=null;
    setStatus('Cloud backup changed. Retrying from the device save.');
   }
   return;
  }
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
window.addEventListener('online',()=>{if(cloudCheckFailed)startCloudCheck();else if(dirty)queue(500);});
if(!window.supabase?.createClient){draw();return;}
client=window.supabase.createClient(URL,KEY,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true}});
window.fdCloudClient=()=>client;
draw();
client.auth.onAuthStateChange((event,session)=>{
 if(['INITIAL_SESSION','SIGNED_IN','SIGNED_OUT'].includes(event))authChanged(session);
});
})();
