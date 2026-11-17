/* FitnessDex 0.6 — one decision per logging screen. */
(() => {
'use strict';
let stage='type', category=null, family=null, query='', returnStage='variants';
const baseNavigate=navigate, baseChoose=choose, baseSubmit=submitLog, baseEdit=editLog, baseDexRoot=openDexRoot;
let holdStarted=null, holdTick=null, holdResult=null;
let logOrigin='home';
const categoryNames={
 'Calisthenics':['◆','Bodyweight','Push-ups, pull-ups and core'],
 'Weight training':['▥','Weights','Squats, pressing and pulling'],
 'Flexibility & mobility':['◎','Mobility','Stretches and controlled movement'],
 'Cardio':['↗','Cardio','Walking, running, swimming and cycling']
};
const simplify=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const top=()=>window.scrollTo({top:0,behavior:'instant'});
function familyName(e){
 if(e.cat==='Calisthenics'&&/push[ -]?up/i.test(e.name))return 'Push-ups';
 if(e.cat==='Weight training'&&/squat/i.test(e.name))return 'Squats';
 return familyOf(e);
}
function familiar(cat=null){
 const records=new Map();
 for(const l of S.logs){
  const e=ex(l.id);if(!e||(cat&&cat!==e.cat))continue;
  const old=records.get(e.id)||{e,uses:0,last:0};
  old.uses++;old.last=Math.max(old.last,logWhen(l)||0);
  records.set(e.id,old);
 }
 return [...records.values()].sort((a,b)=>b.uses-a.uses||b.last-a.last).slice(0,5).map(x=>x.e);
}
function stepLabel(position){return 'Step '+position.step+' of '+position.total;}
function item(e,subtitle){
 const paths=dexPathPositions(e.id);
 const skill=[dexDifficulty(e),paths.length===1?stepLabel(paths[0]):''].filter(Boolean).join(' · ');
 return '<button class="fd-option" type="button" onclick="fdSelectExercise(\''+e.id+'\')"><span><strong>'+esc(e.name)+'</strong><small>'+esc(skill||subtitle||familyName(e))+'</small></span><span class="fd-arrow">›</span></button>';
}
function exerciseHeading(e){
 const paths=dexPathPositions(e.id),difficulty=dexDifficultyTag(e);
 return '<header class="fd-step-hero"><small>'+esc(e.cat)+'</small><h1>'+esc(e.name)+'</h1>'
  +(difficulty?'<div class="fd-log-skill">'+difficulty
   +(paths.length===1?'<span>'+stepLabel(paths[0])+'</span>':'')
   +(paths.length>1?'<details><summary>View skill tree</summary><ul>'+paths.map((path,index)=>'<li><button type="button" onclick="fdOpenLogSkillTree('+index+')">'
    +esc(path.name)+' · '+stepLabel(path)+'</button></li>').join('')+'</ul></details>':'')+'</div>':'')+'</header>';
}
function comparableResult(e,entry){
 const result=logMetrics(entry);
 let value,unit,descending=true;
 switch(e.mode){
  case 'sets': {
   const heaviest=(entry.sets||[]).reduce((best,set)=>
    !best||set.weight>best.weight||set.weight===best.weight&&set.reps>best.reps?set:best,null);
   if(!heaviest)return null;
   return {score:heaviest.weight,tie:heaviest.reps,value:heaviest.weight,unit:'kg',label:heaviest.weight+' kg × '+heaviest.reps};
  }
  case 'bodysets':
   value=entry.mode==='reps'?result.reps:result.bestReps;
   unit=entry.mode==='reps'?'total reps':'reps in one set';
   break;
  case 'time': value=result.seconds;unit='s';break;
  case 'duration': value=result.minutes;unit='min';break;
  case 'distance': value=result.distance;unit='km';break;
  case 'range': value=result.range;unit='cm gap';descending=false;break;
  default: return null;
 }
 if(!Number.isFinite(value)||(descending&&value<=0))return null;
 return {score:descending?value:-value,tie:0,value,unit,label:round(value,2)+' '+unit};
}
function resultRows(e){
 return logsFor(e.id).map(entry=>({entry,result:comparableResult(e,entry)})).filter(row=>row.result);
}
function sameResultType(e,a,b){
 return a.mode===b.mode&&(!e.side||(a.side||'both')===(b.side||'both'));
}
function compareResults(a,b){return a.score-b.score||a.tie-b.tie;}
function latestResult(rows){
 return rows.reduce((last,row)=>!last||logWhen(row.entry)>=logWhen(last.entry)?row:last,null);
}
function bestResult(rows){
 return rows.reduce((best,row)=>!best||compareResults(row.result,best.result)>0?row:best,null);
}
function exerciseComparison(e){
 const results=resultRows(e);
 const latest=latestResult(results);
 if(!latest)return '';
 const best=bestResult(results.filter(row=>sameResultType(e,row.entry,latest.entry)));
 const lastSide=latest.entry.side||'both';
 const side=e.side?' ('+(lastSide==='both'?'both sides':lastSide)+')':'';
 return '<dl class="fd-log-comparison"><div><dt>Last time'+esc(side)+'</dt><dd>'+esc(latest.result.label)
  +'</dd></div><div><dt>Best'+esc(side)+'</dt><dd>'+esc(best.result.label)+'</dd></div></dl>';
}
function savedComparison(saved){
 if(!saved)return '';
 const e=ex(saved.id),current=e&&comparableResult(e,saved);
 if(!current)return '';
 const others=resultRows(e).filter(row=>logId(row.entry)!==logId(saved)&&sameResultType(e,row.entry,saved));
 const last=latestResult(others.filter(row=>logWhen(row.entry)<=logWhen(saved)));
 if(!last)return '';
 const best=bestResult(others);
 const tiedWeight=e.mode==='sets'&&current.score===last.result.score;
 const delta=round(tiedWeight?current.tie-last.result.tie:current.value-last.result.value,2);
 const unit=tiedWeight||current.unit==='reps in one set'?'reps':current.unit;
 const change=delta===0?'Same as last time':(delta>0?'+':'−')+Math.abs(delta)+' '+unit+' since last time';
 return '<div class="fd-logged-progress"><span>'+esc(change)+'</span>'
  +(compareResults(current,best.result)>0?'<strong>New personal best</strong>':'')+'</div>';
}
function back(label,number){return '<div class="fd-stepback"><button onclick="fdLogBack()">‹ Back</button><span>'+esc(label)+' · '+number+'/4</span></div>';}
function frequent(cat){const r=familiar(cat);return r.length?'<section class="fd-step-section"><div class="fd-section-label"><h2>Recent & frequent</h2><small>Up to 5</small></div><div class="fd-option-list">'+r.map(e=>item(e)).join('')+'</div></section>':'';}
function categories(){return '<div class="fd-step-screen"><header class="fd-step-hero"><small>Log activity</small><h1>What did you do?</h1></header><div class="fd-category-list">'+CATS.map(cat=>{
 const [symbol,name,note]=categoryNames[cat];
 return '<button class="fd-category-option" data-cat="'+esc(cat)+'" onclick="fdPickActivityType(this.dataset.cat)"><span class="fd-category-symbol">'+symbol+'</span><span><strong>'+esc(name)+'</strong><small>'+esc(note)+'</small></span><span class="fd-arrow">›</span></button>';
 }).join('')+'</div>'+frequent()+'</div>';}
function find(){
 const exercises=DATA.filter(e=>e.cat===category),families=[...new Set(exercises.map(familyName))].sort((a,b)=>a.localeCompare(b)),q=simplify(query);
 let content;
 if(q){
  const results=exercises.filter(e=>simplify(e.name).includes(q)||simplify(familyName(e)).includes(q));
  content='<div class="fd-section-label"><h2>Matching exercises</h2><small>'+results.length+' found</small></div><div class="fd-option-list">'+results.slice(0,60).map(e=>item(e)).join('')+'</div>';
  if(!results.length)content='<p class="fd-step-empty">Nothing found in this activity type. Try another search.</p>';
 }else{
  content=frequent(category)+'<section class="fd-step-section"><div class="fd-section-label"><h2>Exercise groups</h2><small>Choose a group</small></div><div class="fd-option-list fd-group-list">'+families.map(f=>{
   const count=exercises.filter(e=>familyName(e)===f).length;
   return '<button class="fd-option" data-group="'+esc(f)+'" onclick="fdPickExerciseGroup(this.dataset.group)"><span><strong>'+esc(f)+'</strong><small>'+count+' '+(count===1?'exercise':'variations')+'</small></span><span class="fd-arrow">›</span></button>';
  }).join('')+'</div></section>';
 }
 return '<div class="fd-step-screen">'+back('Find exercise',2)+'<header class="fd-step-hero"><small>'+esc(category)+'</small><h1>Find an exercise</h1></header><label class="fd-search-label" for="fd-exercise-search">Search exercises</label><input id="fd-exercise-search" class="fd-exercise-search" type="search" autocomplete="off" placeholder="Search exercise or group" value="'+esc(query)+'" oninput="fdExerciseQuery(this.value)"><div class="fd-find-results">'+content+'</div></div>';
}
function variants(){const exercises=DATA.filter(e=>e.cat===category&&familyName(e)===family);
 return '<div class="fd-step-screen">'+back('Choose variation',3)+'<header class="fd-step-hero"><small>'+esc(category)+'</small><h1>'+esc(family)+'</h1><p>Which variation did you do?</p></header><div class="fd-option-list">'+exercises.map(e=>item(e,'Select to record')).join('')+'</div></div>';
}
function method(){const e=ex(chosen);return '<div class="fd-step-screen fd-method-screen">'+back('Training method',4)+exerciseHeading(e)+'<div class="fd-option-list"><button class="fd-option fd-method-choice" onclick="fdQuickLog()"><span><strong>Just log sets and reps</strong><small>Record what you actually complete, without targets</small></span><span class="fd-arrow">›</span></button><button class="fd-option fd-method-choice" onclick="fdStartProgression(\''+e.id+'\')"><span><strong>Follow a progression</strong><small>Suggested sets, variations, recovery and persistence awards</small></span><span class="fd-arrow">›</span></button></div></div>';}
function holdSeconds(){return Math.max(0,Math.floor((performance.now()-holdStarted)/1000));}
function holdClock(seconds){return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');}
function holdTimer(){
 const running=holdStarted!==null;
 return `<div class="fd-hold-timer">
   <div id="fd-hold-clock" role="timer" aria-label="Elapsed time">${holdClock(running?holdSeconds():holdResult??0)}</div>
   <button id="fd-hold-toggle" class="primary" type="button" onclick="fdToggleHold()">${running?'Stop timer':holdResult===null?'Start timer':'Restart timer'}</button>
 </div>`;
}
function keepHoldScreenOn(enabled){
 window.Capacitor?.Plugins?.HoldTimer?.setScreenOn({enabled}).catch(()=>{});
}
function stopHoldTimer(){
 if(holdStarted===null)return;
 clearInterval(holdTick);
 holdStarted=null;
 holdTick=null;
 keepHoldScreenOn(false);
}
function clearHoldTimer(){stopHoldTimer();holdResult=null;}
window.fdToggleHold=()=>{
 const display=$('fd-hold-clock'),button=$('fd-hold-toggle'),value=$('value'),saveButton=$('fd-hold-save');
 if(!display||!button||!value||!saveButton)return;
 if(holdStarted===null){
  holdStarted=performance.now();
  display.textContent='00:00';
  button.textContent='Stop timer';
  value.disabled=saveButton.disabled=true;
  holdTick=setInterval(()=>{
   const clock=$('fd-hold-clock');
   if(clock)clock.textContent=holdClock(holdSeconds());
  },200);
  keepHoldScreenOn(true);
  return;
 }
 holdResult=holdSeconds();
 stopHoldTimer();
 display.textContent=holdClock(holdResult);
 button.textContent='Restart timer';
 value.disabled=saveButton.disabled=false;
 value.value=holdResult||'';
 value.dispatchEvent(new Event('input',{bubbles:true}));
};
function record(){
 const e=ex(chosen)||DATA[0], l=editId?S.logs.find(x=>logId(x)===editId):null,m=e.mode;
 const setMode=m==='sets'||m==='bodysets';
 const timedHold=m==='time'&&!l;
 const running=timedHold&&holdStarted!==null;
 const cardio=!l&&(window.fdCardioRecorder?.(e)||'');
 const cardioSession=cardio&&window.fdCardioForSave?.(e);
 const activeCardio=cardioSession&&!cardioSession.finished;
 const defaultSets=l||null;
 const valueTitle=m==='time'?'Seconds':m==='range'?'Gap from floor (cm)':m==='duration'?'Minutes':'Distance (km)';
 const metrics=setMode?'<label class="fd-record-label">'+(m==='sets'?'Weight and repetitions':'Repetitions per set')+'</label><div id="setrows">'+formSetRows(e,defaultSets)+'</div><div class="fd-set-actions"><button class="small" type="button" onclick="addSet()">+ Add set</button>'+(logsFor(e.id).some(x=>x.sets?.length)?'<button class="small" type="button" onclick="prefillSets()">Use last session</button>':'')+'</div>':(timedHold?holdTimer():cardio||'')+'<div class="field"><label for="value">'+valueTitle+'</label><input id="value" type="number" '+(m==='range'?'':'min="0"')+' step="any" value="'+esc(l?.value??(timedHold?holdResult||'':''))+'" placeholder="'+esc(e.unit)+'"'+(running?' disabled':'')+'></div>';
 const extra=m==='distance'||m==='duration'?'<div class="field"><label for="extra">'+(m==='distance'?'Minutes':'Distance (km)')+' (optional)</label><input id="extra" type="number" min="0" step="any" value="'+esc(m==='distance'?l?.minutes??(cardioSession?.finished?Math.round(cardioSession.elapsedMs/60)/1000:''):l?.distance??'')+'"'+(activeCardio?' readonly':'')+'></div>':'';
 const isSwim=m==='duration'&&(e.id==='e051'||['e121','e122','e123','e124'].includes(e.id));
 const swim=isSwim?'<div class="two"><div class="field"><label for="stroke">Stroke</label><select id="stroke">'+['','Front crawl','Breaststroke','Backstroke','Butterfly','Mixed'].map(x=>'<option '+(x===(l?.stroke||'')?'selected':'')+'>'+esc(x)+'</option>').join('')+'</select></div><div class="field"><label for="lengths">Lengths</label><input id="lengths" type="number" min="0" step="1" value="'+esc(l?.lengths??'')+'"></div></div>':'';
 const side=e.side?'<div class="field"><label for="side">Side</label><select id="side">'+['both','left','right'].map(x=>'<option value="'+x+'" '+(x===(l?.side||'both')?'selected':'')+'>'+x+'</option>').join('')+'</select></div>':'';
 const mobility=e.cat==='Flexibility & mobility'?'<div class="field"><label for="mobilityType">Movement type (optional)</label><select id="mobilityType">'+['','Passive stretch','Active mobility','Controlled end range'].map(x=>'<option '+(x===(l?.mobilityType||'')?'selected':'')+'>'+esc(x)+'</option>').join('')+'</select></div>':'';
 const groupPicker=window.fdWorkoutSelector?window.fdWorkoutSelector(l):'<div class="field"><label>How to save</label><select id="session"><option value="standalone">Standalone</option></select></div>';
 const timedFinish=cardioSession?.finished?new Date(cardioSession.finishedAt):null;
 const details='<details class="fd-log-details"><summary>More details <small>Time, notes, workout</small></summary><div class="fd-log-details-inner"><div class="two"><div class="field"><label for="date">Date</label><input id="date" type="date" value="'+esc(l?.date||(timedFinish?stamp(timedFinish):today()))+'"></div><div class="field"><label for="clock">Time</label><input id="clock" type="time" value="'+(timedFinish?localTime(timedFinish):timeText(l))+'"></div></div>'+mobility+groupPicker+'<div class="field"><label for="notes">Notes (optional)</label><input id="notes" maxlength="500" value="'+esc(l?.notes||'')+'" placeholder="Technique, route, how it felt…"></div></div></details>';
 return '<div class="fd-step-screen fd-log-record">'+back('Record activity',4)+exerciseHeading(e)+'<section class="fd-entry-card"><h2>'+(timedHold?'Time your hold':'What did you complete?')+'</h2>'+(!l?exerciseComparison(e):'')+metrics+extra+swim+side+'</section>'+details+'<details class="fd-log-details"><summary>How to do this exercise</summary><p>'+esc(EXERCISE_GUIDES[e.id]||'')+'</p></details><div class="fd-save-actions"><button class="primary" onclick="submitLog()"'+(timedHold?' id="fd-hold-save"':cardio?' id="fd-cardio-save"':'')+((running||activeCardio)?' disabled':'')+'>'+(l?'Save corrections':'Save activity')+'</button></div></div>';
}
function done(){const last=S.v4?.lastResult||{},xp=last.xpGain||0;
 const saved=last.logId&&S.logs.find(x=>logId(x)===last.logId);
 const actions=saved?.mode==='time'
  ? '<button class="primary" onclick="fdRepeatHold()">Repeat</button><button onclick="fdNextAfterHold()">Next exercise</button><button onclick="navigate(\'home\')">Finish</button>'
  : '<button class="primary" onclick="navigate(\'log\')">Log another</button><button onclick="navigate(\'home\')">Done for now</button>';
 return '<div class="fd-step-screen fd-logged"><div class="fd-logged-symbol">✓</div><small>Activity saved</small><h1>'+esc(last.exercise||'Exercise')+' logged</h1><p>'+esc(last.summary||'')+'</p>'+savedComparison(saved)+(xp?'<div class="fd-logged-xp">+'+Math.round(xp)+' XP</div>':'')+(last.milestones?.length?'<p>New milestone: '+esc(last.milestones.slice(0,2).join(' · '))+'</p>':'')+(last.challengeNames?.length?'<p>Challenge complete: '+esc(last.challengeNames.slice(0,2).join(' · '))+'</p>':'')+'<div class="fd-logged-actions">'+actions+(saved?'<button class="fd-undo-last" onclick="fdUndoLastLog()">Undo this log</button>':'')+'</div></div>';
}
window.fdRepeatHold=()=>{
 const saved=S.logs.find(x=>logId(x)===S.v4?.lastResult?.logId);
 if(saved?.mode!=='time')return;
 activeSessionId=saved.sessionId||null;
 choose(saved.id);
 if(saved.side&&$('side'))$('side').value=saved.side;
 if(saved.mobilityType&&$('mobilityType'))$('mobilityType').value=saved.mobilityType;
};
window.fdNextAfterHold=()=>{
 const saved=S.logs.find(x=>logId(x)===S.v4?.lastResult?.logId);
 const exercise=saved&&ex(saved.id);
 if(!exercise)return;
 activeSessionId=saved.sessionId||null;
 category=exercise.cat;
 family=null;
 query='';
 stage='find';
 render();top();
};
window.fdLogStage=()=>stage;
window.fdPickActivityType=cat=>{if(!CATS.includes(cat))return;category=cat;family=null;query='';stage='find';render();top();};
window.fdPickExerciseGroup=group=>{if(!DATA.some(e=>e.cat===category&&familyName(e)===group))return;family=group;stage='variants';render();top();};
window.fdExerciseQuery=value=>{query=value;render();const input=document.getElementById('fd-exercise-search');if(input){input.focus();input.setSelectionRange(value.length,value.length);}};
window.fdSelectExercise=id=>{if(!ex(id))return;returnStage=stage;stage=['sets','bodysets'].includes(ex(id).mode)?'method':'record';family=familyName(ex(id));category=ex(id).cat;editId=null;baseChoose(id);};
window.fdQuickLog=()=>{stage='record';render();top();};
window.fdCanLeaveExercise=()=>{
 if(tab==='progression')return window.fdCanLeaveProgression?.()??true;
 if(tab!=='log'||!editId&&stage!=='record')return true;
 const message=editId?'Discard changes to this exercise?':'Discard this exercise? It won’t be saved.';
 if(!confirm(message))return false;
 if(!editId&&window.fdCardioDiscard?.(chosen)===false)return false;
 window.fdClearQuickDraft?.(chosen,editId);
 clearHoldTimer();
 return true;
};
window.fdOpenLogSkillTree=index=>{
 const path=dexPathPositions(chosen)[index];
 if(!path||tab!=='log'||!window.fdCanLeaveExercise())return;
 activeSessionId=null;
 editId=null;
 openDexFamily(path.category,path.family);
};
function leaveLog(){
 stage='type';editId=null;activeSessionId=null;
 if(logOrigin==='dex'){tab='dex';render();top();return;}
 navigate(logOrigin);
}
window.fdLogBack=()=>{
 if(!window.fdCanLeaveExercise())return;
 if(editId)return leaveLog();
 if(stage==='record'&&['sets','bodysets'].includes(ex(chosen)?.mode))stage='method';
 else if(stage==='method'||stage==='record'){
  if(!returnStage)return leaveLog();
  stage=returnStage;
 }else if(stage==='variants')stage='find';
 else if(stage==='find'||stage==='done')stage='type';
 else return leaveLog();
 render();top();
};
navigate=function(next){
 if(!window.fdCanLeaveExercise())return false;
 if(tab==='log')activeSessionId=null;
 if(next==='log'){
  if(tab!=='log')logOrigin=tab;
  stage='type';query='';family=null;
 }
 baseNavigate(next);
 return true;
};
choose=function(id){
 const exercise=ex(id);
 if(!exercise||!window.fdCanLeaveExercise())return false;
 if(tab!=='log')logOrigin=tab;
 returnStage=null;
 stage=['sets','bodysets'].includes(exercise.mode)?'method':'record';
 category=exercise.cat;family=familyName(exercise);
 baseChoose(id);
 return true;
};
editLog=function(id){
 if(!S.logs.some(x=>logId(x)===id)||!window.fdCanLeaveExercise())return false;
 if(tab!=='log')logOrigin=tab;
 baseEdit(id);
 return true;
};
openDexRoot=function(){
 if(!window.fdCanLeaveExercise())return false;
 if(tab==='log'){editId=null;activeSessionId=null;}
 baseDexRoot();
 return true;
};
window.fdAndroidBack=()=>{
 if(tab==='home')return false;
 if(tab==='log')window.fdLogBack();
 else if(tab==='dex'){
  if(dexSelected&&dexFamily)openDexFamily(cat,dexFamily);
  else if(dexSelected)openDexRoot();
  else if(dexFamily)openDexCategory(cat);
  else if(cat!=='All'||search)openDexRoot();
  else navigate('home');
 }else if(tab==='progression'&&window.fdProgressionBack?.())return true;
 else {
  const backButton=$('app')?.querySelector?.('.fd-minimal-back, .fd-care-back, .fd-campaign-back');
  if(backButton)backButton.click();
  else navigate(tab==='more'?'home':'more');
 }
 return true;
};
logForm=function(){return editId?record():stage==='type'?categories():stage==='find'?find():stage==='variants'?variants():stage==='method'?method():stage==='done'?done():record();};
submitLog=function(){if(holdStarted!==null)return;const before=S.logs.length,wasEdit=!!editId;baseSubmit();if(!wasEdit&&S.logs.length>before){clearHoldTimer();stage='done';tab='log';render();top();}};
const baseRender=render;
render=function(){
 if(tab!=='log'||stage!=='record'||editId||migrationError)clearHoldTimer();
 baseRender();
};
})();
