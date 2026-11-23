/* FitnessDex habit check-ins and chains */
(()=>{
'use strict';
const CATEGORIES=[
 {id:'alcohol',name:'Alcohol-free',question:'Drank alcohol?',unit:'UK units',single:'UK unit'},
 {id:'smoking',name:'Smoke-free',question:'Smoked?',unit:'cigarettes',single:'cigarette'},
 {id:'takeaway',name:'Takeaway-free',question:'Had a takeaway?',unit:'takeaways',single:'takeaway'}
];
const STREAK=[3,7,14,30,60,90];
const REDUCTION=[25,50,75,90,95];
const STREAK_POINTS=[15,35,75,150,300,500];
const REDUCTION_POINTS=[20,45,80,130,200];
let selectedDate=null,origin='home',newLinks=new Set(),celebrations=new Map();
const habitDate=()=>selectedDate||today();
const html=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const show=n=>(Math.round(n*10)/10).toLocaleString('en-GB',{maximumFractionDigits:1});
const category=id=>CATEGORIES.find(c=>c.id===id);
function model(){
 if(!S.v6||typeof S.v6!=='object')S.v6={baselineWeek:{alcohol:null,smoking:null,takeaway:null},days:[],awards:[]};
 if(!S.v6.baselineWeek||typeof S.v6.baselineWeek!=='object')S.v6.baselineWeek={alcohol:null,smoking:null,takeaway:null};
 if(!Array.isArray(S.v6.days))S.v6.days=[];
 if(!Array.isArray(S.v6.awards))S.v6.awards=[];
 return S.v6;
}
function parseDate(s){return new Date(s+'T12:00:00');}
function move(s,days){const d=parseDate(s);d.setDate(d.getDate()+days);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
function rowFor(id,date){return model().days.find(x=>x.category===id&&x.date===date);}
function last28(id){
 const end=today(),start=move(end,-27);
 const rows=model().days.filter(row=>row.category===id&&row.date>=start&&row.date<=end);
 const known=rows.filter(row=>!row.amountUnspecified);
 const quantity=known.reduce((sum,row)=>sum+row.quantity,0);
 // Amount-based awards need an actual amount for every logged day in the period.
 return {tracked:known.length,perWeek:known.length&&known.length===rows.length?quantity*7/known.length:null};
}
function longestStreak(id){
 const rows=model().days.filter(x=>x.category===id&&x.quantity===0).map(x=>x.date).sort();
 let best=0,run=0,previous=null;
 for(const date of rows){run=previous!==null&&date===move(previous,1)?run+1:1;best=Math.max(best,run);previous=date;}
 return best;
}
function currentStreak(days){
 let day=today();
 if(!days.has(day))day=move(day,-1);
 let count=0;
 while(days.get(day)?.quantity===0){
  count++;day=move(day,-1);
 }
 return count;
}
function reduction(id){
 const baseline=model().baselineWeek[id],period=last28(id);
 const percent=baseline>0&&period.tracked>=7&&period.perWeek!==null?Math.max(-999,Math.min(100,(1-period.perWeek/baseline)*100)):null;
 return {...period,baseline,percent,eligible:period.tracked>=21};
}
function awardDetails(aid){
 const match=/^(alcohol|smoking|takeaway)-(streak|reduction)-(\d+)$/.exec(aid);
 if(!match)return null;
 const cat=category(match[1]);if(!cat)return null;
 const value=Number(match[3]),i=match[2]==='streak'?STREAK.indexOf(value):REDUCTION.indexOf(value);
 if(i<0)return null;
 return {
  label:match[2]==='streak'?cat.name+' for '+value+' days':cat.name+' · '+value+'% reduction',
  points:(match[2]==='streak'?STREAK_POINTS:REDUCTION_POINTS)[i]
 };
}
function checkAwards(){
 const m=model(),known=new Set(m.awards.map(a=>a.id));
 for(const cat of CATEGORIES){
  const longest=longestStreak(cat.id),trend=reduction(cat.id);
  for(const milestone of STREAK){
   const id=cat.id+'-streak-'+milestone;
   if(longest>=milestone&&!known.has(id))m.awards.push({id,at:today()});
  }
  if(trend.eligible&&trend.percent!==null){
   for(const milestone of REDUCTION){
    const id=cat.id+'-reduction-'+milestone;
    if(trend.percent>=milestone&&!known.has(id))m.awards.push({id,at:today()});
   }
  }
 }
}
function persist(date,updates){
 const before=JSON.stringify(S);
 const m=model();
 const saved=new Set();
 const milestones=new Map();
 for(const [id,used] of updates){
  const previous=rowFor(id,date);
  const days=daysFor(id);
  const streak=currentStreak(days);
  // A positive placeholder keeps older clients able to read the daily record.
  const row=used?{category:id,date,quantity:1,amountUnspecified:true}:{category:id,date,quantity:0};
  if(previous)m.days[m.days.indexOf(previous)]=row;else m.days.push(row);
  if(!used){
   saved.add(id);
   days.set(date,row);
   const after=currentStreak(days);
   if(after>streak&&(after===7||after===30))milestones.set(id,after);
  }
 }
 m.days.sort((a,b)=>a.date.localeCompare(b.date)||a.category.localeCompare(b.category));
 checkAwards();
 if(!save()){S=JSON.parse(before);resetDerived();return false;}
 newLinks=saved;
 celebrations=milestones;
 return true;
}
function daysFor(id){return new Map(model().days.filter(row=>row.category===id).map(row=>[row.date,row]));}
function paint(focusId){
 render();
 newLinks.clear();
 celebrations.clear();
 if(focusId)document.getElementById(focusId)?.focus({preventScroll:true});
}
window.fdHabitsAnswer=(id,used)=>{
 const date=habitDate();
 if(!category(id)||!validDate(date)||date>today())return;
 const existing=rowFor(id,date);
 if(existing&&(existing.quantity>0)===used)return;
 if(persist(date,[[id,used]]))paint('fd-habit-'+id+'-'+(used?'yes':'no'));
};
window.fdHabitsNoneToday=()=>{
 const date=today();
 if(habitDate()!==date||CATEGORIES.some(cat=>rowFor(cat.id,date)?.quantity>0))return;
 const updates=CATEGORIES.filter(cat=>!rowFor(cat.id,date)).map(cat=>[cat.id,false]);
 if(updates.length&&persist(date,updates))paint('fd-habit-alcohol-no');
};
window.fdHabitsDateChange=(value,focusId)=>{
 if(!validDate(value)||value>today())return toast('Choose today or an earlier date.');
 selectedDate=value===today()?null:value;
 paint(focusId);
};
window.fdHabitsRemove=id=>{
 const m=model(),existing=rowFor(id,habitDate());
 if(!existing||!confirm('Clear this check-in?'))return;
 const before=JSON.stringify(S);
 m.days.splice(m.days.indexOf(existing),1);
 if(!save()){S=JSON.parse(before);resetDerived();return;}
 paint('fd-habit-'+id+'-no');
};
const longDate=date=>parseDate(date).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});
function dateField(date){
 const isToday=date===today();
 return '<div class="fd-habit-date"><label for="fd-habits-date">'+(isToday?'Today':html(longDate(date)))+'</label>'
  +'<input id="fd-habits-date" aria-label="Check-in date" type="date" max="'+today()+'" value="'+date+'" onchange="fdHabitsDateChange(this.value,this.id)">'
  +(isToday?'':'<button type="button" onclick="fdHabitsDateChange(\''+today()+'\',\'fd-habits-date\')">Back to today</button>')+'</div>';
}
function chain(cat,days,date){
 const now=today(),end=date>=move(now,-6)?now:date;
 const visible=Array.from({length:7},(_,i)=>move(end,i-6));
 return '<div class="fd-habit-chain" role="group" aria-label="'+cat.name+' chain">'+visible.map(day=>{
  const row=days.get(day);
  const status=!row?'unlogged':row.quantity===0?'kept':'break';
  const label=status==='break'?cat.question.slice(0,-1):status==='kept'?'Habit avoided':'Unlogged';
  const joined=status==='kept'&&day!==visible[0]&&days.get(move(day,-1))?.quantity===0;
  const fresh=day===date&&status==='kept'&&newLinks.has(cat.id);
  const id='fd-habit-day-'+cat.id+'-'+day;
  return '<button type="button" id="'+id+'" class="fd-habit-day '+status+(joined?' joined':'')+(fresh?' new-link':'')+'"'
   +' aria-label="'+html(cat.name+', '+longDate(day)+', '+label)+'" aria-pressed="'+(day===date)+'"'
   +(day===now?' aria-current="date"':'')+' onclick="fdHabitsDateChange(\''+day+'\',\''+id+'\')">'
   +'<span aria-hidden="true">'+parseDate(day).toLocaleDateString('en-GB',{weekday:'short'})+'</span>'
   +'<b aria-hidden="true">'+(status==='kept'?'✓':status==='break'?'•':'')+'</b></button>';
 }).join('')+'</div>';
}
function checkIn(cat,date){
 const id=cat.id,days=daysFor(id),current=days.get(date),streak=currentStreak(days),milestone=celebrations.get(id);
 const since=move(today(),-29);
 const kept=[...days.values()].filter(row=>row.quantity===0&&row.date>=since&&row.date<=today()).length;
 const restart=date===today()&&!current&&days.get(move(date,-1))?.quantity>0;
 const amount=current?.quantity>0&&!current.amountUnspecified
  ?show(current.quantity)+' '+(current.quantity===1?cat.single:cat.unit):'';
 const action=(used,label)=>'<button type="button" id="fd-habit-'+id+'-'+label.toLowerCase()+'" aria-pressed="'
  +Boolean(current&&(current.quantity>0)===used)+'" onclick="fdHabitsAnswer(\''+id+'\','+used+')">'+label+'</button>';
 return '<section class="fd-habit-card" aria-labelledby="fd-habit-title-'+id+'"><div class="fd-habit-card-heading">'
  +'<h2 id="fd-habit-title-'+id+'">'+cat.name+'</h2><span class="fd-habit-streak"><strong>'+streak+'</strong> '+(streak===1?'day':'days')+'</span></div>'
  +chain(cat,days,date)+'<p class="fd-habit-month">'+kept+' '+cat.name.toLowerCase()+' '+(kept===1?'day':'days')+' in the last 30</p>'
  +(milestone?'<p class="fd-habit-milestone" role="status">✦ '+milestone+'-day milestone</p>':'')
  +(restart?'<p class="fd-habit-restart">Start a new chain today</p>':'')
  +'<div class="fd-habit-check-in"><span id="fd-habit-question-'+id+'">'+cat.question+(amount?'<small>'+html(amount)+'</small>':'')+'</span>'
  +'<div class="fd-habit-answers" role="group" aria-labelledby="fd-habit-question-'+id+'">'+action(false,'No')+action(true,'Yes')+'</div>'
  +(current?'<button type="button" class="fd-habit-clear" aria-label="Clear '+cat.name.toLowerCase()+' check-in" onclick="fdHabitsRemove(\''+id+'\')">Clear</button>':'')+'</div></section>';
}
window.fdHabitsOpen=()=>{
 origin=tab==='more'?'more':'home';
 selectedDate=null;
 navigate('habits');
};
window.fdHabitsBack=()=>navigate(origin);
window.fdHabitsView=()=>{
 const date=habitDate();
 const alreadyUsed=CATEGORIES.some(cat=>rowFor(cat.id,date)?.quantity>0);
 const missing=CATEGORIES.some(cat=>!rowFor(cat.id,date));
 const awards=model().awards.map(a=>awardDetails(a.id)).filter(Boolean);
 return '<section class="fd-care-page fd-habits"><div class="fd-care-top">'
  +'<button type="button" class="fd-care-back" onclick="fdHabitsBack()">‹ '+(origin==='more'?'More':'Home')+'</button>'
  +'<h1>Habits</h1></div>'
  +dateField(date)
  +(date===today()&&missing&&!alreadyUsed?'<button type="button" class="primary fd-habit-none" onclick="fdHabitsNoneToday()">None today</button>':'')
  +CATEGORIES.map(cat=>checkIn(cat,date)).join('')
  +(awards.length?'<details class="fd-care-details"><summary>Earned rewards ('+awards.length+')</summary>'
   +awards.map(award=>'<p>✓ '+award.label+' · +'+award.points+' points</p>').join('')+'</details>':'')
  +'</section>';
};
})();
