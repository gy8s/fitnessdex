/* FitnessDex Campaigns v0.6.1 — computed from existing, individually logged exercises.
 * No duplicate activity records, automatic workouts, or separate XP.
 */
(()=>{
'use strict';
const DAY=86400000;
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
 }
];
const byId=id=>DEFINITIONS.find(x=>x.id===id);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const midnight=s=>Date.parse(s+'T00:00:00Z');
const weekOf=(date,start)=>Math.floor((midnight(date)-midnight(start))/DAY/7);
const records=()=>Array.isArray(S.v7?.campaigns)?S.v7.campaigns:[];
const enrollment=id=>records().find(x=>x.id===id);
let selected=null;
function phaseIndex(def,index){return Math.min(def.phases.length-1,Math.floor(index/(def.weeks/def.phases.length)));}
function phaseBounds(def,p){const span=def.weeks/def.phases.length;return [p*span,Math.min(def.weeks,(p+1)*span)];}
function allIDs(def){return new Set(def.slots.flatMap(x=>x.ids));}
function countedLogs(def,started){
 const ids=allIDs(def),now=Date.now();
 return S.logs.filter(l=>ids.has(l.id)&&validDate(l.date)&&l.date>=started&&Number.isFinite(logWhen(l))&&logWhen(l)<=now+60000&&weekOf(l.date,started)>=0&&weekOf(l.date,started)<def.weeks);
}
function weekStatus(def,started,index,rows){
 const logs=rows.filter(l=>weekOf(l.date,started)===index);
 const days=new Set(logs.map(x=>x.date)).size;
 const slots=def.slots.map(slot=>({...slot,done:logs.some(x=>slot.ids.includes(x.id))}));
 const completed=days>=def.days&&slots.every(x=>x.done);
 return {index,days,slots,completed};
}
function progressOf(def,started){
 const elapsed=Math.max(0,weekOf(today(),started));
 const activeIndex=elapsed<def.weeks?elapsed:null;
 const rows=countedLogs(def,started);
 const weeks=Array.from({length:def.weeks},(_,i)=>weekStatus(def,started,i,rows));
 const complete=weeks.filter(w=>w.completed).length;
 const closed=Math.min(def.weeks,elapsed);
 const goalsMet=Math.round(100*complete/def.weeks);
 const medalGoal=Math.ceil(def.weeks*.75);
 const medals=def.phases.map((phase,index)=>{
  const [first,end]=phaseBounds(def,index);
  const wins=weeks.slice(first,end).filter(w=>w.completed).length;
  const needed=Math.ceil((end-first)*.7);
  return {name:phase[0],wins,needed,earned:elapsed>=end&&wins>=needed,finished:elapsed>=end};
 });
 return {elapsed,activeIndex,rows,weeks,complete,closed,goalsMet,medalGoal,medals,graduated:elapsed>=def.weeks&&complete>=medalGoal};
}
function benchmark(def,rows){
 const ids=allIDs(def),map=new Map();
 for(const l of rows){
  if(!ids.has(l.id))continue;
  const e=ex(l.id);if(!e)continue;
  const metric=logMetrics(l);
  const type=e.mode==='sets'?'e1rm':e.mode==='bodysets'?'bestReps':e.mode==='time'?'seconds':null;
  const value=type==='e1rm'?metric.e1rm:type==='bestReps'?metric.bestReps:type==='seconds'?metric.seconds:0;
  if(!Number.isFinite(value)||value<=0)continue;
  if(!map.has(e.id))map.set(e.id,[]);
  map.get(e.id).push({value,date:l.date,when:logWhen(l)});
 }
 const list=[];
 for(const [id,samples] of map){
  samples.sort((a,b)=>a.when-b.when);
  if(samples.length<2)continue;
  const initial=samples[0].value,best=Math.max(...samples.map(x=>x.value));
  const e=ex(id),unit=e.mode==='sets'?'kg estimated 1RM':e.mode==='time'?'s held':'consecutive reps';
  list.push({name:e.name,initial,best,improvement:best-initial,unit});
 }
 return list.sort((a,b)=>b.improvement/Math.max(1,b.initial)-a.improvement/Math.max(1,a.initial)).slice(0,3);
}
function listView(){
 return '<div class="fd-campaigns"><header class="fd-campaign-hero"><small>Long-term training</small><h1>Campaigns</h1><p>Train consistently. Build skills. Track what changes, not the number on the scale.</p></header>'+
  '<div class="fd-campaign-list">'+DEFINITIONS.map(def=>{
   const enrolled=enrollment(def.id),progress=enrolled?progressOf(def,enrolled.started):null;
   return '<button class="fd-campaign-choice" data-campaign="'+def.id+'" onclick="fdCampaignOpen(this.dataset.campaign)"><span class="fd-campaign-symbol">'+def.icon+'</span><span class="fd-campaign-copy"><strong>'+escape(def.name)+'</strong><small>'+escape(def.kind)+' · '+def.days+' training days/week</small><small>'+(progress?progress.complete+' qualifying weeks · '+(progress.activeIndex===null?'Campaign ended':'Week '+(progress.activeIndex+1)):'Not started')+'</small></span><span class="fd-arrow">›</span></button>';
  }).join('')+'</div><p class="hint">Each campaign reads your existing activity logs. Standalone sets and normal workouts both count. Start one or several; they never require separate logging.</p></div>';
}
function details(def){
 const active=enrollment(def.id),state=active?progressOf(def,active.started):null,stage=state?(state.activeIndex??def.weeks-1):0;
 const phase=phaseIndex(def,stage),phaseInfo=def.phases[phase];
 let inner='';
 if(!active){
  inner='<section class="fd-campaign-panel"><h2>Start when you are ready</h2><p>A 12-week campaign is a calendar-based programme; the Squat Masterwork lasts 52 weeks. There are no automatic weight increases or forced workouts.</p><button class="primary fd-campaign-main" onclick="fdCampaignStart(\''+def.id+'\')">Start '+escape(def.name)+'</button></section>';
 }else{
  const current=state.activeIndex===null?null:state.weeks[state.activeIndex];
  const slots=current?.slots||[];
  const unmet=slots.find(x=>!x.done);
  const next=unmet||def.slots.find(x=>x.ids.some(id=>state.rows.some(l=>l.id===id)))||def.slots[0];
  const isTrainedToday=current&&state.rows.some(l=>l.date===today()&&next.ids.includes(l.id));
  const suggestions=(current?
   '<section class="fd-campaign-panel"><div class="fd-campaign-sectionhead"><h2>This week</h2><span>'+current.days+'/'+def.days+' training days</span></div>'+
   '<div class="fd-campaign-track">'+slots.map(s=>'<div><span class="'+(s.done?'fd-campaign-check':'fd-campaign-uncheck')+'">'+(s.done?'✓':'○')+'</span><span>'+escape(s.title)+'</span></div>').join('')+'</div>'+
   '<p class="hint">'+(current.completed?'Weekly plan complete. More work is optional.':unmet?'One focus at a time. Complete the remaining areas across at least two days.':'All areas covered. One more separate training day completes the weekly plan.')+'</p>'+
   (isTrainedToday?'<p class="hint">You already logged this area today. Consider recovery before another demanding session.</p>':'')+
   '<button class="primary fd-campaign-main" onclick="fdCampaignLog(\''+next.pick+'\')">'+(unmet?'Log '+escape(next.title):'Log another exercise')+'</button>'+
   '<details class="fd-campaign-options"><summary>Choose a different exercise</summary>'+def.slots.map(s=>'<div class="fd-campaign-alternatives"><b>'+escape(s.title)+'</b><div>'+s.ids.filter(id=>!!ex(id)).map(id=>'<button type="button" class="small" onclick="fdCampaignLog(\''+id+'\')">'+escape(ex(id).name)+'</button>').join('')+'</div></div>').join('')+'</details></section>'
   :'<section class="fd-campaign-panel"><h2>Campaign period finished</h2><p>'+state.complete+' of '+def.weeks+' weeks met the training targets. Your logged work and best measurements remain in FitnessDex.</p></section>');
  const phases='<section class="fd-campaign-panel"><h2>Chapter milestones</h2><div class="fd-campaign-chapters">'+state.medals.map((m,i)=>'<div class="fd-campaign-chapter '+(m.earned?'earned':'')+'"><div class="fd-campaign-chapter-name"><strong>'+(m.earned?'◆ ':'' )+escape(m.name)+'</strong><small>'+(m.earned?'Medal earned':m.finished?'Chapter finished':'Upcoming / underway')+'</small></div><small>'+m.wins+'/'+m.needed+' qualifying weeks</small></div>').join('')+'</div></section>';
  const benchmarks=benchmark(def,state.rows);
  const comparison='<section class="fd-campaign-panel"><h2>Change from your starting point</h2>'+
   (benchmarks.length?benchmarks.map(x=>'<div class="fd-campaign-benchmark"><strong>'+escape(x.name)+'</strong><span>'+Math.round(x.initial*10)/10+' → '+Math.round(x.best*10)/10+' '+escape(x.unit)+(x.improvement>0?' · +'+Math.round(x.improvement*10)/10:'')+'</span></div>').join(''):'<p class="hint">Record the same exercise at least twice to compare its first recorded performance with its best result. No bodyweight or appearance target.</p>')+
   '<p class="hint">Estimated lifting strength is based on logged sets of 1–10 reps. Comparisons are per exercise, not between different variations.</p></section>';
  inner='<div class="fd-campaign-stats"><div><strong>'+state.complete+'/'+def.weeks+'</strong><span>Qualifying weeks</span></div><div><strong>'+Math.min(def.weeks,state.elapsed+1)+'</strong><span>Current / final week</span></div><div><strong>'+state.medals.filter(m=>m.earned).length+'/'+def.phases.length+'</strong><span>Chapter medals</span></div></div>'+
    (state.graduated?'<div class="fd-campaign-graduate">◆ Masterwork completed — consistency earned across '+state.complete+' weeks.</div>':'')+
    suggestions+phases+comparison;
 }
 return '<div class="fd-campaigns fd-campaign-detail"><button class="fd-campaign-back" onclick="fdCampaignBack()">‹ All campaigns</button>'+
  '<header class="fd-campaign-hero"><small>'+escape(def.kind)+'</small><h1>'+escape(def.name)+'</h1><p>'+escape(def.intro)+'</p></header>'+
  '<div class="fd-campaign-phase"><span>Development chapter '+(phase+1)+' / '+def.phases.length+'</span><strong>'+escape(phaseInfo[0])+'</strong><p>'+escape(phaseInfo[1])+'</p></div>'+
  inner+'<details class="fd-campaign-safety"><summary>How the campaign works</summary><p>Meet all weekly focus areas across at least '+def.days+' different days. Every qualifying week is calculated from real activity logs. Chapter medals require 70% of that chapter’s weeks and are awarded only after the chapter has ended; finishing a campaign requires at least 75% qualifying weeks.</p><p>Uncompleted weeks do not erase previous work. Train within your ability, allow recovery between demanding sessions and progress loading gradually. No campaign asks you to train through pain.</p></details></div>';
}
window.fdCampaignsView=()=>selected&&byId(selected)?details(byId(selected)):listView();
window.fdCampaignOpen=id=>{if(!byId(id))return;selected=id;tab='campaigns';render();window.scrollTo({top:0,behavior:'instant'});};
window.fdCampaignBack=()=>{selected=null;tab='campaigns';render();window.scrollTo({top:0,behavior:'instant'});};
window.fdCampaignStart=id=>{
 const def=byId(id);if(!def||enrollment(id))return;
 if(!S.v7)S.v7={campaigns:[]};
 if(!Array.isArray(S.v7.campaigns))return;
 S.v7.campaigns.push({id,started:today()});
 if(!save()){S.v7.campaigns.pop();return;}
 selected=id;render();toast(def.name+' started. Your existing activity logs count automatically.');
};
window.fdCampaignLog=id=>{if(!ex(id))return;choose(id);};
window.fdCampaignDefinitions=()=>DEFINITIONS.map(x=>({id:x.id,name:x.name,weeks:x.weeks,slots:x.slots.map(s=>s.id)}));
})();
