/* FitnessDex v0.5.4 — workouts are optional. Standalone exercise records are the default. */
(() => {
  'use strict';
  const WINDOW_MINUTES = 75;
  const RECOMMEND_AREAS = new Set(['Calisthenics','Weight training','Flexibility & mobility']);
  function model() {
    if (!S.v5 || typeof S.v5 !== 'object') S.v5 = {workouts:[],dismissed:[]};
    if (!Array.isArray(S.v5.workouts)) S.v5.workouts = [];
    if (!Array.isArray(S.v5.dismissed)) S.v5.dismissed = [];
    return S.v5;
  }
  function confirmedWorkouts() { return model().workouts.filter(w => w && typeof w.id==='string' && typeof w.name==='string'); }
  function namedWorkout(id) {return confirmedWorkouts().find(w=>w.id===id);}
  function isInWorkout(l) {return !!(l.sessionId && namedWorkout(l.sessionId));}
  function timeOf(l) {return l?.performedAt ? new Date(l.performedAt).getTime() : NaN;}
  function validTime(l) {return Number.isFinite(timeOf(l));}
  function standaloneRows() {return S.logs.filter(l=>!isInWorkout(l));}
  function newGroupName(rows) {
    const cats=new Set(rows.map(l=>ex(l.id)?.cat));
    const parts=[];
    if(cats.has('Weight training'))parts.push('Weights');
    if(cats.has('Calisthenics'))parts.push('Calisthenics');
    if(cats.has('Flexibility & mobility'))parts.push('Mobility');
    if(cats.has('Cardio'))parts.push('Cardio');
    const earliest=Math.min(...rows.map(timeOf).filter(Number.isFinite));
    const date=new Date(earliest);
    return (parts.join(' + ')||'Workout')+' · '+(Number.isFinite(earliest)?localTime(date):today());
  }
  function recentSuggestion() {
    const rows=standaloneRows().filter(l=>validTime(l)&&RECOMMEND_AREAS.has(ex(l.id)?.cat)).sort((a,b)=>timeOf(b)-timeOf(a));
    if(rows.length<3)return null;
    const anchor=rows[0],latest=timeOf(anchor);
    if(latest>Date.now()+60000 || Date.now()-latest>24*60*60*1000)return null;
    const matching=rows.filter(l=>l.date===anchor.date && timeOf(l)<=latest && latest-timeOf(l)<=WINDOW_MINUTES*60000).sort((a,b)=>timeOf(a)-timeOf(b));
    if(new Set(matching.map(l=>l.id)).size<3)return null;
    const rejected=model().dismissed.some(d=>d && d.date===anchor.date && Number.isFinite(d.until) && latest<=d.until);
    if(rejected)return null;
    return matching;
  }
  function renderSuggestion(){
    let holder=document.getElementById('fd-workout-suggestion');
    if(!holder)return;
    const rows=recentSuggestion();
    if(!rows){holder.hidden=true;holder.innerHTML='';return;}
    const count=new Set(rows.map(l=>l.id)).size;
    holder.hidden=false;
    holder.innerHTML=`<div class="fd-workout-callout"><div><b>${count} exercises logged close together</b><p>Would you like to save them as one workout? They're standalone unless you choose to group them.</p><small>${rows.map(l=>esc(ex(l.id)?.name||l.id)).join(' · ')}</small></div><div class="fd-workout-buttons"><button onclick="fdCreateSuggestedWorkout()">Create workout</button><button onclick="fdReviewSuggestedWorkout()">Review</button><button onclick="fdDismissWorkoutSuggestion()">Keep separate</button></div></div>`;
  }
  function groupRecords(ids,name){
    const targetIds=new Set(ids);
    const rows=S.logs.filter(l=>targetIds.has(logId(l)));
    if(rows.length===0)return false;
    if(rows.some(isInWorkout)){alert('Some records already belong to a workout. Remove them from that workout first.');return false;}
    const workoutId='w-'+uid();
    const chosenName=String(name||newGroupName(rows)).trim().slice(0,80)||'Workout';
    model().workouts.push({id:workoutId,name:chosenName,createdAt:new Date().toISOString()});
    for(const l of rows)l.sessionId=workoutId;
    refreshRewardsAndSave();
    toast(`Workout created: ${chosenName} · ${rows.length} exercise records`);
    return true;
  }
  function refreshRewardsAndSave(){resetDerived();reconcileCompleted();ensureBoard();save();render();}
  window.fdCreateSuggestedWorkout=function(){const rows=recentSuggestion();if(!rows)return;groupRecords(rows.map(logId));};
  window.fdReviewSuggestedWorkout=function(){const rows=recentSuggestion();tab='workouts';render();if(rows){const chosen=new Set(rows.map(logId));document.querySelectorAll('#fd-standalone-checks input[type=checkbox]').forEach(input=>{input.checked=chosen.has(input.value);});}document.getElementById('fd-workout-create')?.scrollIntoView({block:'start',behavior:'smooth'});};
  window.fdDismissWorkoutSuggestion=function(){const rows=recentSuggestion();if(!rows)return;const latest=Math.max(...rows.map(timeOf));model().dismissed.push({date:rows[0].date,until:latest+2*60*60*1000});model().dismissed=model().dismissed.slice(-60);save();renderSuggestion();};
  window.fdGroupSelectedWorkout=function(){
    const ids=[...document.querySelectorAll('#fd-standalone-checks input:checked')].map(x=>x.value);
    if(!ids.length)return alert('Select at least one activity to put in the workout.');
    const name=document.getElementById('fd-workout-name')?.value||'';
    groupRecords(ids,name);
  };
  window.fdAddExerciseToWorkout=function(id){if(!namedWorkout(id))return;activeSessionId=id;editId=null;tab='log';render();window.scrollTo({top:0,behavior:'instant'});};
  window.fdRenameWorkout=function(id){
    const w=namedWorkout(id);if(!w)return;
    const name=prompt('Workout name',w.name);if(name===null)return;
    if(!name.trim())return alert('Enter a workout name.');
    w.name=name.trim().slice(0,80);save();render();
  };
  window.fdRemoveFromWorkout=function(id){
    const l=S.logs.find(x=>logId(x)===id);if(!l||!isInWorkout(l))return;
    const previousWorkoutId=l.sessionId;
    l.sessionId=null;
    model().workouts=model().workouts.filter(w=>w.id!==previousWorkoutId || S.logs.some(other=>other.sessionId===w.id));
    refreshRewardsAndSave();
    toast('Exercise is now standalone. Its sets and achievements are retained.');
  };
  window.fdUngroupWorkout=function(id){
    const w=namedWorkout(id);if(!w)return;
    if(!confirm(`Make every exercise in “${w.name}” standalone? No exercise records will be deleted.`))return;
    S.logs.filter(l=>l.sessionId===id).forEach(l=>{l.sessionId=null;});
    model().workouts=model().workouts.filter(x=>x.id!==id);
    refreshRewardsAndSave();
    toast('Workout ungrouped. All exercise records retained.');
  };
  function logItem(l,grouped=false){
    return `<div class="fd-w-row"><div><b>${esc(ex(l.id)?.name||l.id)}</b><div class="fd-w-muted">${esc(l.date)} · ${validTime(l)?esc(localTime(new Date(l.performedAt))):'Time not recorded'} · ${esc(logDescription(l))}</div></div><div class="fd-w-controls"><button onclick="editLog('${esc(logId(l))}')">Edit</button>${grouped?`<button onclick="fdRemoveFromWorkout('${esc(logId(l))}')">Separate</button>`:''}</div></div>`;
  }
  function workoutsScreen(){
    const workouts=confirmedWorkouts().map(w=>({...w,rows:S.logs.filter(l=>l.sessionId===w.id).sort((a,b)=>timeOf(a)-timeOf(b))})).filter(w=>w.rows.length).sort((a,b)=>Math.max(...b.rows.map(timeOf))-Math.max(...a.rows.map(timeOf)));
    const singles=standaloneRows().slice().sort((a,b)=>timeOf(b)-timeOf(a));
    return `<div class="fd-w-page"><div class="fd-w-hero"><h1>Workouts</h1><p>Every activity saves by itself. Group exercises only when you want them to count as one workout.</p><div class="fd-w-counts"><span>${workouts.length} workouts</span><span>${singles.length} standalone records</span></div></div>
      <div class="card" id="fd-workout-create"><h2>Make a workout from saved activities</h2><p class="hint">Choose exercises performed together. You can include weights, calisthenics and mobility in the same workout, or leave a later run separate.</p><label for="fd-workout-name">Workout name (optional)</label><input id="fd-workout-name" maxlength="80" placeholder="e.g. Full-body training" style="width:100%;margin:6px 0 12px"><div id="fd-standalone-checks" class="fd-w-pick">${singles.slice(0,100).map(l=>`<label><input type="checkbox" value="${esc(logId(l))}"><span>${esc(ex(l.id)?.name||l.id)} <small>${esc(l.date)} · ${validTime(l)?esc(localTime(new Date(l.performedAt))):'No time'}</small></span></label>`).join('')||'<p class="hint">No standalone activities yet.</p>'}</div><button class="primary" onclick="fdGroupSelectedWorkout()" ${singles.length?'':'disabled'}>Create workout with selected activities</button></div>
      <div class="card"><h2>Your workouts</h2>${workouts.map(w=>`<div class="fd-w-group"><div class="fd-w-group-head"><div><b>${esc(w.name)}</b><div class="fd-w-muted">${w.rows.length} exercise records · ${new Set(w.rows.map(l=>l.id)).size} different exercises</div></div><div class="fd-w-controls"><button onclick="fdAddExerciseToWorkout('${esc(w.id)}')">Add exercise</button><button onclick="fdRenameWorkout('${esc(w.id)}')">Rename</button><button onclick="fdUngroupWorkout('${esc(w.id)}')">Ungroup</button></div></div>${w.rows.map(l=>logItem(l,true)).join('')}</div>`).join('')||'<p class="hint">No grouped workouts yet. Log three different exercises within 75 minutes for an optional grouping suggestion, or make one yourself above.</p>'}</div>
      <div class="card"><h2>Standalone activity</h2><p class="hint">One-off sets, short mobility breaks, walks and runs can all stay here and still earn individual progress and rewards.</p>${singles.slice(0,100).map(l=>logItem(l)).join('')||'<p class="hint">No standalone activities yet.</p>'}</div></div>`;
  }

  window.fdWorkoutSelector=function(l){
    const groups=confirmedWorkouts().filter(w=>S.logs.some(x=>x.sessionId===w.id&&x.date===(l?.date||today())));
    const old=!!(l?.sessionId&&!groups.some(w=>w.id===l.sessionId));
    const selected=old?'legacy':groups.some(w=>w.id===l?.sessionId)?l.sessionId:groups.some(w=>w.id===activeSessionId)?activeSessionId:'standalone';
    return `<div class="field"><label>How to save this activity</label><select id="session"><option value="standalone" ${selected==='standalone'?'selected':''}>Standalone exercise (default)</option><option value="new">Start a workout</option>${old?'<option value="legacy" selected>Keep previous session assignment (older record)</option>':''}${groups.map(w=>`<option value="${esc(w.id)}" ${w.id===selected?'selected':''}>Add to ${esc(w.name)}</option>`).join('')}</select><p class="hint">Single sets and spontaneous exercise breaks count on their own. After 3 different exercises close together, FitnessDex can suggest a workout. Nothing is grouped without your approval.</p></div>`;
  };
  workoutGroups = function(rows){
    const groups=new Map();
    for(const l of rows){if(!namedWorkout(l.sessionId))continue;if(!groups.has(l.sessionId))groups.set(l.sessionId,[]);groups.get(l.sessionId).push(l);}
    return [...groups.values()].filter(group=>new Set(group.map(l=>l.id)).size>=2||group.reduce((total,l)=>total+logMetrics(l).sets,0)>=3||group.some(l=>ex(l.id)?.cat==='Cardio'&&logMetrics(l).minutes>=20));
  };
  countSessions = function(rows){return new Set(rows.map(l=>namedWorkout(l.sessionId)?l.sessionId:'single-'+(logId(l)||l.date+'-'+l.id))).size;};
  const formerHistory=history;
  history=function(){return tab==='workouts'?workoutsScreen():formerHistory();};
  const formerRender=render;
  render=function(){formerRender();renderSuggestion();};
  const nav=document.querySelector('main .nav');
  if(nav){const btn=document.createElement('button');btn.type='button';btn.dataset.tab='workouts';btn.textContent='Workouts';btn.addEventListener('click',()=>navigate('workouts'));const historyButton=nav.querySelector('[data-tab="history"]');if(historyButton)nav.insertBefore(btn,historyButton);else nav.appendChild(btn);}
  const promptHolder=document.createElement('div');promptHolder.id='fd-workout-suggestion';promptHolder.hidden=true;
  const app=document.getElementById('app');if(app)app.parentNode.insertBefore(promptHolder,app);
  const style=document.createElement('style');style.textContent=`
    #fd-workout-suggestion{margin:0 0 16px}#fd-workout-suggestion[hidden]{display:none}
    .fd-workout-callout{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:16px;border:1px solid #508b7f;background:linear-gradient(120deg,#143333,#1a2841);border-radius:16px;color:#f3f8ff}
    .fd-workout-callout p{margin:6px 0;color:#c6d6e2;font-size:14px}.fd-workout-callout small{display:block;color:#abc2ce;max-width:650px;line-height:1.5}
    .fd-workout-buttons,.fd-w-controls{display:flex;gap:6px;flex-wrap:wrap}.fd-workout-buttons button,.fd-w-controls button{border:1px solid #3d5065;border-radius:9px;background:#243249;padding:8px 10px;color:#fff;cursor:pointer}
    .fd-w-hero{margin-bottom:18px}.fd-w-hero h1{margin-bottom:8px}.fd-w-hero p{color:#adbfd0}.fd-w-counts{display:flex;gap:10px;flex-wrap:wrap}.fd-w-counts span{background:#26354a;border-radius:40px;padding:7px 11px;font-size:13px}
    .fd-w-page .card{margin-bottom:16px}.fd-w-pick{display:grid;max-height:320px;overflow:auto;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:5px;margin:9px 0 14px;padding:8px;border:1px solid #334156;border-radius:11px}
    .fd-w-pick label{display:flex;align-items:center;gap:9px;padding:9px;cursor:pointer;border-radius:8px;background:#202c3e}.fd-w-pick input{accent-color:#80e2c0}.fd-w-pick small{display:block;color:#9fb6c9;margin-top:3px}
    .fd-w-group{margin-bottom:14px;padding:12px;border:1px solid #334359;border-radius:12px}.fd-w-group-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px}
    .fd-w-muted{font-size:12px;color:#9fb1c9;margin-top:3px}.fd-w-row{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:11px 0;border-top:1px solid #2c394e;flex-wrap:wrap;font-size:14px}
    @media(max-width:600px){.fd-w-pick{grid-template-columns:1fr}.fd-workout-callout{align-items:flex-start}}
  `;document.head.appendChild(style);
  render();
})();
