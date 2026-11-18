/* FitnessDex Campaigns v0.6.1 — computed from existing, individually logged exercises.
 * No duplicate activity records, automatic workouts, or separate XP.
 */
(()=>{
'use strict';
const DAY=86400000;

/* Each phase has two suggested session assemblies. Exercise variations may be substituted;
 * these are examples and do not restrict which logged exercises count. */
const PHASE_SESSIONS={
 arms:[
  [['e140','e002','e100','e020'],['e139','e060','e141','e072']],
  [['e140','e005','e138','e020'],['e139','e060','e141','e072']],
  [['e140','e005','e138','e020'],['e139','e062','e141','e072']]
 ],
 core:[
  [['e017','e018','e145'],['e019','e146','e066']],
  [['e017','e018','e145'],['e019','e146','e067']],
  [['e017','e018','e145'],['e019','e146','e067']]
 ],
 squat:[
  [['e074','e075','e043','e109'],['e074','e075','e043','e104']],
  [['e027','e075','e043','e109'],['e074','e075','e043','e104']],
  [['e025','e075','e043','e109'],['e027','e075','e043','e104']],
  [['e025','e075','e043','e109'],['e027','e075','e043','e104']]
 ],
 deadlift:[
  [['e030','e043','e017','e087'],['e030','e043','e018','e109']],
  [['e030','e142','e017','e087'],['e029','e043','e018','e109']],
  [['e029','e030','e017','e087'],['e030','e142','e018','e109']],
  [['e029','e030','e017','e087'],['e030','e043','e018','e109']]
 ],
 swim:[
  [['e123'],['e051']],
  [['e123','e124'],['e122']],
  [['e122'],['e051','e123']]
 ],
 run5k:[
  [['e046','e109'],['e046'],['e046','e104']],
  [['e046','e109'],['e046'],['e046','e040']],
  [['e046','e109'],['e046'],['e046','e104']],
  [['e046','e109'],['e046'],['e046','e040']]
 ],
 grip:[
  [['e020','e073','e010'],['e072','e010']],
  [['e020','e073','e057'],['e072','e058']],
  [['e020','e073','e010'],['e072','e013']]
 ]
};
const DEFINITIONS=[
 {id:'arms',name:'Arm Forge',icon:'◆',weeks:12,kind:'12-week campaign',
  intro:'Build stronger arms through balanced pulling, pressing, shoulders and grip work.',
  phases:[
   ['Foundation','Establish comfortable movements and starting benchmarks.'],
   ['Build','Develop consistent sets, range and technique without forcing heavier weights.'],
   ['Refine','Compare your own performance, keep weak links in rotation and consolidate.']
  ],
  days:2,
  slots:[
   {id:'pull',title:'Biceps & pulling',hint:'Curl or pulling movement',ids:['e140','e139','e058','e011','e010','e057','e013','e034','e035','e059'],pick:'e140'},
   {id:'press',title:'Triceps & pressing',hint:'Push-up, dip or press',ids:['e002','e004','e005','e006','e055','e056','e060','e062','e063','e031','e033','e135','e136','e001','e003'],pick:'e002'},
   {id:'shoulders',title:'Shoulder strength & control',hint:'Overhead press, raises or scapular work',ids:['e032','e138','e137','e141','e073','e083','e100'],pick:'e100'},
   {id:'grip',title:'Grip & support',hint:'Dead hang, active hang or loaded pulling',ids:['e020','e072','e059','e034','e035'],pick:'e020'}
  ]
 },
 {id:'core',name:'Core Foundation',icon:'◈',weeks:12,kind:'12-week campaign',
  intro:'Build practical trunk strength through bracing, anti-rotation and controlled movement.',
  phases:[
   ['Learn to brace','Choose manageable holds and learn to control the trunk.'],
   ['Build capacity','Improve hold quality, repetition control and variety.'],
   ['Own the movement','Build consistent control before attempting harder variations.']
  ],
  days:2,
  slots:[
   {id:'brace',title:'Front bracing',hint:'Plank or hollow-body hold',ids:['e017','e019','e144'],pick:'e017'},
   {id:'lateral',title:'Side & anti-rotation',hint:'Side plank or Pallof press',ids:['e018','e146'],pick:'e018'},
   {id:'dynamic',title:'Controlled core movement',hint:'Crunch, leg raise or reverse crunch',ids:['e064','e065','e066','e067','e068','e069','e145'],pick:'e145'}
  ]
 },
 {id:'squat',name:'Squat Masterwork',icon:'▥',weeks:52,kind:'52-week masterwork',
  intro:'Build a squat from the ground up: movement, control, useful strength and long-term consistency.',
  phases:[
   ['Foundation · weeks 1–13','Build squat mechanics, ankle/hip range and confidence.'],
   ['Capacity · weeks 14–26','Increase controlled practice; introduce load only when comfortable.'],
   ['Strength · weeks 27–39','Progress suitable squat variations with measurable technique and load.'],
   ['Masterwork · weeks 40–52','Consolidate movement quality, long-term consistency and your own bests.']
  ],
  days:2,
  slots:[
   {id:'squat',title:'Squat pattern',hint:'Bodyweight, goblet or barbell squat',ids:['e074','e027','e025','e026','e127','e128','e129','e130'],pick:'e074'},
   {id:'single',title:'Single-leg control',hint:'Split squat or controlled lunge',ids:['e075','e076','e077','e078','e028','e119','e089'],pick:'e075'},
   {id:'hinge',title:'Hips & posterior chain',hint:'Glute bridge or suitable hinge',ids:['e043','e029','e030','e142','e133'],pick:'e043'},
   {id:'mobility',title:'Ankle & squat mobility',hint:'Deep squat hold, ankle or hip mobility',ids:['e104','e109','e087','e088','e108'],pick:'e104'}
  ]
 },
 {id:'deadlift',name:'Deadlift Mastery',icon:'▣',weeks:52,kind:'52-week masterwork',
  intro:'Develop a confident hinge, trunk stability and measurable posterior-chain strength. Increase load only when ready.',
  phases:[
   ['Foundation · weeks 1–13','Hinge technique, bracing and comfortable mobility.'],
   ['Build · weeks 14–26','Consistent hinge practice and posterior-chain support.'],
   ['Strength · weeks 27–39','Add controlled loaded deadlifts when appropriate.'],
   ['Mastery · weeks 40–52','Consolidate technique and long-term strength.']
  ],days:2,
  slots:[
   {id:'hinge',title:'Hinge practice',ids:['e029','e030','e131','e132','e133','e134'],pick:'e030'},
   {id:'posterior',title:'Posterior-chain support',ids:['e043','e142'],pick:'e043'},
   {id:'brace',title:'Trunk stability',ids:['e017','e018','e019','e146'],pick:'e017'},
   {id:'mobility',title:'Hip & ankle mobility',ids:['e087','e088','e104','e109'],pick:'e087'}
  ]
 },
 {id:'swim',name:'Swimcraft',icon:'≈',weeks:26,kind:'26-week campaign',
  intro:'Improve swimming consistency, stroke control and endurance relative to your starting point.',
  phases:[
   ['Water confidence · weeks 1–9','Make swimming repeatable and establish a baseline.'],
   ['Stroke development · weeks 10–17','Practice technique and try another stroke when comfortable.'],
   ['Endurance · weeks 18–26','Extend sustainable swimming; the mile is optional.']
  ],days:2,
  slots:[
   {id:'pool',title:'Pool sessions',ids:['e051','e121','e122','e123'],days:2,pick:'e051'},
   {id:'stroke',title:'Stroke practice',ids:['e121','e122','e123','e124'],pick:'e123'}
  ]
 },
 {id:'run5k',name:'The 5K Engine',icon:'↗',weeks:16,kind:'16-week campaign',
  intro:'Establish three running days, develop endurance and track progress towards a comfortable 5K.',
  phases:[
   ['Build the habit · weeks 1–4','Begin at your current level. Run–walk intervals are fine.'],
   ['Grow endurance · weeks 5–8','Develop repeatable running rather than racing each session.'],
   ['Develop the engine · weeks 9–12','Increase sustainable distance with suitable easy days.'],
   ['Consolidate 5K · weeks 13–16','Measure your own 5K performance when ready.']
  ],days:3,
  slots:[
   {id:'running',title:'Running days',ids:['e046','e047'],days:3,pick:'e046'},
   {id:'mobility',title:'Runner mobility',ids:['e109','e108','e104','e040','e042','e087'],pick:'e109'}
  ]
 },
 {id:'grip',name:'Grip Mastery',icon:'⌁',weeks:12,kind:'12-week campaign',
  intro:'Build hanging endurance, shoulder control and more confident grip-supported pulling.',
  phases:[
   ['Hang foundation','Find comfortable hangs and shoulder positions.'],
   ['Build capacity','Develop repeatable active hangs and suitable pulling.'],
   ['Consolidate strength','Compare your own hold times and controlled reps.']
  ],days:2,
  slots:[
   {id:'hang',title:'Hanging practice',ids:['e020','e072'],days:2,pick:'e020'},
   {id:'shoulders',title:'Scapular control',ids:['e072','e073','e100'],pick:'e072'},
   {id:'pull',title:'Grip-supported pulling',ids:['e010','e057','e011','e013','e058','e034','e035'],pick:'e010'}
  ]
 }
];
const byId=id=>DEFINITIONS.find(x=>x.id===id);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const midnight=s=>Date.parse(s+'T00:00:00Z');
const weekOf=(date,start)=>Math.floor((midnight(date)-midnight(start))/DAY/7);
const records=()=>Array.isArray(S.v7?.campaigns)?S.v7.campaigns:[];
const enrollment=id=>records().find(x=>x.id===id);
let selected=null;
function phaseBounds(def,p){return [Math.round(p*def.weeks/def.phases.length),Math.round((p+1)*def.weeks/def.phases.length)];}
function phaseIndex(def,index){const p=def.phases.findIndex((_,i)=>index<phaseBounds(def,i)[1]);return p<0?def.phases.length-1:p;}
function allIDs(def){return new Set(def.slots.flatMap(x=>x.ids));}
const MISSED_WEEK_DAYS=7;
const BASELINE_GAP_DAYS=28;
const shiftDay=(date,days)=>new Date(midnight(date)+days*DAY).toISOString().slice(0,10);
const dayGap=(start,end)=>Math.round((midnight(end)-midnight(start))/DAY);
const firstTrainingSlot=def=>def.slots[0];
function campaignLogs(def,enrolled,day){
 const ids=allIDs(def),now=Date.now();
 return S.logs.filter(l=>ids.has(l.id)&&validDate(l.date)&&l.date>=enrolled.started&&l.date<=day
  &&Number.isFinite(logWhen(l))&&logWhen(l)<=now+60000);
}
function weekStatus(def,index,logs){
 const days=new Set(logs.map(x=>x.date)).size;
 const slots=def.slots.map(slot=>{const matches=l=>slot.ids.includes(l.id)||(def.id==='swim'&&slot.id==='stroke'&&l.id==='e051'&&['Front crawl','Breaststroke','Backstroke','Butterfly'].includes(l.stroke));const covered=new Set(logs.filter(matches).map(l=>l.date)).size;const target=slot.days||1;return {...slot,covered,target,done:covered>=target};});
 return {index,days,slots,completed:days>=def.days&&slots.every(x=>x.done)};
}
function schedule(def,enrolled,day,breaks){
 let anchor=enrolled.started,from=anchor,attempt=0,furthest=0,run=0;
 const windows=[],past=[];
 for(const gap of breaks){
  const boundary=gap.from>day?shiftDay(day,1):gap.from;
  windows.push({from,to:boundary,anchor,attempt,run});
  const week=Math.min(def.weeks-1,Math.max(0,weekOf(boundary,anchor)));
  furthest=Math.max(furthest,weekOf(boundary,anchor),gap.reached??0);
  if(!gap.resumed)return {status:'paused',week,windows,furthest,gap,run,past};
  const start=gap.baselineDone||gap.resumed;
  const ready=gap.mode==='deload'||gap.mode==='baseline'?shiftDay(start,7):gap.resumed;
  if(gap.mode==='baseline'&&!gap.baselineDone)
   return {status:'baseline',week:gap.week,windows,furthest,gap,run,past};
  if(day<ready)return {status:gap.mode==='planned'?'recovery':gap.mode==='restart'?'restart':'deload',week:gap.week??week,windows,furthest,gap,run,past,ready};
  if(gap.mode==='restart'){past.push(furthest);run++;furthest=0;}
  if(gap.week!==undefined){
   anchor=shiftDay(ready,-gap.week*7);
   attempt++;
  }else anchor=shiftDay(anchor,dayGap(gap.from,ready));
  from=ready;
 }
 const end=shiftDay(anchor,def.weeks*7);
 const week=Math.max(0,weekOf(day,anchor));
 windows.push({from,to:day<end?shiftDay(day,1):end,anchor,attempt,run});
 return {status:week>=def.weeks?'finished':'active',week:Math.min(def.weeks-1,week),
  windows,furthest:Math.min(def.weeks,Math.max(furthest,week)),from,attempt,end,run,past};
}
function trainingDates(def,rows,from,to){
 const required=def.slots.find(slot=>slot.days===def.days);
 const ids=new Set(required?.ids??allIDs(def));
 return [...new Set(rows.filter(l=>ids.has(l.id)&&l.date>=from&&l.date<to).map(l=>l.date))].sort();
}
function pendingGap(def,plan,rows,day,managed){
 let from=plan.from,lastGap=null,returned=0;
 for(const trained of trainingDates(def,rows,plan.from,plan.end)){
  if(dayGap(from,trained)>=MISSED_WEEK_DAYS){lastGap={from,until:trained};returned=0;}
  returned++;
  from=shiftDay(trained,1);
 }
 if(from<plan.end&&dayGap(from,day)>=MISSED_WEEK_DAYS)return {from,until:day};
 // A first log back after a break can be used as the baseline.
 if(managed&&lastGap&&returned<def.days)return lastGap;
 return null;
}
function progressOf(def,enrolled){
 const day=enrolled.ended||today(),rows=campaignLogs(def,enrolled,day),breaks=enrolled.breaks||[];
 let plan=schedule(def,enrolled,day,breaks);
 if(!enrolled.ended&&(plan.status==='active'||(plan.status==='finished'&&enrolled.managed))){
  const pending=pendingGap(def,plan,rows,day,enrolled.managed);
  if(pending){
   const gap={from:pending.from};
   plan={...schedule(def,enrolled,day,[...breaks,gap]),status:'inactive',gap,missedUntil:pending.until};
  }
 }
 if(enrolled.ended)plan.status='ended';
 const byAttempt=new Map(),byRun=Array.from({length:plan.run+1},()=>new Set());
 for(const window of plan.windows){
  if(!byAttempt.has(window.attempt))byAttempt.set(window.attempt,{run:window.run,groups:new Map()});
  const {groups}=byAttempt.get(window.attempt);
  for(const l of rows){
   if(l.date<window.from||l.date>=window.to)continue;
   const week=weekOf(l.date,window.anchor);
   if(week<0||week>=def.weeks)continue;
   if(!groups.has(week))groups.set(week,[]);
   groups.get(week).push(l);
  }
 }
 for(const {groups,run} of byAttempt.values())for(const [week,logs] of groups)if(weekStatus(def,week,logs).completed)byRun[run].add(week);
 const earned=byRun[plan.run];
 const complete=earned.size;
 const medalGoal=Math.ceil(def.weeks*.75);
 const medals=def.phases.map((phase,index)=>{
  const [first,end]=phaseBounds(def,index);
  const wins=[...earned].filter(week=>week>=first&&week<end).length;
  const needed=Math.ceil((end-first)*.7);
  const pastMedal=plan.past.some((reached,run)=>reached>=end&&[...byRun[run]].filter(week=>week>=first&&week<end).length>=needed);
  return {name:phase[0],wins,needed,earned:pastMedal||(plan.furthest>=end&&wins>=needed),finished:plan.furthest>=end};
 });
 const current=plan.status==='active'?weekStatus(def,plan.week,byAttempt.get(plan.attempt)?.groups.get(plan.week)||[]):null;
 const priorWeeks=byRun.slice(0,-1).reduce((total,weeks)=>total+weeks.size,0);
 return {...plan,rows:plan.end?rows.filter(l=>l.date<plan.end):rows,earned,complete,medals,current,priorWeeks,graduated:plan.furthest>=def.weeks&&complete>=medalGoal};
}
function lastCompleted(state){
 return Math.max(0,...[...state.earned].filter(week=>week<=state.week));
}
function returnPlan(def,state){
 const lastWindow=state.windows.at(-1);
 const lastTraining=trainingDates(def,state.rows,lastWindow.from,state.gap.from).at(-1);
 const from=state.status==='paused'?(lastTraining?shiftDay(lastTraining,1):lastWindow.from):state.gap.from;
 const missed=Math.max(0,dayGap(from,state.missedUntil||today()));
 const repeat=lastCompleted(state);
 if(missed>=BASELINE_GAP_DAYS)return {mode:'baseline',week:phaseBounds(def,phaseIndex(def,repeat))[0]};
 if(missed>=14)return {mode:'deload',week:repeat};
 if(missed>=MISSED_WEEK_DAYS)return {week:repeat};
 return {};
}
function benchmark(def,rows){
 // Compare like with like: the same exercise ID and the same measured quantity.
 // Longer sessions and higher recorded distances show capacity, not a clinical fitness score.
 const ids=allIDs(def),series=new Map();
 function record(id,kind,value,time){
  if(!Number.isFinite(value)||value<=0)return;
  const key=id+':'+kind;
  if(!series.has(key))series.set(key,{id,kind,values:[]});
  series.get(key).values.push({value,time});
 }
 for(const l of rows){
  if(!ids.has(l.id))continue;
  const e=ex(l.id);if(!e)continue;
  const m=logMetrics(l),time=logWhen(l);
  if(e.mode==='sets')record(e.id,'estimated1rm',m.e1rm,time);
  if(e.mode==='bodysets')record(e.id,'reps',m.bestReps,time);
  if(e.mode==='time')record(e.id,'seconds',m.seconds,time);
  if(e.mode==='distance'){
    record(e.id,'distance',m.distance,time);
    if(m.distance>=4.95&&m.distance<=5.05&&n(l.minutes)>0)
      record(e.id,'5kpace',n(l.minutes)/m.distance,time);
  }
  if(e.mode==='duration'){
    if(Number.isInteger(Number(l.lengths))&&n(l.lengths)>0)
      record(e.id,'lengths',n(l.lengths),time);
    else record(e.id,'minutes',m.minutes,time);
  }
 }
 const units={estimated1rm:'kg estimated 1RM',reps:'consecutive reps',seconds:'s held',
   distance:'km logged',lengths:'pool lengths logged',minutes:'minutes logged', '5kpace':'min/km over ~5 km'};
 const output=[];
 for(const item of series.values()){
  item.values.sort((a,b)=>a.time-b.time);
  if(item.values.length<2)continue;
  const initial=item.values[0].value;
  const best=item.kind==='5kpace'?Math.min(...item.values.map(x=>x.value)):Math.max(...item.values.map(x=>x.value));
  const improvement=item.kind==='5kpace'?initial-best:best-initial;
  output.push({name:ex(item.id).name,initial,best,improvement,unit:units[item.kind],kind:item.kind});
 }
 return output.sort((a,b)=>b.improvement/Math.max(1,b.initial)-a.improvement/Math.max(1,a.initial)).slice(0,4);
}
function campaignStatus(state){
 switch(state.status){
  case 'paused': return 'Paused';
  case 'inactive': return 'Return needed';
  case 'baseline': return 'Baseline';
  case 'deload': return 'Return week';
  case 'recovery': return 'Recovery week';
  case 'restart': return 'Restart scheduled';
  case 'ended': return 'Ended';
  case 'finished': return 'Campaign finished';
  default: return 'Week '+(state.week+1);
 }
}
const campaignButton=(action,def,label,primary=false)=>'<button type="button"'+(primary?' class="primary fd-campaign-main"':'')+' onclick="'+action+'(\''+def.id+'\')">'+label+'</button>';
function returnPanel(def,state){
 let copy='',button='';
 switch(state.status){
  case 'paused':
  case 'inactive':{
   const plan=returnPlan(def,state);
   const week=(plan.week??state.week)+1;
   copy=plan.mode==='baseline'?'Log a short baseline, then take an easier week before starting week '+week+'.'
    :plan.mode==='deload'?'Take an easier return week, then repeat week '+week+'.'
    :plan.week!==undefined?'Repeat week '+week+' before moving on.':'Resume week '+week+' where you left off.';
   button=campaignButton('fdCampaignResume',def,'Resume campaign',true);
   if(plan.week===undefined&&state.earned.size&&state.gap.from<=today())
    button+=campaignButton('fdCampaignRepeat',def,'Repeat last completed week');
   break;
  }
  case 'baseline':{
   const slot=firstTrainingSlot(def);
   const logged=state.rows.some(l=>l.date>=state.gap.resumed&&slot.ids.includes(l.id));
   copy='Log one short, comfortable '+escape(ex(slot.pick).name.toLowerCase())+' session as a baseline. Then begin your return week.';
   button=logged?campaignButton('fdCampaignBaselineDone',def,'Begin return week',true)
    :'<button type="button" class="primary fd-campaign-main" onclick="fdCampaignLog(\''+slot.pick+'\')">Log baseline</button>';
   break;
  }
  case 'deload':
   copy='Use fewer sessions, a shorter duration, lighter loads or easier variations. Week '+(state.week+1)+' starts on '+state.ready+'.';
   button='<button type="button" onclick="fdCampaignLog(\''+firstTrainingSlot(def).pick+'\')">Log an easy session</button>';
   break;
  case 'restart':
   copy='Week 1 starts on '+state.ready+'.';
   break;
  case 'recovery':
   copy='Your campaign resumes on '+state.ready+'. This planned week does not count as time missed.';
   break;
  default:
   copy=state.complete+' of '+def.weeks+' qualifying weeks. Your logged work and milestones are in your history.';
 }
 return '<section class="fd-campaign-panel"><h2>'+campaignStatus(state)+'</h2><p>'+copy+'</p>'+button+'</section>';
}
function campaignControls(def,state){
 if(['finished','ended'].includes(state.status))return campaignButton('fdCampaignRestart',def,'Start again');
 const actions=state.status==='active'?campaignButton('fdCampaignPause',def,'Pause campaign')
  +campaignButton('fdCampaignRecovery',def,'Plan recovery week'):'';
 return '<details class="fd-campaign-disclosure"><summary>Manage campaign</summary><div class="fd-campaign-alternatives"><div>'+actions
  +campaignButton('fdCampaignEnd',def,'End campaign')+'</div></div></details>';
}
function listView(){
 return '<div class="fd-campaigns"><header class="fd-campaign-hero"><h1>Campaigns</h1></header>'+
  '<div class="fd-campaign-list">'+DEFINITIONS.map(def=>{
   const enrolled=enrollment(def.id),progress=enrolled?progressOf(def,enrolled):null;
   return '<button class="fd-campaign-choice" data-campaign="'+def.id+'" onclick="fdCampaignOpen(this.dataset.campaign)"><span class="fd-campaign-symbol">'+def.icon+'</span><span class="fd-campaign-copy"><strong>'+escape(def.name)+'</strong><small>'+escape(def.kind)+' · '+def.days+' training days/week</small><small>'+(progress?progress.complete+' qualifying weeks · '+campaignStatus(progress):'Not started')+'</small></span><span class="fd-arrow">›</span></button>';
  }).join('')+'</div><p class="hint">Each campaign reads your existing activity logs. Standalone sets and normal workouts both count. Start one or several; they never require separate logging.</p></div>';
}
function details(def){
 const active=enrollment(def.id),state=active?progressOf(def,active):null,stage=state?.week??0;
 const phase=phaseIndex(def,stage),phaseInfo=def.phases[phase];
 let inner='';
 if(!active){
  inner='<section class="fd-campaign-panel"><h2>Start when you are ready</h2><p>This is a '+def.weeks+'-week calendar-based programme. There are no automatic weight increases or forced workouts.</p><button class="primary fd-campaign-main" onclick="fdCampaignStart(\''+def.id+'\')">Start '+escape(def.name)+'</button></section>';
 }else{
  const current=state.current;
  const slots=current?.slots||[];
  const unmet=slots.find(x=>!x.done);
  const next=unmet||def.slots.find(x=>x.ids.some(id=>state.rows.some(l=>l.id===id)))||def.slots[0];
  const isTrainedToday=current&&state.rows.some(l=>l.date===today()&&next.ids.includes(l.id));
  const suggestions=(current?
   '<section class="fd-campaign-panel"><div class="fd-campaign-sectionhead"><h2>This week</h2><span>'+current.days+'/'+def.days+' training days</span></div>'+
   '<div class="fd-campaign-track">'+slots.map(s=>'<div><span class="'+(s.done?'fd-campaign-check':'fd-campaign-uncheck')+'">'+(s.done?'✓':'○')+'</span><span>'+escape(s.title)+(s.target>1?' · '+s.covered+'/'+s.target+' days':'')+'</span></div>').join('')+'</div>'+
   '<p class="hint">'+(current.completed?'Weekly plan complete. More work is optional.':unmet?'One focus at a time. Complete the remaining areas across at least '+def.days+' days.':'All areas covered. One more separate training day completes the weekly plan.')+'</p>'+
   (isTrainedToday?'<p class="hint">You already logged this area today. Consider recovery before another demanding session.</p>':'')+
   '<button class="primary fd-campaign-main" onclick="fdCampaignLog(\''+next.pick+'\')">'+(unmet?'Log '+escape(next.title):'Log another exercise')+'</button>'+
   '<details class="fd-campaign-options"><summary>Choose a different exercise</summary>'+def.slots.map(s=>'<div class="fd-campaign-alternatives"><b>'+escape(s.title)+'</b><div>'+s.ids.filter(id=>!!ex(id)).map(id=>'<button type="button" class="small" onclick="fdCampaignLog(\''+id+'\')">'+escape(ex(id).name)+'</button>').join('')+'</div></div>').join('')+'</details></section>'
   :returnPanel(def,state));
  const planGuide=phase===0?'2 comfortable sets per exercise':phase===1?'2–3 controlled sets where appropriate':'2–3 quality sets; choose loads or holds that suit your current ability';
  const sessionPlan='<details class="fd-campaign-sessions"><summary>Suggested sessions <small>optional examples</small></summary>'+
   '<p>Use these examples on separate days. Adapt the exercises and avoid load or movement progressions you are not ready for. General aim: '+escape(planGuide)+'.</p>'+
   PHASE_SESSIONS[def.id][phase].map((items,i)=>'<div class="fd-campaign-session"><h3>Session '+String.fromCharCode(65+i)+'</h3>'+
      items.map(id=>'<div class="fd-campaign-session-row"><span>'+escape(ex(id).name)+'</span><button class="small" onclick="fdCampaignLog(\''+id+'\')">Log</button></div>').join('')+'</div>').join('')+'</details>';
  const phases='<details class="fd-campaign-disclosure"><summary>Chapter milestones · '+state.medals.filter(m=>m.earned).length+' earned</summary><div class="fd-campaign-chapters">'+state.medals.map((m,i)=>'<div class="fd-campaign-chapter '+(m.earned?'earned':'')+'"><div class="fd-campaign-chapter-name"><strong>'+(m.earned?'◆ ':'' )+escape(m.name)+'</strong><small>'+(m.earned?'Medal earned':m.finished?'Chapter finished':'Upcoming / underway')+'</small></div><small>'+m.wins+'/'+m.needed+' qualifying weeks</small></div>').join('')+'</div></details>';
  const benchmarks=benchmark(def,state.rows);
  const comparison='<details class="fd-campaign-disclosure"><summary>Performance changes</summary>'+
   (benchmarks.length?benchmarks.map(x=>'<div class="fd-campaign-benchmark"><strong>'+escape(x.name)+'</strong><span>'+Math.round(x.initial*10)/10+' → '+Math.round(x.best*10)/10+' '+escape(x.unit)+(x.improvement>0?(x.kind==='5kpace'?' · '+Math.round(x.improvement*100)/100+' min/km faster':' · +'+Math.round(x.improvement*10)/10):'')+'</span></div>').join(''):'<p class="hint">Record the same exercise at least twice to compare its first recorded performance with its best result. No bodyweight or appearance target.</p>')+
   '<p class="hint">Estimated lifting strength is based on logged sets of 1–10 reps. Comparisons are per exercise, not between different variations.</p></details>';
  inner='<div class="fd-campaign-stats"><div><strong>'+state.complete+'/'+def.weeks+'</strong><span>Qualifying weeks</span></div><div><strong>'+(state.week+1)+'</strong><span>Current / final week</span></div><div><strong>'+state.medals.filter(m=>m.earned).length+'/'+def.phases.length+'</strong><span>Chapter medals</span></div></div>'+
    (state.graduated?'<div class="fd-campaign-graduate">◆ '+(def.id==='squat'?'Masterwork':'Campaign')+' completed — consistency earned across '+state.complete+' weeks.</div>':'')+
    (state.priorWeeks?'<p class="hint">'+state.priorWeeks+' qualifying weeks in earlier attempts.</p>':'')+suggestions+(current?sessionPlan:'')+phases+comparison+campaignControls(def,state);
 }
 return '<div class="fd-campaigns fd-campaign-detail"><button class="fd-campaign-back" onclick="fdCampaignBack()">‹ All campaigns</button>'+
  '<header class="fd-campaign-hero"><small>'+escape(def.kind)+'</small><h1>'+escape(def.name)+'</h1><p>'+escape(def.intro)+'</p></header>'+
  '<div class="fd-campaign-phase"><span>Development chapter '+(phase+1)+' / '+def.phases.length+'</span><strong>'+escape(phaseInfo[0])+'</strong><p>'+escape(phaseInfo[1])+'</p></div>'+
  inner+'<details class="fd-campaign-safety"><summary>How the campaign works</summary><p>Meet all weekly focus areas across at least '+def.days+' different days. Every qualifying week is calculated from real activity logs. Chapter medals require 70% of that chapter’s weeks and are awarded only after the chapter has ended; finishing a campaign requires at least 75% qualifying weeks.</p><p>A full missed training week repeats your last completed week. After two missed weeks, you return with an easier week. After four, log a short baseline first. Train within your ability, allow recovery between demanding sessions and progress loading gradually. No campaign asks you to train through pain.</p></details></div>';
}
window.fdCampaignsView=()=>selected&&byId(selected)?details(byId(selected)):listView();
window.fdCampaignOpen=id=>{if(!byId(id))return;selected=id;tab='campaigns';render();window.scrollTo({top:0,behavior:'instant'});};
window.fdCampaignBack=()=>{selected=null;tab='campaigns';render();window.scrollTo({top:0,behavior:'instant'});};
window.fdCampaignStart=id=>{
 const def=byId(id);if(!def||enrollment(id))return;
 if(!S.v7)S.v7={campaigns:[]};
 if(!Array.isArray(S.v7.campaigns)||S.v7.campaigns.length>=DEFINITIONS.length)return;
 S.v7.campaigns.push({id,started:today(),managed:true});
 if(!save()){S.v7.campaigns.pop();return;}
 selected=id;render();toast(def.name+' started. Your existing activity logs count automatically.');
};
function updateCampaign(id,update){
 const def=byId(id),enrolled=enrollment(id);
 if(!def||!enrolled)return;
 const state=progressOf(def,enrolled);
 const before=JSON.stringify(enrolled);
 const changed=update(def,enrolled,state);
 if(!changed)return;
 if(!validCampaignState(S.v7)||!save()){
  const index=records().indexOf(enrolled);
  records()[index]=JSON.parse(before);
  return;
 }
 render();
}
function boundaryForPause(state){
 const trained=state.rows.some(l=>l.date===today());
 return trained?shiftDay(today(),1):today();
}
window.fdCampaignPause=id=>updateCampaign(id,(def,enrolled,state)=>{
 if(state.status!=='active')return false;
 (enrolled.breaks??=[]).push({from:boundaryForPause(state)});
 return true;
});
window.fdCampaignRecovery=id=>updateCampaign(id,(def,enrolled,state)=>{
 if(state.status!=='active')return false;
 const from=boundaryForPause(state);
 (enrolled.breaks??=[]).push({from,resumed:shiftDay(from,7),mode:'planned'});
 return true;
});
function resumeCampaign(id,repeat=false){return updateCampaign(id,(def,enrolled,state)=>{
 if(!['paused','inactive'].includes(state.status))return false;
 const gaps=enrolled.breaks??=[];
 const {mode,week}=returnPlan(def,state);
 if(repeat&&(week!==undefined||!state.earned.size||state.gap.from>today()))return false;
 if(!repeat&&state.status==='paused'&&state.gap.from>=today()){
  gaps.pop();
  return true;
 }
 const resumed={from:state.gap.from,resumed:today(),reached:state.furthest};
 if(repeat)resumed.week=lastCompleted(state);
 else if(week!==undefined)resumed.week=week;
 if(mode)resumed.mode=mode;
 enrolled.managed=true;
 if(state.status==='paused')gaps[gaps.length-1]=resumed;
 else gaps.push(resumed);
 return true;
});
}
window.fdCampaignResume=id=>resumeCampaign(id);
window.fdCampaignRepeat=id=>resumeCampaign(id,true);
window.fdCampaignBaselineDone=id=>updateCampaign(id,(def,enrolled,state)=>{
 if(state.status!=='baseline'||!state.rows.some(l=>l.date>=state.gap.resumed&&firstTrainingSlot(def).ids.includes(l.id)))return false;
 state.gap.baselineDone=today();
 return true;
});
window.fdCampaignEnd=id=>updateCampaign(id,(def,enrolled,state)=>{
 if(['finished','ended'].includes(state.status)||!confirm('End '+def.name+'? Your qualifying weeks and activity history stay saved.'))return false;
 if(state.status==='inactive')(enrolled.breaks??=[]).push(state.gap);
 enrolled.ended=today();
 return true;
});
window.fdCampaignRestart=id=>updateCampaign(id,(def,enrolled,state)=>{
 if(!['finished','ended'].includes(state.status)||!confirm('Start again at week 1? Previous qualifying weeks and milestones stay visible.'))return false;
 const gaps=enrolled.breaks??=[];
 // If the previous campaign ended during a break, extend that break to the restart.
 const from=state.gap?.from??(enrolled.ended?shiftDay(enrolled.ended,1):state.end);
 const restart={from,resumed:from>today()?from:today(),week:0,reached:state.furthest,mode:'restart'};
 if(state.gap)gaps[gaps.length-1]=restart;
 else gaps.push(restart);
 delete enrolled.ended;
 enrolled.managed=true;
 return true;
});
window.fdCampaignLog=id=>{if(!ex(id))return;choose(id);};
const oldNavigate=navigate;
navigate=function(next){if(next==='campaigns')selected=null;return oldNavigate(next);};
window.fdCampaignDefinitions=()=>DEFINITIONS.map(x=>({id:x.id,name:x.name,weeks:x.weeks,slots:x.slots.map(s=>s.id)}));
})();
