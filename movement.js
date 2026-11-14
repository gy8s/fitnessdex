/* FitnessDex v0.9.1 — independent walking, hiking and running sessions. */
(()=>{
'use strict';
const st={sessions:[],segments:[],signed:false,busy:false,loading:false,error:'',loaded:false};
const client=()=>window.fdCloudClient?.();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const fmt=n=>Number(n||0).toLocaleString('en-GB');
const label={walk:'Walk',hike:'Hike',run:'Run'};
const nativeAndroid=()=>/Android/i.test(navigator.userAgent);
const sensorLink=id=>'intent://steps/live?session='+encodeURIComponent(id)+'#Intent;scheme=fitnessdex;package=io.github.gy8s.fitnessdex.steps;end';
const liveFor=record=>{const snap=window.fdStepsLive?.();return snap?.session_id===record.id?snap:null;};
const ms=t=>{const x=Date.parse(t||'');return Number.isFinite(x)?x:0;};
const clock=n=>{n=Math.max(0,Math.floor(n/1000));const h=Math.floor(n/3600),m=Math.floor(n%3600/60),s=n%60;return [h,m,s].map(v=>String(v).padStart(2,'0')).join(':');};
const active=()=>st.sessions.find(x=>x.state==='active'||x.state==='paused')||null;
const bySession=id=>st.segments.filter(x=>x.session_id===id).sort((a,b)=>ms(a.started_at)-ms(b.started_at));
const duration=(record,at=Date.now())=>bySession(record.id).reduce((sum,x)=>{
 const start=ms(x.started_at),end=x.ended_at?ms(x.ended_at):record.state==='active'?at:start;
 return sum+Math.max(0,end-start);
},0);
const measured=record=>{
 const segments=bySession(record.id);
 if(!segments.length)return {steps:null,partial:true};
 let steps=0,partial=false;
 for(const s of segments){if(s.steps===null||s.steps===undefined)partial=true;else steps+=Number(s.steps)||0;}
 return {steps:partial?steps:steps,partial};
};
function updateLive(){
 const x=active(),el=document.getElementById('fd-move-steps'),text=document.getElementById('fd-move-steps-label');
 if(!x||!el||!text)return;
 const l=liveFor(x),s=measured(x);
 el.textContent=l?fmt(Math.max(s.steps||0,Number(l.estimated_session_steps)||0)):s.steps===null?'—':fmt(s.steps);
 text.textContent=l?'Live step estimate':s.partial?'Steps pending Health Connect sync':'Steps from Health Connect';
}
const when=t=>new Date(t).toLocaleDateString('en-GB',{day:'numeric',month:'short'});
const listTitle=s=>label[s.kind]||'Movement';
const asyncLoading=()=>st.loading||st.busy;
async function load(){
 if(st.loading||!navigator.onLine||!client())return;
 st.loading=true;
 try{
  const {data:auth,error:authError}=await client().auth.getSession();
  if(authError)throw authError;
  st.signed=!!auth?.session?.user;
  if(!st.signed){st.sessions=[];st.segments=[];st.error='';return;}
  const {data:records,error}=await client().from('fitnessdex_movement_sessions')
    .select('id,kind,state,started_at,finished_at,distance_km,notes,updated_at')
    .order('started_at',{ascending:false}).limit(40);
  if(error)throw error;
  const sessions=records||[],ids=sessions.map(x=>x.id);
  let segments=[];
  if(ids.length){
   const segs=await client().from('fitnessdex_movement_segments')
     .select('id,session_id,started_at,ended_at,steps,steps_synced_at')
     .in('session_id',ids).order('started_at',{ascending:true}).limit(180);
   if(segs.error)throw segs.error;
   segments=segs.data||[];
  }
  st.sessions=sessions;st.segments=segments;st.loaded=true;st.error='';
 }catch(e){st.error=e?.message||'Movement records could not be loaded';}
 finally{
  st.loading=false;
  if(tab==='movement'&&active()&&document.getElementById('fd-move-elapsed'))updateLive();
  else if(tab==='movement'||tab==='home')render();
 }
}
async function action(operation,sessionId=null,kind=null,distance=null,notes=null){
 if(st.busy)return;
 if(!client())return toast('Sign in to FitnessDex cloud saving first.');
 st.busy=true;st.error='';
 try{
  const payload={p_action:operation,p_session_id:sessionId,p_kind:kind,p_distance_km:distance,p_notes:notes};
  const {error}=await client().rpc('fitnessdex_movement_action',payload);
  if(error)throw error;
  await load();
  const messages={start:'Session started',pause:'Session paused',resume:'Session resumed',finish:'Session saved',discard:'Session discarded'};
  toast(messages[operation]||'Saved');
 }catch(e){st.error=e?.message||'Could not save your session';toast(st.error);}
 finally{st.busy=false;if(tab==='movement')render();}
}
window.fdMovementStart=kind=>{
 if(!['walk','hike','run'].includes(kind))return;
 void action('start',null,kind);
};
window.fdMovementPause=()=>{const x=active();if(x&&x.state==='active')void action('pause',x.id);};
window.fdMovementResume=()=>{const x=active();if(x&&x.state==='paused')void action('resume',x.id);};
window.fdMovementFinish=()=>{
 const x=active();if(!x)return;
 const text=document.getElementById('fd-move-distance')?.value?.trim()||'';
 const distance=text===''?null:Number(text);
 if(distance!==null&&(!Number.isFinite(distance)||distance<0||distance>250))return toast('Enter a distance between 0 and 250 km, or leave it blank.');
 const notes=document.getElementById('fd-move-notes')?.value?.trim()||'';
 if(notes.length>1000)return toast('Notes must be under 1,000 characters');
 void action('finish',x.id,null,distance,notes);
};
window.fdMovementDiscard=()=>{
 const x=active();if(!x||!confirm('Discard this session? Its timer and distance will be lost. Your daily steps will not change.'))return;
 void action('discard',x.id);
};
window.fdMovementOpen=()=>{navigate('movement');void load();};
window.fdMovementRefresh=()=>{void load();};
window.fdMovementHome=()=>{
 const x=active();
 return '<button class="fd-move-home" onclick="fdMovementOpen()"><span class="fd-move-home-icon" aria-hidden="true">◷</span><span><strong>'+(x?esc(listTitle(x))+' '+(x.state==='paused'?'paused':'in progress'):'Walk, hike or run')+'</strong><small>'+(x?'Session saved automatically · tap to continue':'Record your time and distance')+'</small></span><b aria-hidden="true">›</b></button>';
};
window.fdMovementView=()=>{
 const x=active(),recent=st.sessions.filter(s=>s.state==='finished').slice(0,12);
 const signed=st.signed;
 const head='<section class="fd-care-page fd-movement-page"><div class="fd-care-top"><button class="fd-care-back" onclick="navigate(\'more\')">‹ More</button><small>YOUR MOVEMENT</small><h1>Walks, hikes & runs</h1><p>One continuous daily step total. Sessions only identify steps taken during deliberate exercise.</p></div>';
 const auth=(!signed?'<div class="fd-move-panel"><p>Sign in under More → Cloud saving to save sessions across devices.</p></div>':'');
 const current=x?'<div class="fd-move-panel"><div class="fd-move-running-label">'+esc(listTitle(x))+' · '+(x.state==='active'?'In progress':'Paused')+'</div><div id="fd-move-elapsed" class="fd-move-timer" role="timer">'+clock(duration(x))+'</div>'+
 '<p class="fd-move-note">Active time only. Paused time is excluded.</p>'+
 '<div class="fd-move-metrics"><span><b id="fd-move-steps">'+(()=>{const l=liveFor(x),s=measured(x);return l?fmt(Math.max(s.steps||0,Number(l.estimated_session_steps)||0)):s.steps===null?'—':fmt(s.steps);})()+'</b><small id="fd-move-steps-label">'+(liveFor(x)?'Live step estimate':'Health Connect steps')+'</small></span><span><b>'+bySession(x.id).length+'</b><small>Active intervals</small></span></div>'+
 '<p class="fd-move-note">Live step figures are provisional. Health Connect reconciles the final count without adding them to the daily total twice.</p>'+
 '<div class="fd-move-buttons">'+(x.state==='active'?'<button class="fd-care-secondary" onclick="fdMovementPause()">Pause</button>':'<button class="fd-care-primary" onclick="fdMovementResume()">Resume</button>')+'</div>'+
 (nativeAndroid()&&!liveFor(x)?'<a class="fd-move-sensor" href="'+esc(sensorLink(x.id))+'">Switch on live step updates</a>':'')+
 '<div class="fd-move-finish"><h2>Finish session</h2><label for="fd-move-distance">Distance (km)</label><input id="fd-move-distance" type="number" min="0" max="250" step="0.01" inputmode="decimal" placeholder="Enter distance, optional"/>'+
 '<label for="fd-move-notes">Notes (optional)</label><textarea id="fd-move-notes" rows="2" maxlength="1000" placeholder="Route, terrain, how it felt"></textarea>'+
 '<button class="fd-care-primary" onclick="fdMovementFinish()">Finish & save</button><button class="fd-move-discard" onclick="fdMovementDiscard()">Discard session</button></div></div>':
 '<div class="fd-move-panel"><h2>Start an activity</h2><p>Timing starts immediately. You can pause or resume at any point.</p><div class="fd-move-buttons">'+
 ['walk','hike','run'].map(k=>'<button class="fd-care-primary" onclick="fdMovementStart(\''+k+'\')">'+label[k]+'</button>').join('')+'</div></div>';
 const history=recent.map(s=>{
  const count=measured(s),pieces=[when(s.started_at),clock(duration(s))];
  if(s.distance_km!==null)pieces.push(Number(s.distance_km).toFixed(2)+' km');
  pieces.push(count.steps===null||count.partial?'Steps pending sync':fmt(count.steps)+' steps');
  return '<div class="fd-move-past"><strong>'+esc(listTitle(s))+'</strong><small>'+pieces.map(esc).join(' · ')+'</small>'+(s.notes?'<p>'+esc(s.notes)+'</p>':'')+'</div>';
 }).join('');
 return head+auth+(signed?current:'')+
 '<div class="fd-move-history"><div class="row"><h2>Previous sessions</h2><button class="fd-care-secondary" onclick="fdMovementRefresh()">Refresh</button></div>'+
 (history||'<p class="fd-move-note">Your completed sessions will appear here.</p>')+'</div>'+
 (st.error?'<p class="fd-step-error">'+esc(st.error)+'</p>':'')+
 '<p class="fd-move-note">Daily steps are counted independently. No movement XP is awarded yet, to avoid double counting existing workouts.</p></section>';
};
const previousRender=render;
render=function(){
 if(tab==='movement'){
  document.getElementById('app').innerHTML=window.fdMovementView();
  document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab==='more'));
  document.body.dataset.fdTab='movement';return;
 }
 previousRender();
};
setInterval(()=>{
 if(tab==='movement'){
  const x=active(),el=document.getElementById('fd-move-elapsed');
  if(x&&el)el.textContent=clock(duration(x));
 }
},1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&tab==='movement')void load();});
window.addEventListener('focus',()=>{if(tab==='movement')void load();});
window.addEventListener('fitnessdex:steps-updated',()=>{if(tab==='movement')updateLive();});
setInterval(()=>{if(!document.hidden&&['movement','home'].includes(tab))void load();},30000);
const auth=client()?.auth;
if(auth?.onAuthStateChange)auth.onAuthStateChange((event,session)=>{
 if(event==='SIGNED_OUT'){st.signed=false;st.sessions=[];st.segments=[];st.loaded=false;if(tab==='movement'||tab==='home')render();}
 if(session?.user&&['INITIAL_SESSION','SIGNED_IN'].includes(event))setTimeout(()=>void load(),0);
});
void load();
})();
