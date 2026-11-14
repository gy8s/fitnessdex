/* FitnessDex v0.8.8: read-only Health Connect daily steps. */
(()=>{
'use strict';
const URL='https://ntepqkhftnnwtowpuggt.supabase.co/functions/v1/fitnessdex-steps';
const GOAL_KEY='fitnessdex-step-goal-v1';
const st={rows:[],devices:[],signed:false,loading:false,error:'',pair:'',goal:8000,live:null};
try{const n=Number(localStorage.getItem(GOAL_KEY));if([4000,6000,8000,10000,12000,15000].includes(n))st.goal=n;}catch(e){}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const nativeLink=token=>'intent://steps/connect?token='+encodeURIComponent(token)+'#Intent;scheme=fitnessdex;package=io.github.gy8s.fitnessdex.steps;end';
const nativeAndroid=()=>/Android/i.test(navigator.userAgent);
const fmt=n=>Number(n||0).toLocaleString('en-GB');
const api=()=>window.fdCloudClient?.();
const dateKey=x=>[x.getFullYear(),String(x.getMonth()+1).padStart(2,'0'),String(x.getDate()).padStart(2,'0')].join('-');
const nowKey=()=>dateKey(new Date());
const percent=n=>Math.min(100,Math.max(0,Math.round(100*n/st.goal)));
const official=()=>st.rows.find(r=>r.day===nowKey())?.steps??null;
const liveFresh=()=>{const v=st.live,at=Date.parse(v?.observed_at||'');return v?.day===nowKey()&&Number.isFinite(at)&&Date.now()-at<45000&&Date.now()>=at?v:null;};
const current=()=>{const n=official(),live=liveFresh();return live?Math.max(n||0,Number(live.estimated_daily_steps)||0):n;};
window.fdStepsLive=()=>liveFresh();
const lastSync=()=>st.rows.reduce((m,r)=>Math.max(m,Date.parse(r.synced_at)||0),0);
const syncedLabel=()=>{const n=lastSync();return n?new Date(n).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):'Never';};
const noData=()=>st.devices.length>0&&st.rows.length>0&&st.rows.every(r=>r.steps===0);
const last7=()=>{const now=new Date();return Array.from({length:7},(_,i)=>{const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()-6+i),day=dateKey(d);return {day,steps:st.rows.find(r=>r.day===day)?.steps??null};});};
async function session(){const c=api();if(!c)return null;const x=await c.auth.getSession();if(x.error)throw x.error;return x.data?.session||null;}
async function request(route,data={}){
 const auth=await session();if(!auth?.access_token)throw Error('Sign in under More → Cloud saving first.');
 const res=await fetch(URL+'/'+route,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+auth.access_token},body:JSON.stringify(data),cache:'no-store'});
 const body=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(body.error||'Steps service unavailable');
 return body;
}
async function load(){
 if(st.loading||!navigator.onLine)return;
 st.loading=true;st.error='';
 try{
  const auth=await session();st.signed=!!auth?.user;
  if(!st.signed){st.rows=[];st.devices=[];st.live=null;return;}
  const a=await Promise.all([api().from('fitnessdex_steps').select('day,steps,synced_at').order('day',{ascending:false}).limit(31),request('devices'),api().from('fitnessdex_live_steps').select('session_id,day,estimated_daily_steps,estimated_session_steps,observed_at').maybeSingle()]);
  if(a[0].error)throw a[0].error;
  st.rows=(a[0].data||[]).filter(r=>/^\d{4}-\d{2}-\d{2}$/.test(r.day)&&Number.isInteger(r.steps));
  st.devices=a[1].devices||[];
  if(a[2].error)throw a[2].error;
  st.live=a[2].data||null;
 }catch(e){st.error=e?.message||'Could not load steps';}
 finally{st.loading=false;if(tab==='steps'||tab==='home')render();window.dispatchEvent(new Event('fitnessdex:steps-updated'));}
}
window.fdStepsHome=()=>{
 const n=current();
 return '<button class="fd-steps-home" onclick="fdStepsOpen()"><span class="fd-steps-symbol" aria-hidden="true">↟</span><span><strong>Daily steps</strong><small>'+(n===null?'Not synced':fmt(n)+' steps today · '+fmt(st.goal)+' goal')+'</small>'+(n===null?'':'<div class="fd-step-progress"><span style="width:'+percent(n)+'%"></span></div>')+'</span><b aria-hidden="true">›</b></button>';
};
window.fdStepsView=()=>{
 const n=current(),seven=last7(),hits=seven.filter(x=>x.steps!==null&&x.steps>=st.goal).length,total=seven.reduce((a,x)=>a+(x.steps||0),0);
 const bars=seven.map(x=>'<div class="fd-step-day"><span class="fd-step-count">'+(x.steps===null?'—':fmt(x.steps))+'</span><div class="fd-step-bar"><span style="height:'+(x.steps===null?0:percent(x.steps))+'%" class="'+(x.steps!==null&&x.steps>=st.goal?'hit':'')+'"></span></div><small>'+new Date(x.day+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short'})+'</small></div>').join('');
 const devices=st.devices.map(d=>'<div class="fd-step-device"><span>Linked '+esc(new Date(d.created_at).toLocaleDateString('en-GB'))+(d.last_used_at?' · last synced '+esc(new Date(d.last_used_at).toLocaleDateString('en-GB')):' · awaiting first sync')+'</span><button onclick="fdStepsRevoke(\''+esc(d.id)+'\')">Unlink</button></div>').join('');
 return '<section class="fd-care-page fd-steps-page"><div class="fd-care-top"><button class="fd-care-back" onclick="navigate(\'more\')">‹ More</button><small>HEALTH CONNECT</small><h1>Daily steps</h1><p>Step totals from your phone, kept separate from exercise records.</p></div>'+
 '<div class="fd-steps-hero"><small>TODAY</small><div><strong>'+(n===null?'—':fmt(n))+'</strong><span> / '+fmt(st.goal)+' steps</span></div><div class="fd-care-gauge"><span style="width:'+percent(n||0)+'%"></span></div><p>'+(n===null?'Connect your Android companion to see steps.':n>=st.goal?'Daily target reached':fmt(st.goal-n)+' steps to your target')+'</p></div>'+
 (liveFresh()?'<p class="fd-step-live-label">Live phone sensor estimate · final total is reconciled with Health Connect</p>':'')+
 '<div class="fd-steps-sync-info"><strong>Last device upload:</strong> '+esc(syncedLabel())+'<small>Cloud totals refresh automatically while FitnessDex is open. Background uploads require the one-time Health Connect background permission; Android may delay them.</small></div>'+
 (noData()?'<p class="fd-step-error">All uploaded totals are zero. No step records reached FitnessDex. Open Health Connect → Data and access → Activity → Steps, and check Samsung Health has written records.</p>':'')+
 '<button class="fd-care-primary fd-start-movement" onclick="fdMovementOpen()">Start a walk, hike or run</button>'+ 
 '<div class="fd-steps-metrics"><div><b>'+fmt(total)+'</b><small>Last 7 days</small></div><div><b>'+hits+'/7</b><small>Target days</small></div></div>'+
 '<div class="fd-steps-chart"><div class="row"><h2>Last seven days</h2><span class="muted">Daily totals</span></div><div class="fd-steps-bars">'+bars+'</div></div>'+
 '<label class="fd-steps-goal-label" for="fd-steps-goal">Daily step goal</label><select id="fd-steps-goal" onchange="fdStepsSetGoal(this.value)">'+[4000,6000,8000,10000,12000,15000].map(v=>'<option value="'+v+'" '+(v===st.goal?'selected':'')+'>'+fmt(v)+' steps</option>').join('')+'</select>'+
 '<div class="fd-steps-pair"><strong>Connect your steps</strong><p>Install FitnessDex for Android once, then connect Health Connect inside the same app. Steps upload automatically when Android allows.</p>'+
 '<a class="fd-steps-apk" href="https://github.com/gy8s/fitnessdex/releases/download/fitnessdex-android-v0.2.2/app-debug.apk" target="_blank" rel="noopener noreferrer">Get the FitnessDex Android app ↗</a>'+
 '<p class="fd-step-connection">'+(st.devices.length?'✓ '+st.devices.length+' paired device(s)':st.signed?'No paired device yet':'Sign in to cloud saving first')+'</p>'+
 (st.signed?'<button class="fd-care-primary" onclick="fdStepsPair()">Connect Health Connect</button>':'<button class="fd-care-secondary" onclick="navigate(\'more\');fdMoreCloud()">Cloud saving sign-in</button>')+
 (st.pair?'<div class="fd-step-pair-token">'+(nativeAndroid()?'<a class="fd-care-primary fd-native-pair" href="'+esc(nativeLink(st.pair))+'">Open step setup inside FitnessDex</a>':'<p>Open this page on your Android phone to complete setup.</p>')+'<details class="fd-care-details"><summary>Manual pairing (fallback)</summary><label for="fd-step-token">Pairing code</label><textarea id="fd-step-token" rows="2" readonly>'+esc(st.pair)+'</textarea><button class="fd-care-secondary" onclick="fdStepsCopy()">Copy code</button><small>Upload-only private code. Never share it.</small></details></div>':'')+
 (devices?'<details class="fd-care-details"><summary>Paired devices</summary>'+devices+'</details>':'')+
 '<button class="fd-care-secondary" onclick="fdStepsRefresh()">Refresh cloud totals</button>'+(st.error?'<p class="fd-step-error">'+esc(st.error)+'</p>':'')+'</div>'+
 '<p class="fd-care-note">Health Connect aggregates multiple step sources to avoid duplicated steps. No step XP is awarded yet, so previously logged walking cannot be rewarded twice.</p></section>';
};
window.fdStepsSetGoal=value=>{const n=Number(value);if(![4000,6000,8000,10000,12000,15000].includes(n))return;st.goal=n;try{localStorage.setItem(GOAL_KEY,String(n));}catch(e){}render();};
window.fdStepsPair=async()=>{try{st.pair=(await request('pair')).token;await load();toast('Tap Open step setup inside FitnessDex to connect.');}catch(e){st.error=e?.message||'Pairing failed';render();}};
window.fdStepsCopy=async()=>{if(!st.pair)return;try{await navigator.clipboard.writeText(st.pair);toast('Pairing code copied.');}catch(e){document.getElementById('fd-step-token')?.select();toast('Select and copy the code.');}};
window.fdStepsRevoke=async id=>{if(!confirm('Unlink this device? Previous step totals remain saved.'))return;try{await request('revoke',{id});st.devices=st.devices.filter(d=>d.id!==id);st.pair='';render();toast('Device unlinked.');}catch(e){toast(e?.message||'Could not unlink');}};
window.fdStepsRefresh=()=>{void load();};
window.fdStepsOpen=()=>{navigate('steps');void load();};
const originalRender=render;
render=function(){
 if(tab==='steps'){
  document.getElementById('app').innerHTML=window.fdStepsView();
  document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab==='more'));
  document.body.dataset.fdTab='steps';return;
 }
 originalRender();
};
const c=api();
if(c)c.auth.onAuthStateChange((event,auth)=>{
 if(event==='SIGNED_OUT'){st.signed=false;st.rows=[];st.devices=[];st.live=null;st.pair='';if(tab==='steps'||tab==='home')render();}
 if(auth?.user&&['INITIAL_SESSION','SIGNED_IN'].includes(event))setTimeout(()=>void load(),0);
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&['home','steps'].includes(tab))void load();});
window.addEventListener('focus',()=>{if(['home','steps'].includes(tab))void load();});
setInterval(()=>{if(!document.hidden&&['home','steps','movement'].includes(tab))void load();},10000);
if(tab==='home')render();
void load();
})();
