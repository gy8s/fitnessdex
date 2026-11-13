/* FitnessDex v0.8.0 | Daily care: water and optional supplement routines. */
(()=>{
'use strict';
const CARE_DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const CARE_STREAKS=[3,7,14,30,60,90];
const CARE_STREAK_XP=[15,35,80,160,320,500];
const careBlank=()=>({water:{baseGoal:2000,goals:[],entries:[]},supplements:{items:[],taken:[]}});
const care=()=>S.v9||careBlank();
const waterGoal=(d,m=care())=>m.water.goals.find(x=>x.date===d)?.ml||m.water.baseGoal;
const drinks=(d,m=care())=>m.water.entries.filter(x=>x.date===d).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
const amount=(d,m=care())=>drinks(d,m).reduce((sum,e)=>sum+e.ml,0);
const fmt=x=>x>=1000?(x/1000).toLocaleString('en-GB',{maximumFractionDigits:2})+' L':x+' ml';
const atTime=x=>new Date(x).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
const waterMet=(d,m=care())=>amount(d,m)>=waterGoal(d,m);
function spaced(d,m=care()){
 const stamps=drinks(d,m).filter(x=>x.ml>=150).map(x=>Date.parse(x.at));
 if(!waterMet(d,m)||stamps.length<3)return false;
 for(let i=0;i<stamps.length-2;i++)for(let j=i+1;j<stamps.length-1;j++){
  if(stamps[j]-stamps[i]<3600000)continue;
  if(stamps.some((x,k)=>k>j&&x-stamps[j]>=3600000&&x-stamps[i]>=10800000))return true;
 }
 return false;
}
const due=(d,m=care())=>m.supplements.items.filter(x=>stamp(new Date(x.createdAt))<=d&&(!x.archivedAt||stamp(new Date(x.archivedAt))>=d)&&x.days.includes(dateFrom(d).getDay())).sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99')||a.name.localeCompare(b.name));
const taken=(id,d,m=care())=>m.supplements.taken.find(x=>x.supplementId===id&&x.date===d);
function checkIns(d,m=care()){
 const routine=due(d,m),hits=routine.map(x=>taken(x.id,d,m));
 return {due:routine.length,done:hits.filter(Boolean).length,all:routine.length>0&&hits.every(Boolean),
  onTime:routine.length>0&&hits.every(Boolean)&&routine.some(x=>!!x.time)&&routine.filter(x=>x.time).every(x=>taken(x.id,d,m)?.onTime===true)};
}
function longestStreak(ds){
 let run=0,best=0,prev='';
 for(const date of [...new Set(ds)].sort()){
  const day=dateFrom(date);day.setDate(day.getDate()-1);
  run=stamp(day)===prev?run+1:1;prev=date;best=Math.max(best,run);
 }
 return best;
}
function careRewards(m=care()){
 const dates=new Set([...m.water.entries.map(x=>x.date),...m.supplements.taken.map(x=>x.date)]);
 let xp=0;const waterDays=[],supplementDays=[];
 for(const day of dates){
  if(day>today())continue;
  if(waterMet(day,m)){waterDays.push(day);xp+=10;if(spaced(day,m))xp+=5;if(waterGoal(day,m)>=2500)xp+=5;}
  const check=checkIns(day,m);
  if(check.all){supplementDays.push(day);xp+=5;if(check.onTime)xp+=2;}
 }
 const waterStreak=longestStreak(waterDays),supplementStreak=longestStreak(supplementDays);
 for(const streak of [waterStreak,supplementStreak])CARE_STREAKS.forEach((n,i)=>{if(streak>=n)xp+=CARE_STREAK_XP[i];});
 return {xp,waterStreak,supplementStreak,waterDays:waterDays.length,supplementDays:supplementDays.length};
}
window.fdCareXP=()=>careRewards().xp;
window.fdCareStatus=()=>({ml:amount(today()),goal:waterGoal(today()),supp:checkIns(today())});
let carePage='home',careEdit=null;
function carePersist(mutate,message){
 const before=JSON.stringify(S);
 if(!S.v9)S.v9=careBlank();
 mutate(S.v9);
 if(!validCareState(S.v9)){S=JSON.parse(before);toast('Invalid daily care entry. Nothing changed.');return false;}
 if(!save()){S=JSON.parse(before);return false;}
 resetDerived();render();if(message)toast(message);
 return true;
}
const top=(sub,title,detail,back=true)=>'<div class="fd-care-top">'+(back?'<button class="fd-care-back" onclick="fdCareHome()">‹ Daily care</button>':'')+'<small>'+sub+'</small><h1>'+title+'</h1><p>'+detail+'</p></div>';
const gauge=(value,max)=>'<div class="fd-care-gauge"><span style="width:'+Math.min(100,Math.max(0,Math.round(value/Math.max(1,max)*100)))+'%"></span></div>';
const goalChoices=choice=>[1000,1500,2000,2250,2500,2750,3000,3500,4000,4500,5000].map(x=>'<option value="'+x+'" '+(x===choice?'selected':'')+'>'+fmt(x)+'</option>').join('');
