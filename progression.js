/* FitnessDex v0.7 — progression tracks and a one-set-at-a-time logging experience.
 * Uses existing exercise IDs and ordinary logs as the source of truth.
 * Each variant remains a separate real exercise record; sessions only reference those logs.
 */
(()=>{
'use strict';
const DRAFT_KEY='fitnessdex-progression-draft-v1';
const FOCI={volume:'Build repetitions',variants:'Develop variations',both:'Train both'};
const BADGES=[
 {id:'first',name:'First Steps',detail:'Complete your first progression session',goal:1},
 {id:'five',name:'Showing Up',detail:'Complete 5 progression sessions',goal:5},
 {id:'ten',name:'Steady Work',detail:'Complete 10 progression sessions',goal:10},
 {id:'month',name:'Building a Habit',detail:'Train across 4 different weeks',goal:4},
 {id:'return',name:'Back in Action',detail:'Return after a break of at least 14 days',goal:1},
 {id:'long',name:'The Long Game',detail:'Train across 12 different weeks',goal:12}
];
const SUPPORT={
 'Push-ups':['e017','e005','e010'],
 'Pulling':['e020','e010','e073'],
 'Dips':['e017','e032','e010'],
 'Squat':['e043','e075','e109'],
 'Bodyweight squats':['e043','e075','e109'],
 'Press':['e017','e010','e032'],
 'Grip & hangs':['e073','e010','e020']
};
const escP=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const toN=x=>Number.isFinite(Number(x))?Number(x):0;
const exists=id=>!!ex(id);
const usable=id=>['bodysets','sets'].includes(ex(id)?.mode);
const model=()=>S.v8&&Array.isArray(S.v8.tracks)&&Array.isArray(S.v8.sessions)?S.v8:{tracks:[],sessions:[]};
const byTrack=id=>model().tracks.find(x=>x.id===id);
const variants=id=>{const e=ex(id);return e?DATA.filter(x=>x.cat===e.cat&&x.family===e.family&&x.mode===e.mode):[];};
const trackSessions=id=>model().sessions.filter(s=>s.trackId===id).sort((a,b)=>Date.parse(a.completedAt)-Date.parse(b.completedAt));
const refLog=id=>S.logs.find(l=>logId(l)===id);
const settledSession=s=>Array.isArray(s.setRefs)&&s.setRefs.some(r=>refLog(r.logId)?.sets?.[r.setIndex]);
const sessions=id=>trackSessions(id).filter(settledSession);
const readSet=r=>refLog(r.logId)?.sets?.[r.setIndex];
const priorLogs=id=>S.logs.filter(l=>l.id===id&&Array.isArray(l.sets)&&validDate(l.date)&&Number.isFinite(logWhen(l))&&logWhen(l)<=Date.now()+60000);
const observedBest=id=>Math.max(0,...priorLogs(id).flatMap(l=>(l.sets||[]).map(s=>toN(s.reps))));
const observedWeight=id=>{const all=priorLogs(id).sort((a,b)=>logWhen(b)-logWhen(a));return all[0]?.sets?.find(s=>toN(s.weight)>0)?.weight||0;};
const weeksOfTraining=items=>new Set(items.map(s=>{const d=new Date(s.completedAt);const day=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());const monday=day-((d.getUTCDay()+6)%7)*86400000;return monday;})).size;
function awards(){
 const seq=model().sessions.filter(settledSession).sort((a,b)=>Date.parse(a.completedAt)-Date.parse(b.completedAt));
 const weeks=weeksOfTraining(seq);
 const gap=seq.some((s,i)=>i>0&&Date.parse(s.completedAt)-Date.parse(seq[i-1].completedAt)>=14*86400000);
 return BADGES.map(x=>({...x,earned:x.id==='return'?gap:x.id==='month'||x.id==='long'?weeks>=x.goal:seq.length>=x.goal,progress:x.id==='return'?(gap?1:0):x.id==='month'||x.id==='long'?weeks:seq.length}));
}
function metricsFor(track,id){
 const completed=sessions(track.id);
 let level=0,streak=0,misses=0;
 const results=[];
 for(const session of completed){
  const all=(session.setRefs||[]).filter(r=>r.id===id&&!!readSet(r));
  const skipped=(session.skips||[]).some(a=>a.id===id);
  if(!all.length&&!skipped)continue;
  const hit=all.length>0&&!skipped&&all.every(r=>toN(readSet(r)?.reps)>=r.target);
  results.push({hit,best:Math.max(0,...all.map(r=>toN(readSet(r)?.reps))),date:session.completedAt});
  if(hit){streak++;misses=0;if(streak>=2){level++;streak=0;}}
  else{streak=0;misses++;if(misses>=3){level=Math.max(0,level-1);misses=0;}}
 }
 return {level,results};
}
function startingBest(track,id){
 if(id===track.baseId)return track.baseline;
 if(id===track.variantId)return Math.max(1,track.variantBaseline||1);
 return Math.max(1,observedBest(id)||1);
}
function prescription(track,id,index){
 const base=startingBest(track,id),progress=metricsFor(track,id).level;
 // Progresses one rep per set after two fully met sessions of this exact variation.
 // Capacity, not an assumed ordering of variants, sets the target.
 const coeff=[.55,.6,.5,.55,.48][index%5];
 return Math.max(1,Math.round(base*coeff)+progress);
}
function plateau(track,id){
 const r=metricsFor(track,id).results;
 if(r.length<4)return false;
 const last=r.slice(-3),earlier=r.slice(0,-3);
 return Math.max(...last.map(x=>x.best))<=Math.max(...earlier.map(x=>x.best));
}
function support(track){
 const e=ex(track.baseId);
 const choices=SUPPORT[e?.family]||(['bodysets','sets'].includes(e?.mode)?['e017','e010','e109']:[]);
 return choices.filter(id=>id!==track.baseId&&exists(id)).map(id=>({id,name:ex(id).name})).slice(0,3);
}
let view={kind:'list',id:null,exercise:null},draft=null,restTicker=null,newBadges=[];
function stopTick(){if(restTicker!==null){clearInterval(restTicker);restTicker=null;}}
function draftSave(){
 if(!draft)return;
 try{localStorage.setItem(DRAFT_KEY,JSON.stringify(draft));}catch(e){/* no silent claims of a recovered draft */}
}
function draftClear(){try{localStorage.removeItem(DRAFT_KEY);}catch(e){}draft=null;stopTick();}
function draftLoad(){
 try{
  const raw=localStorage.getItem(DRAFT_KEY);if(!raw)return;
  const old=JSON.parse(raw);
  if(old&&typeof old==='object'&&typeof old.trackId==='string'&&byTrack(old.trackId)&&Array.isArray(old.planned)&&old.planned.length>=1&&old.planned.length<=8&&Array.isArray(old.actual)&&old.actual.length<=old.planned.length&&old.planned.every(x=>exists(x.id)&&Number.isInteger(x.target)&&x.target>=1&&x.target<=1000)&&old.actual.every(x=>x.skipped||(exists(x.id)&&Number.isInteger(x.reps)&&x.reps>=1&&x.reps<=1000))){draft=old;return;}
 }catch(e){}
 try{localStorage.removeItem(DRAFT_KEY);}catch(e){}
}
function chooseExercise(id){
 if(!usable(id))return;
 const existing=model().tracks.filter(t=>t.baseId===id);
 view={kind:existing.length?'hub':'setup',exercise:id,id:existing[0]?.id||null};
 tab='progression';render();scrollTop();
}
function scrollTop(){window.scrollTo({top:0,behavior:'instant'});}
function list(){
 const list=model().tracks.slice().reverse();
 return '<section class="fd-p-page"><div class="fd-p-heading"><small>TRAINING MODE</small><h1>Your progressions</h1><p>Every real set counts. Develop repetitions, variations, or both.</p></div>'+
  '<div class="fd-p-list">'+list.map(t=>'<button class="fd-p-card" onclick="fdProgHub(\''+t.id+'\')"><strong>'+escP(ex(t.baseId)?.name||t.baseId)+'</strong><span>'+escP(FOCI[t.focus])+' · '+sessions(t.id).length+' saved sessions</span><b>›</b></button>').join('')+'</div>'+
  (!list.length?'<p class="hint">No progression tracks yet. Choose an exercise to begin one.</p>':'')+
  '<button class="fd-p-primary" onclick="navigate(\'log\')">Choose an exercise</button></section>';
}
function setup(){
 const e=ex(view.exercise),last=observedBest(e.id);
 const choices=variants(e.id).filter(x=>x.id!==e.id);
 return '<section class="fd-p-page"><button class="fd-p-back" onclick="fdProgBack()">‹ Back</button>'+
  '<div class="fd-p-heading"><small>NEW PROGRESSION</small><h1>'+escP(e.name)+'</h1><p>Choose how to develop this movement. Targets are adjustable, and every variation remains independent.</p></div>'+
  '<div class="fd-p-form"><label for="fd-p-focus">What do you want to develop?</label><select id="fd-p-focus" onchange="fdProgFocusChanged(this.value)">'+Object.keys(FOCI).map(x=>'<option value="'+x+'">'+FOCI[x]+'</option>').join('')+'</select>'+
  '<div class="fd-p-variant-config" id="fd-p-variant-config" hidden><label for="fd-p-variant">A variation to practice</label><select id="fd-p-variant">'+choices.map(x=>'<option value="'+x.id+'">'+escP(x.name)+'</option>').join('')+'</select>'+
  (choices.length?'':'<p class="hint">No other variation with comparable logging units is available for this movement.</p>')+'</div>'+
  '<label for="fd-p-baseline">Starting maximum for '+escP(e.name)+' (reps)</label><input id="fd-p-baseline" type="number" min="1" max="1000" step="1" value="'+(last||5)+'">'+
  '<p class="fd-p-help">'+(last?'Suggested from your recorded sets: '+last+'. You may change it.':'No prior set history. Enter a comfortable recent best or starting estimate; this is not a logged fitness test.')+'</p>'+
  '<label for="fd-p-count">Number of sets per session</label><select id="fd-p-count"><option value="3">3 sets</option><option value="5">5 sets</option></select>'+
  '<label for="fd-p-rest">Rest between sets</label><select id="fd-p-rest">'+[60,90,120,180].map(x=>'<option value="'+x+'" '+(x===90?'selected':'')+'>'+x+' seconds</option>').join('')+'</select>'+
  '<button class="fd-p-primary" onclick="fdProgCreate()">Create progression</button></div></section>';
}
function hub(){
 const t=byTrack(view.id);if(!t)return list();
 const done=sessions(t.id),badges=awards().filter(x=>x.earned);
 const best=observedBest(t.baseId),primary=metricsFor(t,t.baseId);
 const supports=plateau(t,t.baseId)?support(t):[];
 return '<section class="fd-p-page"><button class="fd-p-back" onclick="fdProgBack()">‹ Progressions</button>'+
  '<div class="fd-p-heading"><small>'+escP(FOCI[t.focus])+'</small><h1>'+escP(ex(t.baseId).name)+'</h1><p>Only your completed sets determine improvement. Session targets are suggestions you can change.</p></div>'+
  '<div class="fd-p-stats"><div><strong>'+done.length+'</strong><span>Sessions</span></div><div><strong>'+best+'</strong><span>Best recorded set</span></div><div><strong>+'+primary.level+'</strong><span>Target increases</span></div></div>'+
  (draft?.trackId===t.id?'<button class="fd-p-primary" onclick="fdProgResume()">Resume unfinished session</button>':draft?'<div class="fd-p-support"><strong>Another session is unfinished</strong><p>You can resume it or discard that unsaved draft before starting here.</p><button onclick="fdProgResume()">Resume unfinished session</button><button onclick="fdProgDiscardDraft()">Discard unfinished draft</button></div>':'<button class="fd-p-primary" onclick="fdProgBegin()">Begin next session</button>')+
  '<p class="fd-p-help">Targets increase after two successful sessions of each variation. Three difficult sessions can ease the targets. Switching variations does not erase progress.</p>'+
  (supports.length?'<div class="fd-p-support"><strong>Possible plateau</strong><p>Several comparable attempts have not improved. Try one optional supporting exercise, or take an easier session.</p><button onclick="fdProgSupport(\''+supports[0].id+'\')">Try '+escP(supports[0].name)+'</button></div>':'')+
  '<details class="fd-p-fold"><summary>Persistence awards · '+badges.length+' earned</summary>'+awardRows()+'</details>'+
  '<details class="fd-p-fold"><summary>Training balance & rest</summary>'+  '<label for="fd-p-focus-update">Training focus</label><select id="fd-p-focus-update">'+Object.keys(FOCI).map(x=>'<option value="'+x+'" '+(x===t.focus?'selected':'')+'>'+FOCI[x]+'</option>').join('')+'</select>'+  '<label for="fd-p-variant-update">Practice variation</label><select id="fd-p-variant-update">'+variants(t.baseId).filter(x=>x.id!==t.baseId).map(x=>'<option value="'+x.id+'" '+(x.id===t.variantId?'selected':'')+'>'+escP(x.name)+'</option>').join('')+'</select>'+  '<label for="fd-p-count-update">Sets per session</label><select id="fd-p-count-update">'+[3,5].map(x=>'<option value="'+x+'" '+(x===t.setCount?'selected':'')+'>'+x+' sets</option>').join('')+'</select>'+  '<label for="fd-p-rest-update">Rest timer</label><select id="fd-p-rest-update">'+[60,90,120,180].map(x=>'<option value="'+x+'" '+(x===t.restSec?'selected':'')+'>'+x+' seconds</option>').join('')+'</select>'+  '<button onclick="fdProgUpdatePlan()">Save plan settings</button><button onclick="fdProgNewTrack()">Start a separate progression</button></details></section>';
}
function awardRows(){
 return BADGES.map((a,i)=>{const x=awards()[i];return '<div class="fd-p-award"><span class="'+(x.earned?'earned':'')+'">'+(x.earned?'◆':'○')+'</span><div><b>'+a.name+'</b><small>'+a.detail+'</small></div></div>';}).join('');
}
function plan(t){
 const count=t.setCount||3,focus=t.focus,base=t.baseId,variant=t.variantId||base;
 const ids=Array.from({length:count},(_,i)=>{
  if(focus==='volume')return base;
  if(focus==='variants')return i%2===0?variant:base;
  if(count===3)return i===1?variant:base;
  return i===2||i===4?variant:base;
 });
 return ids.map((id,i)=>({id,target:prescription(t,id,i)}));
}
function start(){
 const t=byTrack(view.id);if(!t||draft)return;
 const planned=plan(t);
 draft={trackId:t.id,startedAt:new Date().toISOString(),planned,actual:[],selectedId:planned[0].id,selectedTarget:planned[0].target,restUntil:null};
 draftSave();view.kind='session';render();scrollTop();
}
function step(){
 if(!draft)return hub();
 const t=byTrack(draft.trackId);if(!t)return list();
 const i=draft.actual.length;
 if(i>=draft.planned.length)return review();
 const proposed=draft.planned[i],e=ex(draft.selectedId)||ex(proposed.id);
 const weighted=e.mode==='sets';
 const defaultWeight=weighted?observedWeight(e.id):0;
 const seen=draft.actual.reduce((a,s)=>a+(s.skipped?0:s.reps),0);
 return '<section class="fd-p-page fd-p-setscreen"><button class="fd-p-back" onclick="fdProgPause()">‹ Save for later</button>'+
  '<div class="fd-p-sethead"><small>'+escP(FOCI[t.focus])+' · SET '+(i+1)+' OF '+draft.planned.length+'</small><h1>'+escP(e.name)+'</h1></div>'+
  '<div class="fd-p-setrail">'+draft.planned.map((p,k)=>'<span class="'+(k<i?'done':k===i?'current':'')+'">'+(k<i?(draft.actual[k]?.skipped?'–':'✓'):p.target)+'</span>').join('')+'</div>'+
  '<div class="fd-p-big-target"><span>Suggested target</span><strong>'+draft.selectedTarget+'</strong><small>repetitions</small></div>'+
  '<div class="fd-p-inline-edit"><label for="fd-p-reps">Actual reps</label><input id="fd-p-reps" aria-label="Actual repetitions" type="number" min="0" max="1000" step="1" value="'+draft.selectedTarget+'">'+
   (weighted?'<label for="fd-p-weight">Weight (kg)</label><input id="fd-p-weight" type="number" min="0.5" max="1000" step="0.5" value="'+(defaultWeight||'')+'" placeholder="kg">':'')+'</div>'+
  '<button class="fd-p-change" onclick="fdProgShowVariants()">Change exercise variation</button>'+
  '<button class="fd-p-primary" onclick="fdProgRecordSet()">Log this set</button>'+
  '<button class="fd-p-muted" onclick="fdProgSkipSet()">Skip this set</button>'+
  '<p class="fd-p-help">You can switch exercises between any sets. FitnessDex records the actual movement, not the original target.</p>'+
  (seen?'<div class="fd-p-session-volume">'+seen+' reps recorded so far</div>':'')+'</section>';
}
function chooseVariant(){
 if(!draft)return list();
 const t=byTrack(draft.trackId),suggested=variants(t.baseId);
 return '<section class="fd-p-page"><button class="fd-p-back" onclick="fdProgReturnSet()">‹ Back to set</button><div class="fd-p-heading"><small>SET '+(draft.actual.length+1)+'</small><h1>Which exercise?</h1><p>Harder, easier or different: you decide. Each variation keeps its own record.</p></div>'+
  '<div class="fd-p-list">'+suggested.map(e=>'<button class="fd-p-card" onclick="fdProgVariant(\''+e.id+'\')"><strong>'+escP(e.name)+'</strong><span>'+((e.id===draft.selectedId)?'Currently selected · ':'')+'Suggested: '+prescription(t,e.id,draft.actual.length)+' reps</span><b>›</b></button>').join('')+'</div></section>';
}
function rest(){
 if(!draft)return list();
 const left=Math.max(0,Math.ceil((draft.restUntil-Date.now())/1000)),previous=draft.actual[draft.actual.length-1],miss=previous&&!previous.skipped&&previous.reps<previous.target;
 return '<section class="fd-p-page fd-p-restscreen"><button class="fd-p-back" onclick="fdProgPause()">‹ Save for later</button><div class="fd-p-heading"><small>RECOVER</small><h1>Rest before your next set</h1></div>'+
  '<strong class="fd-p-restclock" id="fd-p-rest-count">'+formatTime(left)+'</strong>'+
  (miss?'<p class="fd-p-help">You logged '+previous.reps+'/'+previous.target+' reps. You can try another variation next; this isn’t a failed workout.</p>':'<p class="fd-p-help">Rest as needed. You can continue or end the session without penalty.</p>')+
  '<button class="fd-p-primary" onclick="fdProgContinue()">Next set</button><button class="fd-p-change" onclick="fdProgAddRest()">+ 30 seconds</button><button class="fd-p-muted" onclick="fdProgFinishEarly()">Finish session now</button></section>';
}
function formatTime(n){return Math.floor(n/60)+':'+String(n%60).padStart(2,'0');}
function tick(){
 stopTick();if(view.kind!=='rest'||!draft)return;
 restTicker=setInterval(()=>{const node=document.getElementById('fd-p-rest-count');if(!node){stopTick();return;}node.textContent=formatTime(Math.max(0,Math.ceil((draft.restUntil-Date.now())/1000)));},1000);
}
function review(){
 if(!draft)return list();
 const completed=draft.actual.filter(x=>!x.skipped);
 const sum=completed.reduce((a,x)=>a+x.reps,0);
 return '<section class="fd-p-page"><div class="fd-p-heading"><small>SESSION REVIEW</small><h1>Save your actual sets</h1><p>'+completed.length+' sets · '+sum+' repetitions across '+new Set(completed.map(x=>x.id)).size+' variation(s)</p></div>'+
  '<div class="fd-p-set-summary">'+draft.actual.map((x,i)=>'<div><span>Set '+(i+1)+'</span><strong>'+ (x.skipped?'Skipped':escP(ex(x.id)?.name||x.id)+' · '+x.reps+(x.weight?' × '+x.weight+' kg':''))+'</strong></div>').join('')+'</div>'+
  '<p class="fd-p-help">Real sets are stored as ordinary exercise logs. Progression and campaigns use those same records, without creating a second copy.</p>'+
  '<button class="fd-p-primary" '+(completed.length?'':'disabled')+' onclick="fdProgSave()">Save session & progress</button>'+
  '<button class="fd-p-muted" onclick="fdProgPause()">Keep as unfinished draft</button></section>';
}
function outcome(){
 const ss=model().sessions.find(s=>s.id===view.id);if(!ss)return list();
 const counts=ss.setRefs.reduce((a,r)=>a+toN(readSet(r)?.reps),0);
 const variations=new Set(ss.setRefs.map(x=>x.id)).size;
 return '<section class="fd-p-page fd-p-result"><div class="fd-p-result-icon">◆</div><small>PROGRESSION SAVED</small><h1>'+counts+' repetitions logged</h1><p>'+ss.setRefs.length+' actual sets · '+variations+' variation'+(variations===1?'':'s')+'</p>'+
  (newBadges.length?'<div class="fd-p-granted"><strong>New persistence award'+(newBadges.length===1?'':'s')+'</strong><p>'+newBadges.map(escP).join(' · ')+'</p></div>':'')+
  '<div class="fd-p-support"><strong>Persistence matters</strong><p>Each completed progression session contributes towards long-term consistency awards. Hard sets and substitutions still count.</p></div>'+
  '<details class="fd-p-fold"><summary>Persistence awards</summary>'+awardRows()+'</details>'+
  '<button class="fd-p-primary" onclick="fdProgHub(\''+ss.trackId+'\')">Back to progression</button><button class="fd-p-muted" onclick="navigate(\'home\')">Done for now</button></section>';
}
window.fdProgressionView=function(){
 if(!model().tracks.length&&view.kind!=='setup')return list();
 if(view.kind==='setup')return setup();
 if(view.kind==='hub')return hub();
 if(view.kind==='variants')return chooseVariant();
 if(view.kind==='session')return step();
 if(view.kind==='rest'){const html=rest();queueMicrotask(tick);return html;}
 if(view.kind==='review')return review();
 if(view.kind==='result')return outcome();
 return list();
};
window.fdStartProgression=chooseExercise;
window.fdProgBack=()=>{stopTick();view={kind:'list',id:null,exercise:null};tab='progression';render();scrollTop();};
window.fdProgHub=id=>{if(!byTrack(id))return;stopTick();view={kind:'hub',id,exercise:byTrack(id).baseId};tab='progression';render();scrollTop();};
window.fdProgFocusChanged=focus=>{const div=document.getElementById('fd-p-variant-config');if(div)div.hidden=focus==='volume';};
window.fdProgCreate=()=>{
 const e=ex(view.exercise),focus=document.getElementById('fd-p-focus')?.value,baseline=Number(document.getElementById('fd-p-baseline')?.value);
 const setCount=Number(document.getElementById('fd-p-count')?.value),restSec=Number(document.getElementById('fd-p-rest')?.value);
 const variantId=focus!=='volume'?document.getElementById('fd-p-variant')?.value||null:null;
 if(!e||!usable(e.id)||!Object.keys(FOCI).includes(focus)||!Number.isInteger(baseline)||baseline<1||baseline>1000||![3,5].includes(setCount)||![60,90,120,180].includes(restSec))return alert('Check the starting repetitions and settings.');
 if(focus!=='volume'&&(!variantId||!variants(e.id).some(x=>x.id===variantId&&x.id!==e.id)))return alert('Choose a different exercise variation.');
 const t={id:'pt-'+uid(),baseId:e.id,variantId,focus,baseline,variantBaseline:variantId?(observedBest(variantId)||1):null,setCount,restSec,createdAt:new Date().toISOString()};
 const old=JSON.stringify(S);if(!S.v8)S.v8={tracks:[],sessions:[]};S.v8.tracks.push(t);
 if(!save()){S=JSON.parse(old);return;}
 view={kind:'hub',id:t.id,exercise:e.id};render();scrollTop();
};
window.fdProgUpdatePlan=()=>{
 const t=byTrack(view.id);if(!t)return;
 const focus=document.getElementById('fd-p-focus-update')?.value;
 const variantId=focus==='volume'?null:document.getElementById('fd-p-variant-update')?.value||null;
 const sec=Number(document.getElementById('fd-p-rest-update')?.value);
 const count=Number(document.getElementById('fd-p-count-update')?.value);
 if(!Object.keys(FOCI).includes(focus)||![60,90,120,180].includes(sec)||![3,5].includes(count)||focus!=='volume'&&!variants(t.baseId).some(x=>x.id===variantId&&x.id!==t.baseId))return alert('Choose a valid training focus and variation.');
 const previous=JSON.stringify(S);
 Object.assign(t,{focus,variantId,variantBaseline:variantId?(observedBest(variantId)||1):null,setCount:count,restSec:sec});
 if(!save()){S=JSON.parse(previous);return;}
 render();
};
window.fdProgNewTrack=()=>{const t=byTrack(view.id);if(!t)return;view={kind:'setup',exercise:t.baseId,id:null};render();scrollTop();};
window.fdProgDiscardDraft=()=>{
 if(!draft||!confirm('Discard the unfinished progression session? No activity records were saved from this draft.'))return;
 draftClear();render();scrollTop();
};
window.fdProgBegin=()=>{start();};
window.fdProgResume=()=>{if(!draft)return;view={kind:draft.actual.length>=draft.planned.length?'review':'session',id:draft.trackId,exercise:byTrack(draft.trackId)?.baseId};tab='progression';render();scrollTop();};
window.fdProgReturnSet=()=>{view.kind='session';render();scrollTop();};
window.fdProgShowVariants=()=>{if(!draft)return;view.kind='variants';render();scrollTop();};
window.fdProgVariant=id=>{
 const t=byTrack(draft?.trackId);if(!t||!variants(t.baseId).some(x=>x.id===id))return;
 draft.selectedId=id;draft.selectedTarget=prescription(t,id,draft.actual.length);draftSave();
 view.kind='session';render();scrollTop();
};
window.fdProgRecordSet=()=>{
 if(!draft||draft.actual.length>=draft.planned.length)return;
 const id=draft.selectedId,e=ex(id),reps=Number(document.getElementById('fd-p-reps')?.value);
 const weight=e?.mode==='sets'?Number(document.getElementById('fd-p-weight')?.value):null;
 if(!Number.isInteger(reps)||reps<1||reps>1000||e?.mode==='sets'&&(!Number.isFinite(weight)||weight<=0||weight>1000))return alert('Enter actual repetitions'+(e?.mode==='sets'?' and a positive weight':'')+'. Use Skip for an unperformed set.');
 draft.actual.push({id,plannedId:draft.planned[draft.actual.length].id,target:draft.selectedTarget,reps,weight,performedAt:new Date().toISOString()});
 advance();
};
window.fdProgSkipSet=()=>{if(!draft)return;draft.actual.push({id:draft.selectedId,plannedId:draft.planned[draft.actual.length].id,target:draft.selectedTarget,skipped:true});advance();};
function advance(){
 draft.restUntil=null;const i=draft.actual.length;
 if(i>=draft.planned.length){view.kind='review';}
 else{
  draft.selectedId=draft.planned[i].id;draft.selectedTarget=draft.planned[i].target;
  draft.restUntil=Date.now()+(byTrack(draft.trackId)?.restSec||90)*1000;view.kind='rest';
 }
 draftSave();render();scrollTop();
}
window.fdProgContinue=()=>{if(!draft)return;stopTick();draft.restUntil=null;view.kind='session';draftSave();render();scrollTop();};
window.fdProgAddRest=()=>{if(!draft)return;draft.restUntil=Math.max(Date.now(),draft.restUntil||0)+30000;draftSave();render();};
window.fdProgFinishEarly=()=>{if(!draft)return;stopTick();view.kind='review';render();};
window.fdProgPause=()=>{if(!draft)return;stopTick();draftSave();view={kind:'hub',id:draft.trackId,exercise:byTrack(draft.trackId)?.baseId};tab='progression';render();scrollTop();};
window.fdProgSupport=id=>{
 const t=byTrack(view.id);if(!t||!support(t).some(s=>s.id===id))return;
 // A supporting exercise remains optional and is logged as a standalone record.
 choose(id);
};
window.fdProgSave=()=>{
 if(!draft||migrationError)return;
 const t=byTrack(draft.trackId),completed=draft.actual.filter(x=>!x.skipped);
 if(!t||!completed.length)return alert('Record at least one actual set.');
 if(model().sessions.length>=10000||S.logs.length+new Set(completed.map(x=>x.id)).size>100000)return alert('Storage limit reached. Export your history first.');
 const before=JSON.stringify(S),oldXP=playerXP(),beforeMilestones=new Set(earnedMilestones().map(x=>x.id)),beforeAwards=new Set(awards().filter(x=>x.earned).map(x=>x.id));
 const grouped=new Map(),sessionId='ps-'+uid(),logIds=[],refs=[];
 for(const a of completed){
  const d=stamp(new Date(a.performedAt)),key=a.id+'|'+d;
  if(!grouped.has(key))grouped.set(key,{id:a.id,date:d,sets:[],refs:[]});
  const group=grouped.get(key);group.refs.push({id:a.id,target:a.target,plannedId:a.plannedId,setIndex:group.sets.length});
  group.sets.push(ex(a.id).mode==='sets'?{reps:a.reps,weight:a.weight}:{reps:a.reps});
 }
 const entries=[];
 for(const group of grouped.values()){
  const at=new Date().toISOString()+'-'+uid(),performedAt=completed.find(a=>a.id===group.id&&stamp(new Date(a.performedAt))===group.date).performedAt;
  const entry={at,id:group.id,mode:ex(group.id).mode,date:group.date,performedAt,sets:group.sets,notes:'',sessionId:null};
  if(!isSafeEntry(entry))return alert('A set did not pass save validation. Nothing has been changed.');
  entries.push(entry);logIds.push(at);
  refs.push(...group.refs.map(r=>({...r,logId:at})));
 }
 const savedSession={id:sessionId,trackId:t.id,completedAt:new Date().toISOString(),setRefs:refs,skips:draft.actual.filter(x=>x.skipped).map(x=>({id:x.id,target:x.target})),logIds};
 S.logs.push(...entries);S.v8.sessions.push(savedSession);
 resetDerived();
 const revoked=reconcileCompleted(),claimed=claimReady(),newMilestones=earnedMilestones().filter(x=>!beforeMilestones.has(x.id));
 const gained=playerXP()-oldXP;
 S.v4=S.v4||{hunts:[],lastResult:null};
 S.v4.lastResult={logId:logIds[0],exercise:ex(t.baseId).name,summary:completed.length+' progression sets · '+completed.reduce((a,x)=>a+x.reps,0)+' reps',xpGain:gained,challengeNames:claimed.map(c=>c.label),milestones:newMilestones.map(x=>x.name)};
 if(!save()){S=JSON.parse(before);resetDerived();render();return;}
 newBadges=awards().filter(x=>x.earned&&!beforeAwards.has(x.id)).map(x=>x.name);
 draftClear();
 view={kind:'result',id:sessionId,exercise:t.baseId};tab='progression';render();scrollTop();
 if(revoked)toast(revoked+' challenge completions recalculated.');
};
window.fdProgressionAwards=awards;
const priorAchievements=achievements;
achievements=function(){return priorAchievements()+'<section class="fd-p-award-collection"><h2>Progression persistence</h2><p class="hint">These awards recognise real sessions and returning after breaks, not perfect completion of every target.</p>'+awardRows()+'</section>';};
// If navigation leaves the programme, retain an unfinished session locally but stop its timer.
const oldNavigate=navigate;
navigate=function(next){if(next!=='progression'){stopTick();if(draft)draftSave();}oldNavigate(next);};
draftLoad();
})();
