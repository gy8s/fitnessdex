/* FitnessDex v0.5.9 — cutting-back tracker; separate from exercise XP */
(()=>{
'use strict';
const CATEGORIES=[
 {id:'alcohol',name:'Alcohol',unit:'UK units',note:'A pint at 4% ABV is about 2.3 UK units.',zero:'No alcohol',dailyMax:100,weeklyMax:500,icon:'◉'},
 {id:'smoking',name:'Smoking',unit:'cigarettes',single:'cigarette',zero:'No cigarettes',dailyMax:500,weeklyMax:500,icon:'◎'},
 {id:'takeaway',name:'Unhealthy takeaway',unit:'meals',single:'meal',note:'For example, fried chicken, burger and chips, or greasy pizza.',zero:'No unhealthy takeaway',dailyMax:30,weeklyMax:100,icon:'◇'}
];
const STREAK=[3,7,14,30,60,90];
const REDUCTION=[25,50,75,90,95];
const STREAK_POINTS=[15,35,75,150,300,500];
const REDUCTION_POINTS=[20,45,80,130,200];
let selectedDate=null,selectedHabit=null,origin='home';
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
 const days=[];for(let i=0;i<28;i++)days.push(move(today(),-i));
 const lookup=new Map(model().days.filter(x=>x.category===id).map(x=>[x.date,x.quantity]));
 const known=days.filter(d=>lookup.has(d));
 const qty=known.reduce((sum,d)=>sum+lookup.get(d),0);
 const used=known.filter(d=>lookup.get(d)>0).length;
 return {tracked:known.length,quantity:qty,used,perWeek:known.length?qty*7/known.length:null};
}
function longestStreak(id){
 const rows=model().days.filter(x=>x.category===id&&x.quantity===0).map(x=>x.date).sort();
 let best=0,run=0,previous=null;
 for(const date of rows){run=previous!==null&&date===move(previous,1)?run+1:1;best=Math.max(best,run);previous=date;}
 return best;
}
function currentStreak(id){
 const m=model();let day=today();
 if(!m.days.some(x=>x.category===id&&x.date===day)){day=move(day,-1);}
 let count=0;
 while(m.days.some(x=>x.category===id&&x.date===day&&x.quantity===0)){
  count++;day=move(day,-1);if(count>100000)break;
 }
 return count;
}
function reduction(id){
 const baseline=model().baselineWeek[id],period=last28(id);
 const percent=baseline>0&&period.tracked>=7?Math.max(-999,Math.min(100,(1-period.perWeek/baseline)*100)):null;
 return {...period,baseline,percent,eligible:period.tracked>=21};
}
function awardDetails(aid){
 const match=/^(alcohol|smoking|takeaway)-(streak|reduction)-(\d+)$/.exec(aid);
 if(!match)return null;
 const cat=category(match[1]);if(!cat)return null;
 const value=Number(match[3]),i=match[2]==='streak'?STREAK.indexOf(value):REDUCTION.indexOf(value);
 if(i<0)return null;
 return {label:match[2]==='streak'?value+' verified days without '+cat.name.toLowerCase():value+'% reduction in '+cat.name.toLowerCase(),points:(match[2]==='streak'?STREAK_POINTS:REDUCTION_POINTS)[i]};
}
function checkAwards(){
 const m=model(),known=new Set(m.awards.map(a=>a.id));let gained=0;
 for(const cat of CATEGORIES){
  const longest=longestStreak(cat.id),trend=reduction(cat.id);
  for(const milestone of STREAK){
   const id=cat.id+'-streak-'+milestone;
   if(longest>=milestone&&!known.has(id)){m.awards.push({id,at:today()});known.add(id);gained++;}
  }
  if(trend.eligible&&trend.percent!==null){
   for(const milestone of REDUCTION){
    const id=cat.id+'-reduction-'+milestone;
    if(trend.percent>=milestone&&!known.has(id)){m.awards.push({id,at:today()});known.add(id);gained++;}
   }
  }
 }
 return gained;
}
function persist(message,before){
 const gained=checkAwards();if(!save()){if(before){S=JSON.parse(before);resetDerived();}return;}
 render();toast(message+(gained?' · '+gained+' new reward'+(gained===1?'':'s')+'!':''));
}
function record(id,quantity){
 const cat=category(id),date=habitDate();
 if(!cat||!validDate(date)||date>today())return toast('Choose a valid date (not in the future).');
 if(!Number.isFinite(quantity)||quantity<0||quantity>cat.dailyMax||(id!=='alcohol'&&!Number.isInteger(quantity)))return toast('Enter a valid amount of '+cat.unit+'.');
 const m=model(),previous=rowFor(id,date);
 if(previous&&previous.quantity>0&&quantity===0&&!confirm('Replace the saved total with zero?'))return;
 const before=JSON.stringify(S);
 if(previous)previous.quantity=quantity;else m.days.push({category:id,date,quantity});
 m.days.sort((a,b)=>a.date.localeCompare(b.date)||a.category.localeCompare(b.category));
 persist('Daily total saved',before);
}
window.fdHabitsZero=id=>record(id,0);
window.fdHabitsQuantity=id=>{
 const el=document.getElementById('fd-habit-quantity-'+id);if(!el||el.value.trim()==='')return toast('Enter the amount, or use the no-use button.');
 record(id,Number(el.value));
};
window.fdHabitsDateChange=value=>{
 if(!validDate(value)||value>today())return toast('Choose a valid date (not in the future).');
 selectedDate=value===today()?null:value;render();
};
window.fdHabitsRemove=id=>{
 const m=model(),existing=rowFor(id,habitDate());
 if(!existing||!confirm('Remove this daily entry?'))return;
 const before=JSON.stringify(S);m.days.splice(m.days.indexOf(existing),1);
 persist('Daily record removed',before);
};
window.fdHabitsBaseline=id=>{
 const cat=category(id),el=document.getElementById('fd-habit-baseline-'+id);
 if(!cat||!el||el.value.trim()==='')return toast('Enter your previous weekly average.');
 const val=Number(el.value),old=model().baselineWeek[id];
 if(!Number.isFinite(val)||val<=0||val>cat.weeklyMax||(id!=='alcohol'&&!Number.isInteger(val)))return toast('Enter a positive, realistic weekly baseline.');
 if(old>0&&old!==val&&!confirm('Change the baseline? Existing reward badges will remain earned, and future comparisons will use the new amount.'))return;
 const before=JSON.stringify(S);model().baselineWeek[id]=val;
 persist('Weekly baseline saved',before);
};
function savedAmount(cat,row){
 return !row?'Not logged':row.quantity===0?cat.zero:show(row.quantity)+' '+(row.quantity===1&&cat.single?cat.single:cat.unit);
}
function dateField(){
 return '<div class="field fd-habit-date"><label for="fd-habits-date">Date</label><input id="fd-habits-date" type="date" max="'+today()
  +'" value="'+html(habitDate())+'" onchange="fdHabitsDateChange(this.value)"></div>';
}
function pageHeading(title,back){
 return '<div class="fd-care-top"><button class="fd-care-back" onclick="fdHabitsBack()">‹ '+back+'</button><h1>'+html(title)+'</h1></div>';
}
function overview(){
 const awards=model().awards.map(a=>awardDetails(a.id)).filter(Boolean);
 const points=awards.reduce((total,award)=>total+award.points,0);
 return pageHeading('Habits',origin==='more'?'More':'Home')+dateField()+CATEGORIES.map(cat=>
  '<button type="button" class="fd-care-option" onclick="fdHabitsSelect(\''+cat.id+'\')"><span class="fd-care-icon" aria-hidden="true">'+cat.icon+'</span>'
  +'<span><strong>'+html(cat.name)+'</strong><small>'+html(savedAmount(cat,rowFor(cat.id,habitDate())))+'</small></span><b aria-hidden="true">›</b></button>'
 ).join('')+(awards.length?'<p class="fd-care-note">'+awards.length+' '+(awards.length===1?'badge':'badges')+' · '+points+' habit points</p>':'');
}
function trendDetails(cat){
 const id=cat.id,trend=reduction(id),earned=model().awards.filter(a=>a.id.startsWith(id+'-')).map(a=>awardDetails(a.id)).filter(Boolean);
 const change=trend.percent===null?'':show(Math.abs(trend.percent))+'% '+(trend.percent>=0?'below':'above')+' your previous average';
 return '<details class="fd-care-details"><summary>Progress and rewards</summary>'
  +'<dl class="fd-habit-progress"><div><dt>Current streak</dt><dd>'+currentStreak(id)+' days</dd></div><div><dt>Longest streak</dt><dd>'+longestStreak(id)
  +' days</dd></div><div><dt>Days logged</dt><dd>'+trend.tracked+' / 28</dd></div></dl>'
  +(change?'<p><strong>'+html(change)+'</strong> · '+show(trend.perWeek)+' '+html(cat.unit)+'/week</p>':'')
  +'<form onsubmit="fdHabitsBaseline(\''+id+'\');return false"><label for="fd-habit-baseline-'+id+'">Previous weekly average ('+html(cat.unit)+')</label>'
  +'<input id="fd-habit-baseline-'+id+'" type="number" inputmode="'+(id==='alcohol'?'decimal':'numeric')+'" min="'+(id==='alcohol'?'0.01':'1')+'" max="'
  +cat.weeklyMax+'" step="'+(id==='alcohol'?'any':'1')+'" value="'+(trend.baseline??'')+'"><button class="fd-care-secondary">Save baseline</button></form>'
  +'<p>Streaks count consecutive days logged as zero. Reduction estimates start at 7 logged days and rewards start at 21 of the last 28 days.</p>'
  +earned.map(a=>'<p>✓ '+html(a.label)+' · +'+a.points+' points</p>').join('')+'</details>';
}
function detail(cat){
 const id=cat.id,current=rowFor(id,habitDate()),recent=model().days.filter(row=>row.category===id)
  .sort((a,b)=>b.date.localeCompare(a.date)).slice(0,7);
 return pageHeading(cat.name,'Habits')+dateField()
  +'<section class="fd-entry-card fd-habit-entry"><h2>'+html(savedAmount(cat,current))+'</h2>'
  +'<button type="button" class="fd-care-secondary" onclick="fdHabitsZero(\''+id+'\')">Log none</button>'
  +'<form onsubmit="fdHabitsQuantity(\''+id+'\');return false"><div class="field"><label for="fd-habit-quantity-'+id+'">Daily total ('+html(cat.unit)+')</label>'
  +'<input id="fd-habit-quantity-'+id+'" type="number" inputmode="'+(id==='alcohol'?'decimal':'numeric')+'" min="0" max="'+cat.dailyMax
  +'" step="'+(id==='alcohol'?'any':'1')+'" value="'+(current?.quantity??'')+'" required>'+(cat.note?'<p class="hint">'+html(cat.note)+'</p>':'')+'</div><button class="primary">Save total</button></form>'
  +(current?'<button type="button" class="fd-habit-remove" onclick="fdHabitsRemove(\''+id+'\')">Remove entry</button>':'')+'</section>'
  +(recent.length?'<h2 class="fd-care-section-title">Recent entries</h2><div class="fd-habit-history">'
   +recent.map(row=>'<button type="button" onclick="fdHabitsDateChange(\''+html(row.date)+'\')"><span>'+html(parseDate(row.date)
    .toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'}))+'</span><strong>'+html(savedAmount(cat,row))+'</strong></button>').join('')+'</div>':'')
  +trendDetails(cat);
}
window.fdHabitsOpen=()=>{
 origin=tab==='more'?'more':'home';
 selectedDate=null;selectedHabit=null;
 navigate('habits');
};
window.fdHabitsSelect=id=>{
 if(!category(id))return;
 selectedHabit=id;render();window.scrollTo({top:0,behavior:'instant'});
};
window.fdHabitsBack=()=>{
 if(!selectedHabit)return navigate(origin);
 selectedHabit=null;render();window.scrollTo({top:0,behavior:'instant'});
};
window.fdHabitsView=()=>{
 const cat=category(selectedHabit);
 return '<section class="fd-care-page">'+(cat?detail(cat):overview())+'</section>';
};
})();
