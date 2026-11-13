/* FitnessDex v0.5.9 — cutting-back tracker; separate from exercise XP */
(()=>{
'use strict';
const CATEGORIES=[
 {id:'alcohol',name:'Alcohol',unit:'UK units',plural:'UK units',zero:'No alcohol',examples:'Log UK alcohol units (a pint of 4% beer is about 2.3 units).'},
 {id:'smoking',name:'Smoking',unit:'cigarettes',plural:'cigarettes',zero:'No cigarettes',examples:'Count cigarettes smoked. Other nicotine products are not included.'},
 {id:'takeaway',name:'Unhealthy takeaway',unit:'meals',plural:'meals',zero:'No unhealthy takeaway',examples:'Count greasy, highly processed or fried takeaway meals (e.g. fried chicken, burger and chips, greasy pizza). Do not count healthier prepared meals or ordinary home cooking.'}
];
const STREAK=[3,7,14,30,60,90];
const REDUCTION=[25,50,75,90,95];
const STREAK_POINTS=[15,35,75,150,300,500];
const REDUCTION_POINTS=[20,45,80,130,200];
let selectedDate=today();
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
 for(const date of rows){run=date===move(previous||date,-(-1))?run+1:1;best=Math.max(best,run);previous=date;}
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
function persist(message){
 const gained=checkAwards();if(!save())return;
 render();toast(message+(gained?' · '+gained+' new reward'+(gained===1?'':'s')+'!':''));
}
function record(id,quantity){
 const cat=category(id),max=id==='alcohol'?100:id==='smoking'?500:30;
 if(!cat||!validDate(selectedDate)||selectedDate>today())return toast('Choose a valid date (not in the future).');
 if(!Number.isFinite(quantity)||quantity<0||quantity>max||(id!=='alcohol'&&!Number.isInteger(quantity)))return toast('Enter a valid amount of '+cat.unit+'.');
 const m=model(),previous=rowFor(id,selectedDate);
 if(previous&&previous.quantity>0&&quantity===0&&!confirm('Replace an existing use record with a zero-use day?'))return;
 if(previous)previous.quantity=quantity;else m.days.push({category:id,date:selectedDate,quantity});
 m.days.sort((a,b)=>a.date.localeCompare(b.date)||a.category.localeCompare(b.category));
 persist(quantity===0?'Avoidance day recorded':'Amount recorded');
}
window.fdHabitsZero=id=>record(id,0);
window.fdHabitsQuantity=id=>{
 const el=document.getElementById('fd-habit-quantity-'+id);if(!el||el.value.trim()==='')return toast('Enter the amount, or use the no-use button.');
 record(id,Number(el.value));
};
window.fdHabitsDateChange=value=>{
 if(!validDate(value)||value>today())return toast('Choose a valid date (not in the future).');
 selectedDate=value;render();
};
window.fdHabitsRemove=id=>{
 const m=model(),existing=rowFor(id,selectedDate);
 if(!existing||!confirm('Remove this daily record? The day will become untracked. Earned rewards are retained.'))return;
 m.days.splice(m.days.indexOf(existing),1);
 persist('Daily record removed');
};
window.fdHabitsBaseline=id=>{
 const cat=category(id),el=document.getElementById('fd-habit-baseline-'+id);
 if(!cat||!el||el.value.trim()==='')return toast('Enter your usual weekly amount before cutting back.');
 const val=Number(el.value),max=id==='alcohol'?500:id==='smoking'?500:id==='takeaway'?100:0,old=model().baselineWeek[id];
 if(!Number.isFinite(val)||val<=0||val>max||(id!=='alcohol'&&!Number.isInteger(val)))return toast('Enter a positive, realistic weekly baseline.');
 if(old>0&&old!==val&&!confirm('Change the baseline? Existing reward badges will remain earned, and future comparisons will use the new amount.'))return;
 model().baselineWeek[id]=val;
 persist('Weekly baseline saved');
};
function section(cat){
 const id=cat.id,m=model(),current=rowFor(id,selectedDate),days=last28(id),trend=reduction(id),now=currentStreak(id),best=longestStreak(id),base=m.baselineWeek[id];
 const earned=m.awards.filter(a=>a.id.startsWith(id+'-')).map(a=>awardDetails(a.id)).filter(Boolean);
 const points=earned.reduce((sum,a)=>sum+a.points,0);
 const trendText=base>0
   ?trend.percent===null
     ?'Record at least 7 days to see your provisional reduction.'
     :(trend.percent>=0?show(trend.percent)+'% below baseline':show(Math.abs(trend.percent))+'% above baseline')+' · '+show(trend.perWeek)+' '+cat.unit+'/week across '+trend.tracked+' recorded days'
   :'Set your earlier weekly average to measure how much you cut back.';
 const status=trend.eligible?'Reduction rewards eligible (21+ days logged in 28)':'Reduction badges unlock at 21 of the last 28 days recorded';
 return '<section class="fd-habit-card"><div class="fd-habit-top"><div><h2>'+html(cat.name)+'</h2><p class="hint">'+html(cat.examples)+'</p></div><span class="pill">'+earned.length+' badges · '+points+' points</span></div>'
  +'<div class="fd-habit-metrics"><div><b>'+now+'</b><span>Current no-use streak</span></div><div><b>'+best+'</b><span>Longest verified streak</span></div><div><b>'+days.tracked+'/28</b><span>Days recorded</span></div></div>'
  +'<div class="fd-habit-trend"><strong>'+html(trendText)+'</strong><p>'+html(status)+'</p>'
  +(trend.percent!==null?'<div class="progress"><div style="width:'+Math.max(0,Math.min(100,trend.percent))+'%"></div></div>':'')+'</div>'
  +'<div class="fd-habit-baseline"><label for="fd-habit-baseline-'+id+'">Before cutting back: usual '+html(cat.unit)+' per week</label>'
  +'<div class="fd-habit-inline"><input id="fd-habit-baseline-'+id+'" type="number" min="0.1" max="'+(id==='takeaway'?100:500)+'" step="'+(id==='alcohol'?'0.1':'1')+'" value="'+(base??'')+'" placeholder="Not set"><button class="small" onclick="fdHabitsBaseline(\''+id+'\')">Save baseline</button></div></div>'
  +'<div class="fd-habit-record"><label>For '+html(selectedDate)+' · '+html(cat.unit)+'</label>'
  +'<div class="fd-habit-inline"><button class="fd-habit-zero" onclick="fdHabitsZero(\''+id+'\')">'+html(cat.zero)+'</button><input id="fd-habit-quantity-'+id+'" type="number" min="0" step="'+(id==='alcohol'?'0.1':'1')+'" value="'+(current?.quantity??'')+'" placeholder="Amount"><button class="small" onclick="fdHabitsQuantity(\''+id+'\')">Save</button></div>'
  +'<p class="hint">'+(current?('Recorded: '+(current.quantity===0?'none':show(current.quantity)+' '+cat.unit)+' · <button class="fd-habit-textbtn" onclick="fdHabitsRemove(\''+id+'\')">Remove record</button>'):'No record yet for this date. An unlogged day is not counted as abstinent.')+'</p></div>'
  +(earned.length?'<details class="fd-habit-earned"><summary>Earned rewards ('+earned.length+')</summary><div>'+earned.map(a=>'<p>✓ '+html(a.label)+' · +'+a.points+' points</p>').join('')+'</div></details>':'')
  +'</section>';
}
window.fdHabitsView=()=>{
 const m=model(),points=m.awards.map(a=>awardDetails(a.id)).filter(Boolean).reduce((sum,a)=>sum+a.points,0);
 return '<div class="fd-habits-hero"><span class="dex-eyebrow">Cutting back</span><h1>Less of what you don’t want</h1>'
  +'<p>Log what you avoided and what you did. Streak rewards and reduction rewards are separate: one occasion never erases the progress you have made.</p>'
  +'<div class="fd-habit-total"><strong>'+m.awards.length+'</strong> lasting badges · <strong>'+points+'</strong> habit points (separate from exercise XP)</div>'
  +'<div class="fd-habit-date"><label for="fd-habits-date">Record a day</label><input id="fd-habits-date" type="date" max="'+today()+'" value="'+html(selectedDate)+'" onchange="fdHabitsDateChange(this.value)"></div></div>'
  +'<div class="fd-habits-grid">'+CATEGORIES.map(section).join('')+'</div>'
  +'<p class="hint">Streaks require consecutive days explicitly recorded as zero; missing days do not count. Reduction uses the average amount per recorded day across the last 28 calendar days, converted to a weekly rate. The first 7 days show a provisional estimate; reduction badges require 21 recorded days. Badges stay earned even after a later lapse. This tracker is included in your FitnessDex cloud save and JSON backup.</p>';
};
})();
