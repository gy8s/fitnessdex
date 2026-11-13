/* FitnessDex progressive overload v0.7.0 — guided sets using real exercise records only.
 * Session drafts are local to this device, with one atomic primary-log save on Finish.
 * No required workout grouping; no duplicate exercise or reward ledger.
 */
(()=>{
'use strict';
const DRAFT_KEY='fitnessdex-progression-draft-v1';
const FOCI=['volume','variants','both'];
const RESTS=[30,60,90,120,180,240];
const AWARDS=[
 {id:'first',name:'First Steps',sessions:1,xp:15},
 {id:'return',name:'Showing Up',sessions:5,xp:35},
 {id:'steady',name:'Staying Power',sessions:10,xp:65},
 {id:'long',name:'The Long Game',sessions:20,xp:100},
 {id:'month',name:'Four-Week Habit',weeks:4,xp:60},
 {id:'season',name:'Twelve-Week Habit',weeks:12,xp:120}
];
let view='list',chosenId=null,setup={exerciseId:null,focus:'both',variantId:null,baseline:'',weight:'',rest:90};
let draft=null,activeId=null,actual=0,weight=0,restTimer=null;
const h=s=>esc(s);
const tracks=()=>Array.isArray(S.v8?.tracks)?S.v8.tracks:[];
const track=id=>tracks().find(x=>x.id===id);
const recordId=l=>l.at||l.logId;
const group=e=>{
 if(!e)return '';
 if(e.cat==='Calisthenics'&&/push[ -]?up/i.test(e.name))return 'Push-ups';
 if(e.cat==='Weight training'&&/squat/i.test(e.name))return 'Squats';
 return e.cat+'|'+e.family;
};
const variants=id=>{
 const e=ex(id);return e?DATA.filter(x=>group(x)===group(e)&&x.mode===e.mode).slice(0,30):[];
};
const eligible=id=>['bodysets','sets','time'].includes(ex(id)?.mode);
function readDraft(){
 try{
  const raw=localStorage.getItem(DRAFT_KEY);if(!raw)return null;
  const data=JSON.parse(raw);if(!data||!Array.isArray(data.plan)||!Array.isArray(data.done)||!data.runId||data.done.length>data.plan.length||data.plan.length>12||data.plan.length<1)return null;
  if(data.trackId&&!tracks().some(x=>x.id===data.trackId))return null;
  if(!eligible(data.primaryId)||!data.plan.every(x=>eligible(x.id)))return null;
  return data;
 }catch(e){return null;}
}
function storeDraft(){
 try{if(draft)localStorage.setItem(DRAFT_KEY,JSON.stringify(draft));else localStorage.removeItem(DRAFT_KEY);return true;}
 catch(e){alert('Cannot save this session draft. Please free storage before continuing.');return false;}
}
function sessionsFor(id){
 const map=new Map();
 for(const l of S.logs){
  if(l.progression?.trackId!==id||!l.progression.runId||!ex(l.id))continue;
  const k=l.progression.runId,old=map.get(k)||{id:k,at:0,sets:[],primary:0};
  old.at=Math.max(old.at,logWhen(l)||0);
  const m=logMetrics(l);old.sets.push({id:l.id,target:l.progression.target||0,actual:ex(l.id).mode==='time'?m.seconds:m.reps,at:logWhen(l)});
  map.set(k,old);
 }
 return [...map.values()].sort((a,b)=>a.at-b.at);
}
function trackAwards(t){
 const sessions=sessionsFor(t.id),weeks=new Set(sessions.map(x=>{const d=new Date(x.at);const monday=new Date(d);monday.setDate(d.getDate()-((d.getDay()+6)%7));return stamp(monday);}));
 return AWARDS.filter(a=>(a.sessions&&sessions.length>=a.sessions)||(a.weeks&&weeks.size>=a.weeks));
}
window.fdProgressionXP=()=>tracks().reduce((sum,t)=>sum+trackAwards(t).reduce((a,b)=>a+b.xp,0),0);
function recentSamples(id){
 return S.logs.filter(l=>l.id===id&&validDate(l.date)&&Number.isFinite(logWhen(l))&&logWhen(l)<=Date.now()+60000)
 .slice().sort((a,b)=>logWhen(b)-logWhen(a));
}
function lastStats(id){
 const e=ex(id),rows=recentSamples(id).slice(0,10),recent=rows.slice(0,4);
 if(!e)return {best:0,weight:0};
 const measured=recent.map(l=>e.mode==='time'?logMetrics(l).seconds:logMetrics(l).bestReps).filter(x=>x>0);
 const w=recent.find(l=>l.mode==='sets'&&l.sets?.some(s=>s.weight>0))?.sets?.[0]?.weight||0;
 return {best:Math.max(0,...measured),weight:w,lastAt:recent.length?logWhen(recent[0]):0};
}
function outcomesFor(t,id){
 const sessions=sessionsFor(t.id).slice(-4);
 return sessions.filter(s=>s.sets.some(x=>x.id===id)).map(s=>{
  const sets=s.sets.filter(x=>x.id===id);
  return {at:s.at,met:sets.length>0&&sets.every(x=>x.actual>=x.target),peak:Math.max(0,...sets.map(x=>x.actual))};
 });
}
function proposed(t,id){
 const e=ex(id),current=lastStats(id),isPrimary=id===t.primaryId;
 const fallback=isPrimary?t.baseline:0,age=current.lastAt?Date.now()-current.lastAt:Infinity;
 const baseline=current.best||fallback||(e.mode==='time'?20:e.mode==='sets'?5:3);
 let target=Math.max(1,Math.floor(baseline*(e.mode==='sets'?0.9:0.65)));
 if(!isPrimary&&!current.best&&!fallback)target=e.mode==='time'?10:e.mode==='sets'?5:2;
 const results=outcomesFor(t,id);
 if(results.length>=2){
  if(results.slice(-2).every(x=>x.met))target+=e.mode==='time'?5:1;
  else if(results.slice(-2).every(x=>!x.met))target=Math.max(1,target-(e.mode==='time'?5:1));
 }
 if(age>21*86400000&&current.best>0)target=Math.max(1,Math.floor(target*.85));
 const kg=e.mode==='sets'?(current.weight||t.weight||0):0;
 return {reps:target,kg};
}
function plateau(t){
 const s=outcomesFor(t,t.primaryId);
 if(s.length<4)return null;
 const last=s.slice(-4),first=last[0].peak,peak=Math.max(...last.map(x=>x.peak));
 // This is only a pattern in comparable recorded exercise performance, never a diagnosis.
 if(peak>first*1.05+1)return null;
 const e=ex(t.primaryId),family=group(e);
 const pool=family==='Push-ups'?['e005','e017','e041','e032']:family==='Squats'?['e109','e043','e075','e104']:
 /[Pp]ull|[Rr]ow|[Hh]ang/.test(e.name+' '+e.family)?['e073','e020','e041']:
 ['e017','e041','e043','e109'];
 const recent=new Set(S.logs.slice(-30).map(l=>l.id));
 const exerciseId=pool.find(id=>ex(id)&&!recent.has(id))||pool.find(id=>ex(id));
 return exerciseId?{id:exerciseId,message:'Progress has been similar across four recorded sessions. Recovery, technique or a supporting exercise may be worth exploring.'}:null;
}
function list(){
 const rows=tracks(),current=draft&&track(draft.trackId);
 return '<div class="fd-prog"><header class="fd-prog-hero"><small>Training mode</small><h1>Progressive overload</h1><p>Progress your reps or holds, explore variations, or train both. Every real set counts in ExerciseDex and campaigns.</p></header>'+
 (current?'<button class="fd-prog-resume" onclick="fdProgResume()"><strong>Resume your unfinished session</strong><small>'+h(ex(current.primaryId)?.name)+' · '+draft.done.length+'/'+draft.plan.length+' sets recorded in draft</small><span>Continue ›</span></button>':'')+
 '<div class="fd-prog-options">'+rows.map(t=>{
  const s=sessionsFor(t.id),b=trackAwards(t);
  return '<button class="fd-prog-track" data-id="'+h(t.id)+'" onclick="fdProgOpen(this.dataset.id)"><span><strong>'+h(ex(t.primaryId)?.name||'Exercise')+'</strong><small>'+h(t.focus==='both'?'Reps + variants':t.focus==='variants'?'Variants':'Volume')+' · '+s.length+' sessions · '+b.length+' awards</small></span><span>›</span></button>';
 }).join('')+'</div><button class="fd-prog-create" onclick="fdProgFindExercise()">+ Start a progression</button><p class="fd-prog-note">Your plans live here. Regular sets can still be logged without a plan.</p></div>';
}
function chooseMode(){
 const e=ex(setup.exerciseId),kind=e?.mode==='time'?'hold duration':e?.mode==='sets'?'weight and repetitions':'repetitions';
 const candidates=variants(e.id).filter(x=>x.id!==e.id);
 return '<div class="fd-prog"><button class="fd-prog-back" onclick="fdProgList()">‹ Progressions</button><header class="fd-prog-hero"><small>'+h(e.cat)+'</small><h1>'+h(e.name)+'</h1><p>Set up a progression based on actual '+kind+'.</p></header>'+
 '<section class="fd-prog-card"><h2>What do you want to improve?</h2><div class="fd-prog-mode-list">'+
 [['volume','Volume','Get stronger at this exact movement'],['variants','Variations','Practice other versions of this movement'],['both','Both','Progress your main exercise and practice variants']].map(([v,title,desc])=>
 '<button class="'+(setup.focus===v?'on':'')+'" onclick="fdProgFocus(\''+v+'\')"><strong>'+title+'</strong><small>'+desc+'</small></button>').join('')+'</div></section>'+
 ((setup.focus==='variants'||setup.focus==='both')?'<section class="fd-prog-card"><label for="fd-prog-variant">Variation to practise (can change every set)</label><select id="fd-prog-variant" onchange="fdProgSetupVariant(this.value)"><option value="">Choose a variation</option>'+candidates.map(x=>'<option value="'+x.id+'" '+(setup.variantId===x.id?'selected':'')+'>'+h(x.name)+'</option>').join('')+'</select><small>You can always return to the standard or an easier variation.</small></section>':'')+
 '<section class="fd-prog-card"><h2>Starting point</h2><p>Use your recent logs, or enter your own conservative starting point. A maximum test is optional.</p>'+
 '<div class="fd-prog-inline"><label>Starting '+(e.mode==='time'?'hold (seconds)':'consecutive reps')+'<input id="fd-prog-baseline" type="number" min="1" max="1000" step="1" value="'+h(setup.baseline)+'" placeholder="'+(lastStats(e.id).best||'e.g. 10')+'"></label>'+
 (e.mode==='sets'?'<label>Starting weight (kg)<input id="fd-prog-weight" type="number" min="0.5" max="1000" step="0.5" value="'+h(setup.weight)+'" placeholder="'+(lastStats(e.id).weight||'e.g. 20')+'"></label>':'')+'</div>'+
 '<label>Rest between sets<select id="fd-prog-rest">'+RESTS.map(n=>'<option value="'+n+'" '+(setup.rest===n?'selected':'')+'>'+Math.floor(n/60)+':'+String(n%60).padStart(2,'0')+'</option>').join('')+'</select></label>'+
 '<button class="primary fd-prog-wide" onclick="fdProgBegin()">Start guided session</button></section></div>';
}
function roundTime(n){const v=Math.max(0,Math.ceil(n));return String(Math.floor(v/60))+':'+String(v%60).padStart(2,'0');}
function page(){
 if(!draft)return list();
 const t=track(draft.trackId),current=draft.plan[draft.done.length];
 if(!t)return list();
 if(draft.stage==='review')return review();
 const finished=draft.done.length,primary=ex(t.primaryId),resting=draft.stage==='rest',remaining=Math.max(0,Math.ceil((draft.restUntil-Date.now())/1000));
 let id=activeId||current?.id||t.primaryId;
 if(!eligible(id))id=t.primaryId;
 const exercise=ex(id),suggest=proposed(t,id),target=id===current?.id?current.target:suggest.reps;
 const options=variants(t.primaryId);
 const dots=draft.plan.map((step,i)=>'<span class="'+(i<finished?'done':i===finished?'active':'')+'">'+(i<finished?'✓':i+1)+'</span>').join('');
 const toolbar='<div class="fd-prog-set-dots">'+dots+'</div>';
 const root='<div class="fd-prog fd-prog-session"><div class="fd-prog-top"><button onclick="fdProgPause()">‹ Back</button><span>Set '+Math.min(finished+1,draft.plan.length)+' / '+draft.plan.length+'</span></div>'+toolbar;
 if(resting){
  return root+'<section class="fd-prog-focus"><small>SET RECORDED</small><h1>Rest</h1><div id="fd-prog-countdown" class="fd-prog-clock">'+roundTime(remaining)+'</div><p>'+(draft.done[finished-1]?.actual>=draft.done[finished-1]?.target?'Take the time you need before the next set.':'You fell short of the target. Consider extra rest or a different variation.')+'</p><button class="primary fd-prog-wide" onclick="fdProgContinue()">Next set <span id="fd-prog-rest-label">'+(remaining>0?'· skip rest':'· ready')+'</span></button></section>'+
  '<div class="fd-prog-rest-options">'+[30,60,90,120].map(n=>'<button onclick="fdProgRestSet('+n+')">'+roundTime(n)+'</button>').join('')+'</div></div>';
 }
 return root+'<section class="fd-prog-focus"><small>'+h(exercise.mode==='time'?'HOLD':'WORK SET')+'</small>'+
 '<h1>'+h(exercise.name)+'</h1><div class="fd-prog-target">Suggested: <strong>'+target+' '+(exercise.mode==='time'?'seconds':'reps')+'</strong>'+(exercise.mode==='sets'?' · '+(weight||suggest.kg||'—')+' kg':'')+'</div>'+
 '<div class="fd-prog-counter"><button onclick="fdProgAdjust(-1)" aria-label="Decrease result">−</button><div><strong id="fd-prog-actual">'+actual+'</strong><small>'+(exercise.mode==='time'?'seconds':'reps')+'</small></div><button onclick="fdProgAdjust(1)" aria-label="Increase result">+</button></div>'+
 '<label class="fd-prog-field">Actual completed<input id="fd-prog-actual-input" type="number" inputmode="numeric" min="0" max="'+(exercise.mode==='time'?86400:1000)+'" step="1" value="'+actual+'" onchange="fdProgActual(this.value)"></label>'+
 (exercise.mode==='sets'?'<label class="fd-prog-field">Weight (kg)<input id="fd-prog-weight-input" type="number" min="0.5" max="1000" step="0.5" value="'+(weight||suggest.kg||'')+'" onchange="fdProgWeight(this.value)"></label>':'')+
 '<button class="primary fd-prog-wide fd-prog-record" onclick="fdProgLogSet()">'+(actual>0?'✓ Log '+actual+' '+(exercise.mode==='time'?'seconds':'reps'):'Log set')+'</button>'+
 '<button class="fd-prog-skip" onclick="fdProgSkip()">Couldn’t complete this set</button></section>'+
 '<details class="fd-prog-switch"><summary>Change exercise variation</summary><p>Any set can use a different variation, including an easier one. Each is logged under its real exercise name.</p>'+
 '<select id="fd-prog-switch" onchange="fdProgVariant(this.value)">'+options.map(x=>'<option value="'+x.id+'" '+(x.id===id?'selected':'')+'>'+h(x.name)+'</option>').join('')+'</select></details>'+
 (finished?'<button class="fd-prog-undo" onclick="fdProgUndo()">Undo previous set</button>':'')+'</div>';
}
function review(){
 const t=track(draft.trackId),rows=draft.done.filter(x=>x.actual>0),total=rows.reduce((a,x)=>a+x.actual,0);
 return '<div class="fd-prog"><header class="fd-prog-hero"><small>Session complete</small><h1>Review your sets</h1><p>Only your actual completed sets will be saved. Different variations remain different exercise records.</p></header>'+
 '<div class="fd-prog-review">'+draft.done.map((s,i)=>'<div><span>'+String(i+1).padStart(2,'0')+'</span><strong>'+h(ex(s.id)?.name)+'</strong><small>'+s.actual+(ex(s.id)?.mode==='time'?' s':' reps')+(s.weight?' @ '+s.weight+' kg':'')+' · target '+s.target+'</small></div>').join('')+'</div>'+
 '<div class="fd-prog-summary"><strong>'+total+'</strong><span>actual '+(ex(t.primaryId)?.mode==='time'?'seconds':'reps')+' across '+rows.length+' saved sets</span></div>'+
 (rows.length?'<button class="primary fd-prog-wide" onclick="fdProgFinish()">Save '+rows.length+' actual sets</button>':'<p>No completed sets to save yet.</p>')+
 '<button class="fd-prog-secondary fd-prog-wide" onclick="fdProgAdd()">+ Add another set</button><button class="fd-prog-undo" onclick="fdProgUndo()">Correct previous set</button><button class="fd-prog-discard" onclick="fdProgDiscard()">Discard draft</button></div>';
}
function detail(){
 const t=track(chosenId);if(!t)return list();
 const runs=sessionsFor(t.id),awards=trackAwards(t),p=plateau(t);
 const focus=t.focus==='both'?'Volume + variations':t.focus==='variants'?'Variations':'Volume';
 const goal=proposed(t,t.primaryId);
 return '<div class="fd-prog"><button class="fd-prog-back" onclick="fdProgList()">‹ All progressions</button>'+
 '<header class="fd-prog-hero"><small>'+h(focus)+'</small><h1>'+h(ex(t.primaryId).name)+'</h1><p>'+runs.length+' guided sessions · '+awards.length+' persistence awards</p></header>'+
 (draft?.trackId===t.id?'<button class="primary fd-prog-wide" onclick="fdProgResume()">Resume your draft</button>':'<button class="primary fd-prog-wide" onclick="fdProgStart(\''+h(t.id)+'\')">Start next session</button>')+
 '<section class="fd-prog-card"><h2>Next suggested working set</h2><strong class="fd-prog-next">'+goal.reps+' '+(ex(t.primaryId).mode==='time'?'seconds':'reps')+(goal.kg?' @ '+goal.kg+' kg':'')+'</strong><p>Targets respond to recent recorded results. You can change reps, weight or variation for any set.</p></section>'+
 (p?'<section class="fd-prog-card fd-prog-plateau"><h2>Possible plateau</h2><p>'+h(p.message)+'</p><button onclick="fdProgSupport(\''+p.id+'\')">Try '+h(ex(p.id)?.name)+' ›</button><small>One possible supporting exercise, not a diagnosis.</small></section>':'')+
 '<details class="fd-prog-disclosure"><summary>Persistence awards · '+awards.length+'/'+AWARDS.length+'</summary>'+
 AWARDS.map(x=>'<div class="fd-prog-award"><span>'+(awards.some(a=>a.id===x.id)?'◆':'○')+'</span><div><strong>'+h(x.name)+'</strong><small>'+((x.sessions||x.weeks)+' '+(x.sessions?'sessions':'distinct training weeks'))+' · +'+x.xp+' XP</small></div></div>').join('')+'</details>'+
 '<details class="fd-prog-disclosure"><summary>Recent sessions</summary>'+runs.slice(-10).reverse().map(s=>'<div class="fd-prog-history">'+new Date(s.at).toLocaleDateString('en-GB')+' · '+s.sets.length+' sets · '+s.sets.reduce((a,x)=>a+x.actual,0)+' total</div>').join('')+'</details></div>';
}
function done(){
 const t=track(chosenId),awards=t?trackAwards(t):[],p=t?plateau(t):null;
 return '<div class="fd-prog fd-prog-done"><div class="fd-prog-done-icon">✓</div><h1>Sets saved</h1><p>Real exercise records updated. Campaigns and achievements use the same logs.</p>'+
 (awards.length?'<p>Persistence awards: '+awards.length+' / '+AWARDS.length+'</p>':'')+
 (p?'<p>'+h(p.message)+'</p>':'')+
 '<button class="primary fd-prog-wide" onclick="fdProgOpen(\''+h(chosenId)+'\')">View progression</button><button class="fd-prog-secondary fd-prog-wide" onclick="fdProgList()">Done for now</button></div>';
}
window.fdProgressionsView=()=>view==='setup'?chooseMode():view==='session'?page():view==='detail'?detail():view==='done'?done():list();
window.fdProgList=()=>{view='list';chosenId=null;tab='progressions';render();};
window.fdProgFindExercise=()=>{navigate('log');};
window.fdProgressionFromExercise=id=>{
 if(!eligible(id))return;
 const prior=tracks().find(t=>t.primaryId===id);
 tab='progressions';
 if(prior){chosenId=prior.id;view='detail';}
 else{
  setup={exerciseId:id,focus:'both',variantId:variants(id).find(x=>x.id!==id)?.id||null,baseline:'',weight:'',rest:90};
  view='setup';
 }
 render();window.scrollTo({top:0,behavior:'instant'});
};
window.fdProgOpen=id=>{if(!track(id))return;chosenId=id;view='detail';tab='progressions';render();};
window.fdProgFocus=f=>{if(!FOCI.includes(f))return;setup.focus=f;view='setup';render();};
window.fdProgSetupVariant=id=>{setup.variantId=variants(setup.exerciseId).some(e=>e.id===id&&e.id!==setup.exerciseId)?id:null;};
function buildPlan(t){
 const p=t.primaryId,v=t.variantId&&eligible(t.variantId)?t.variantId:p;
 const ids=t.focus==='volume'?[p,p,p,p]:t.focus==='variants'?[p,v,v,p]:[p,p,v,p];
 return ids.map((id,i)=>({id,role:id===p?'main':'variant',target:proposed(t,id).reps}));
}
function setInputValues(){
 const e=ex(activeId),t=track(draft?.trackId);if(!e||!t)return;
 const base=proposed(t,activeId);actual=base.reps;weight=base.kg||0;
}
function beginDraft(t){
 if(draft&&draft.done.length&&!confirm('Discard your unfinished session and start a different one?'))return;
 draft={version:1,runId:'pr-'+uid(),trackId:t.id,primaryId:t.primaryId,plan:buildPlan(t),done:[],stage:'set',restUntil:0};
 if(!storeDraft())return;
 activeId=draft.plan[0].id;setInputValues();view='session';chosenId=t.id;tab='progressions';render();
}
window.fdProgBegin=()=>{
 const e=ex(setup.exerciseId);if(!e||!eligible(e.id))return;
 const b=document.getElementById('fd-prog-baseline'),w=document.getElementById('fd-prog-weight'),rest=document.getElementById('fd-prog-rest');
 const baseline=b?.value.trim()===''?lastStats(e.id).best:Number(b.value);
 const kg=e.mode==='sets'?(w?.value.trim()===''?lastStats(e.id).weight:Number(w.value)):0;
 const chosenRest=Number(rest?.value||90);
 if(!Number.isInteger(baseline)||baseline<1||baseline>1000)return alert('Enter a positive starting test or record this exercise first.');
 if(e.mode==='sets'&&(!Number.isFinite(kg)||kg<=0||kg>1000))return alert('Enter the working weight in kg.');
 if(!RESTS.includes(chosenRest))return alert('Choose a supported rest interval.');
 if(setup.focus!=='volume'&&(!setup.variantId||!eligible(setup.variantId)))return alert('Choose a variation to practise.');
 let model=S.v8;if(!model)model=S.v8={tracks:[]};
 if(model.tracks.some(t=>t.primaryId===e.id))return alert('This exercise already has a progression track.');
 if(model.tracks.length>=100)return alert('Too many progression tracks.');
 const t={id:'t-'+uid(),primaryId:e.id,focus:setup.focus,variantId:setup.focus==='volume'?null:setup.variantId,baseline,weight:kg,rest:chosenRest,started:today()};
 model.tracks.push(t);
 if(!save()){model.tracks.pop();return;}
 beginDraft(t);
};
window.fdProgStart=id=>{const t=track(id);if(t)beginDraft(t);};
window.fdProgResume=()=>{
 if(!draft)draft=readDraft();if(!draft||!track(draft.trackId))return fdProgList();
 chosenId=draft.trackId;view='session';tab='progressions';
 const current=draft.plan[draft.done.length];activeId=current?.id||draft.primaryId;setInputValues();render();
};
window.fdProgPause=()=>{if(draft)storeDraft();chosenId=draft?.trackId||chosenId;view='detail';render();};
window.fdProgVariant=id=>{
 const t=track(draft?.trackId);if(!t||!variants(t.primaryId).some(e=>e.id===id))return;
 activeId=id;setInputValues();render();
};
window.fdProgActual=value=>{
 const e=ex(activeId),max=e?.mode==='time'?86400:1000;
 if(!Number.isInteger(Number(value))||Number(value)<0||Number(value)>max)return;
 actual=Number(value);
 const display=document.getElementById('fd-prog-actual');if(display)display.textContent=String(actual);
 const btn=document.querySelector('.fd-prog-record');if(btn)btn.textContent=actual>0?'✓ Log '+actual+' '+(e.mode==='time'?'seconds':'reps'):'Log set';
};
window.fdProgAdjust=delta=>{
 const step=ex(activeId)?.mode==='time'?5:1;
 window.fdProgActual(Math.max(0,actual+step*delta));
 const input=document.getElementById('fd-prog-actual-input');if(input)input.value=actual;
};
window.fdProgWeight=value=>{const v=Number(value);if(Number.isFinite(v)&&v>0&&v<=1000)weight=v;};
function recordSet(skip){
 if(!draft||draft.stage!=='set'||draft.done.length>=draft.plan.length)return;
 const t=track(draft.trackId),e=ex(activeId),original=draft.plan[draft.done.length];
 if(!t||!e||!eligible(e.id))return;
 const input=document.getElementById('fd-prog-actual-input'),win=input?Number(input.value):actual;
 const kilograms=document.getElementById('fd-prog-weight-input'),kg=kilograms?Number(kilograms.value):weight;
 const max=e.mode==='time'?86400:1000;
 const value=skip?0:win;
 if(!Number.isInteger(value)||value<0||value>max)return alert('Enter a valid number of completed repetitions or seconds.');
 if(e.mode==='sets'&&value>0&&(!Number.isFinite(kg)||kg<=0||kg>1000))return alert('Enter a positive working weight.');
 const expected=activeId===original.id?original.target:proposed(t,activeId).reps;
 const data={id:e.id,actual:value,weight:e.mode==='sets'?kg:0,target:expected,role:activeId===t.primaryId?'main':activeId===t.variantId?'variant':'back-off',at:new Date().toISOString()};
 draft.done.push(data);
 draft.stage=draft.done.length>=draft.plan.length?'review':'rest';
 draft.restUntil=draft.stage==='rest'?Date.now()+((value<expected?Math.min(t.rest+30,300):t.rest)*1000):0;
 if(!storeDraft()){draft.done.pop();draft.stage='set';return;}
 const following=draft.plan[draft.done.length];if(following){activeId=following.id;setInputValues();}
 view='session';render();
}
window.fdProgLogSet=()=>recordSet(false);
window.fdProgSkip=()=>recordSet(true);
window.fdProgRestSet=seconds=>{if(!draft||draft.stage!=='rest'||!RESTS.includes(seconds))return;draft.restUntil=Date.now()+seconds*1000;storeDraft();render();};
window.fdProgContinue=()=>{if(!draft)return;draft.stage='set';draft.restUntil=0;storeDraft();render();};
window.fdProgUndo=()=>{
 if(!draft||!draft.done.length)return;
 const last=draft.done.pop();draft.stage='set';draft.restUntil=0;activeId=last.id;actual=last.actual;weight=last.weight||0;
 storeDraft();render();
};
window.fdProgAdd=()=>{if(!draft||draft.plan.length>=12)return;const last=draft.plan[draft.plan.length-1];draft.plan.push({...last,id:draft.primaryId,role:'main'});draft.stage='set';activeId=draft.primaryId;setInputValues();storeDraft();render();};
window.fdProgDiscard=()=>{if(!confirm('Discard this unfinished session? Already saved exercise logs are unaffected.'))return;draft=null;storeDraft();view='detail';render();};
window.fdProgSupport=id=>{if(ex(id))choose(id);};
window.fdProgFinish=()=>{
 if(!draft||draft.stage!=='review')return;
 const t=track(draft.trackId),items=draft.done.filter(x=>x.actual>0);
 if(!t||!items.length)return alert('No completed sets to save.');
 const token=draft.runId;
 if(S.logs.some(l=>l.progression?.runId===token)){draft=null;storeDraft();chosenId=t.id;view='done';render();return;}
 const previous=JSON.stringify(S),now=new Date(),date=today(),xpBefore=playerXP(),priorMilestones=new Set(earnedMilestones().map(x=>x.id));
 const entries=items.map((item,i)=>{
  const e=ex(item.id);
  const row={at:now.toISOString()+'-'+uid(),id:e.id,mode:e.mode,date,performedAt:new Date(item.at).toISOString(),notes:'',sessionId:null,
   progression:{runId:token,trackId:t.id,focusId:t.primaryId,role:item.role,setOrder:draft.done.indexOf(item)+1,target:item.target}};
  if(e.mode==='time')row.value=item.actual;
  else row.sets=[e.mode==='sets'?{weight:item.weight,reps:item.actual}:{reps:item.actual}];
  return row;
 });
 if(!entries.every(isSafeEntry))return alert('Some sets were not valid. Nothing was saved.');
 S.logs.push(...entries);resetDerived();
 if(!save()){S=JSON.parse(previous);resetDerived();return;}
 // Records are safely persisted before evaluating derived awards/challenges.
 draft=null;storeDraft();
 const revoked=reconcileCompleted(),claimed=claimReady(),newMilestones=earnedMilestones().filter(x=>!priorMilestones.has(x.id));
 S.v4=S.v4||{hunts:[],lastResult:null};
 S.v4.lastResult={logId:recordId(entries[entries.length-1]),exercise:ex(t.primaryId).name,summary:entries.length+' actual sets saved',xpGain:playerXP()-xpBefore,challengeNames:claimed.map(x=>x.label),milestones:newMilestones.map(x=>x.name)};
 save();
 chosenId=t.id;view='done';tab='progressions';render();window.scrollTo({top:0,behavior:'instant'});
 if(revoked)toast('A corrected challenge result was recalculated.');
};
window.fdProgressionDefinitions=()=>({foci:FOCI.slice(),awards:AWARDS.map(x=>({...x})),tracks:tracks().map(x=>({...x}))});
draft=readDraft();
})();
