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
const due=(d,m=care())=>m.supplements.items.filter(x=>stamp(new Date(x.createdAt))<=d&&(!x.archivedAt||stamp(new Date(x.archivedAt))>d)&&x.days.includes(dateFrom(d).getDay())).sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99')||a.name.localeCompare(b.name));
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
function scheduledStreak(ds,m){
 let run=0,best=0,previous=null;
 for(const date of [...new Set(ds)].sort()){
  let missed=false;
  if(previous){
   const cursor=dateFrom(previous);cursor.setDate(cursor.getDate()+1);
   while(stamp(cursor)<date){
    if(due(stamp(cursor),m).length){missed=true;break;}
    cursor.setDate(cursor.getDate()+1);
   }
  }
  run=previous&&!missed?run+1:1;best=Math.max(best,run);previous=date;
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
 const waterStreak=longestStreak(waterDays),supplementStreak=scheduledStreak(supplementDays,m);
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
const cardioLogged=day=>completedLogs().some(l=>l.date===day&&ex(l.id)?.cat==='Cardio'&&(logMetrics(l).minutes>=20||logMetrics(l).distance>=3));
const goalChoices=choice=>[1000,1500,2000,2250,2500,2750,3000,3500,4000,4500,5000].map(x=>'<option value="'+x+'" '+(x===choice?'selected':'')+'>'+fmt(x)+'</option>').join('');

function careHomePage(){
 const d=today(),w=amount(d),g=waterGoal(d),s=checkIns(d);
 return '<section class="fd-care-page">'+top('DAILY CARE','Small habits, every day','Water and supplement check-ins. No nutrition tracking.',false)+
 '<button class="fd-care-option" onclick="fdCareWater()"><span class="fd-care-icon water">◉</span><span><strong>Hydration</strong><small>'+fmt(w)+' of '+fmt(g)+'</small>'+gauge(w,g)+'</span><b>›</b></button>'+
 '<button class="fd-care-option" onclick="fdCareSupplements()"><span class="fd-care-icon supp">◇</span><span><strong>Supplements</strong><small>'+(s.due?s.done+' of '+s.due+' scheduled today':'Register a supplement routine')+'</small></span><b>›</b></button>'+
 '<p class="fd-care-note">Only water counts towards hydration. Supplement timing is based on the routine you choose.</p></section>';
}
function careWaterPage(){
 const d=today(),m=care(),w=amount(d,m),g=waterGoal(d,m),rows=drinks(d,m);
 return '<section class="fd-care-page">'+top('WATER','Hydration','Log water as you drink it. More is not always better.')+
 '<div class="fd-care-water-hero"><small>WATER TODAY</small><div><strong>'+fmt(w)+'</strong><span> / '+fmt(g)+'</span></div>'+gauge(w,g)+'<p>'+(waterMet(d,m)?'Daily target reached':fmt(Math.max(0,g-w))+' until your target')+'</p></div>'+
 (cardioLogged(d)&&g<Math.min(5000,m.water.baseGoal+500)?'<div class="fd-care-active-suggest"><strong>Cardio logged today</strong><p>For a longer or sweaty session, you might prefer a higher water goal. You decide.</p><button onclick="fdCareActiveGoal()">Use '+fmt(Math.min(5000,m.water.baseGoal+500))+' goal</button></div>':'')+
 '<div class="fd-care-section-title">Add water</div><div class="fd-care-add-row">'+[250,500,750].map(x=>'<button onclick="fdCareAddWater('+x+')"><b>+'+x+'</b><small>ml</small></button>').join('')+'</div>'+
 '<details class="fd-care-details"><summary>Custom amount or earlier drink</summary>'+
 '<label for="fd-care-ml">Water (ml)</label><input type="number" inputmode="numeric" id="fd-care-ml" min="50" max="1500" step="50" value="250">'+
 '<label for="fd-care-at">Time today</label><input type="time" id="fd-care-at" value="'+localTime(new Date())+'">'+
 '<button class="fd-care-secondary" onclick="fdCareCustomWater()">Log water</button></details>'+
 '<details class="fd-care-details"><summary>Adjust your water target</summary><p>The initial goal is 2 L. Increase it for long or sweaty activity if appropriate, or choose your own goal.</p>'+
 '<label for="fd-care-daygoal">Target for today</label><select id="fd-care-daygoal">'+goalChoices(g)+'</select><button class="fd-care-secondary" onclick="fdCareChangeGoal()">Update today</button>'+
 '<label for="fd-care-basegoal">Default for future days</label><select id="fd-care-basegoal">'+goalChoices(m.water.baseGoal)+'</select><button class="fd-care-secondary" onclick="fdCareChangeDefault()">Change default</button></details>'+
 '<div class="fd-care-rewards"><strong>Progress rewards</strong><div class="'+(waterMet(d,m)?'done':'')+'"><span>Reach daily water target</span><b>10 XP</b></div>'+
 '<div class="'+(spaced(d,m)?'done':'')+'"><span>Three spaced drinks across 3 hours</span><b>5 XP</b></div>'+
 (g>=2500?'<div class="'+(waterMet(d,m)?'done':'')+'"><span>Reach your higher target</span><b>+5 XP</b></div>':'')+'</div>'+
 '<div class="fd-care-section-title">Today: '+rows.length+' water entries</div>'+
 '<div class="fd-care-history">'+(rows.length?rows.map(x=>'<div><span>'+atTime(x.at)+'</span><strong>'+fmt(x.ml)+'</strong><button aria-label="Delete water entry" onclick="fdCareUndoWater(\''+x.id+'\')">×</button></div>').join(''):'<p class="fd-care-note">Nothing logged yet.</p>')+'</div>'+
 '<p class="fd-care-note">There are no rewards for drinking beyond your target. Needs vary with temperature, exercise and health.</p></section>';
}
function routineRow(x,date){
 const hit=taken(x.id,date),state=hit?(hit.onTime===true?'On schedule':hit.onTime===false?'Outside chosen time':'Recorded'):'Not recorded';
 return '<div class="fd-care-routine"><span class="fd-care-routine-mark '+(hit?'done':'')+'">'+(hit?'✓':'○')+'</span>'+
 '<div><strong>'+esc(x.name)+'</strong><small>'+esc(x.note||'')+(x.note?' · ':'')+esc(x.time||'Any time')+'</small><small>'+state+(hit?' · '+atTime(hit.at):'')+'</small></div>'+
 (hit?'<button onclick="fdCareUndoTaken(\''+x.id+'\')">Undo</button>':'<button class="fd-care-taken" onclick="fdCareLogTaken(\''+x.id+'\')">Taken</button>')+'</div>';
}
function careSuppPage(){
 const m=care(),d=today(),all=m.supplements.items.filter(x=>!x.archivedAt),list=due(d,m),other=all.filter(x=>!list.includes(x)),state=checkIns(d,m);
 return '<section class="fd-care-page">'+top('SUPPLEMENTS','Your routine','Register each routine once; tap when you have taken it.')+
 '<div class="fd-care-supp-hero"><div><strong>'+state.done+'</strong><span> / '+state.due+'</span></div><p>scheduled check-ins today</p>'+gauge(state.done,state.due)+'</div>'+
 '<div class="fd-care-section-title">Scheduled today</div>'+
 '<div class="fd-care-routines">'+(list.length?list.map(x=>routineRow(x,d)).join(''):'<p class="fd-care-note">No supplements scheduled today.</p>')+'</div>'+
 (other.length?'<details class="fd-care-details"><summary>Other registered supplements</summary>'+other.map(x=>routineRow(x,d)).join('')+'</details>':'')+
 '<button class="fd-care-primary" onclick="fdCareNewSupp()">+ Register supplement</button>'+
 (all.length?'<details class="fd-care-details"><summary>Edit or archive routines</summary>'+all.map(x=>'<button class="fd-care-secondary" onclick="fdCareEditSupp(\''+x.id+'\')">Edit '+esc(x.name)+'</button>').join('')+'</details>':'')+
 '<div class="fd-care-rewards"><strong>Routine rewards</strong><div class="'+(state.all?'done':'')+'"><span>Complete scheduled check-ins</span><b>5 XP</b></div>'+
 '<div class="'+(state.onTime?'done':'')+'"><span>Check in around chosen times</span><b>+2 XP</b></div></div>'+
 '<p class="fd-care-note">Points are capped per day, not per supplement or dose. Follow your clinician or product guidance for timing, doses and interactions.</p></section>';
}
function careEditPage(){
 const x=care().supplements.items.find(v=>v.id===careEdit);
 return '<section class="fd-care-page">'+top('SUPPLEMENT ROUTINE',x?'Edit routine':'Register supplement','Set your preferred schedule. FitnessDex does not recommend doses or medically optimal times.')+
 '<div class="fd-care-form"><label for="fd-care-name">Supplement name</label><input id="fd-care-name" maxlength="70" value="'+esc(x?.name||'')+'" placeholder="e.g. Vitamin D">'+
 '<label for="fd-care-note">Dose or note (optional)</label><input id="fd-care-note" maxlength="100" value="'+esc(x?.note||'')+'" placeholder="Follow product directions">'+
 '<label for="fd-care-time">Your usual time (optional)</label><input type="time" id="fd-care-time" value="'+esc(x?.time||'')+'">'+
 '<p class="fd-care-note">Check-ins within 90 minutes of your chosen time count as on schedule. No timing means there is no timing bonus.</p>'+
 '<div class="fd-care-section-title">Days</div><div class="fd-care-days">'+[1,2,3,4,5,6,0].map(d=>'<label><input type="checkbox" id="fd-care-week-'+d+'" '+(!x||x.days.includes(d)?'checked':'')+'><span>'+CARE_DAYS[d]+'</span></label>').join('')+'</div>'+
 '<button class="fd-care-primary" onclick="fdCareSaveSupp()">'+(x?'Save routine':'Register supplement')+'</button>'+
 (x?'<button class="fd-care-muted" onclick="fdCareArchiveSupp()">Archive routine</button>':'')+'</div></section>';
}
function careAchievements(){
 const m=care();if(!m.water.entries.length&&!m.supplements.taken.length)return '';
 const rewards=careRewards(m);
 return '<section class="fd-care-achievements"><h2>Daily care consistency</h2><p class="hint">Persistence badges for meeting water goals and completing a chosen supplement routine.</p>'+
 [['Water',rewards.waterStreak],['Supplements',rewards.supplementStreak]].map(([title,n])=>
 '<div class="fd-care-achievement-row"><strong>'+title+'</strong><small>Longest streak: '+n+' days</small><div>'+CARE_STREAKS.map(x=>'<span class="'+(n>=x?'earned':'')+'">'+x+'d</span>').join('')+'</div></div>').join('')+'</section>';
}
window.fdCareIsEditing=()=>carePage==='editor';
window.fdCareView=()=>carePage==='water'?careWaterPage():carePage==='supplements'?careSuppPage():carePage==='editor'?careEditPage():careHomePage();
const careShow=next=>{carePage=next;tab='care';render();window.scrollTo({top:0,behavior:'instant'});};
window.fdCareHome=()=>careShow('home');
window.fdCareWater=()=>careShow('water');
window.fdCareSupplements=()=>careShow('supplements');

function addWater(ml,when){
 if(!Number.isInteger(ml)||ml<50||ml>1500||!Number.isFinite(when.getTime())||stamp(when)!==today()||when.getTime()>Date.now()+60000)return toast('Choose 50–1,500 ml and a valid time today.');
 if(drinks(today()).length>=30)return toast('Maximum 30 water entries per day.');
 carePersist(m=>{
  if(!m.water.goals.some(x=>x.date===today()))m.water.goals.push({date:today(),ml:m.water.baseGoal});
  m.water.entries.push({id:'water-'+uid(),date:today(),at:when.toISOString(),ml});
 },fmt(ml)+' water logged');
}
window.fdCareAddWater=ml=>addWater(ml,new Date());
window.fdCareCustomWater=()=>{
 const ml=Number(document.getElementById('fd-care-ml')?.value),t=document.getElementById('fd-care-at')?.value||'';
 if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t))return toast('Choose a valid time.');
 addWater(ml,new Date(today()+'T'+t+':00'));
};
window.fdCareUndoWater=id=>{
 if(!care().water.entries.some(x=>x.id===id)||!confirm('Remove this water entry?'))return;
 carePersist(m=>{m.water.entries=m.water.entries.filter(x=>x.id!==id);},'Water entry removed');
};
window.fdCareChangeGoal=()=>{
 const goal=Number(document.getElementById('fd-care-daygoal')?.value);
 if(!Number.isInteger(goal)||goal<1000||goal>5000)return toast('Choose a target between 1 and 5 L.');
 carePersist(m=>{const x=m.water.goals.find(x=>x.date===today());if(x)x.ml=goal;else m.water.goals.push({date:today(),ml:goal});},'Water target updated');
};
window.fdCareChangeDefault=()=>{
 const goal=Number(document.getElementById('fd-care-basegoal')?.value);
 if(!Number.isInteger(goal)||goal<1000||goal>5000)return toast('Choose a target between 1 and 5 L.');
 carePersist(m=>{m.water.baseGoal=goal;},'Default target updated');
};
window.fdCareActiveGoal=()=>{
 const goal=Math.min(5000,care().water.baseGoal+500);
 carePersist(m=>{const x=m.water.goals.find(x=>x.date===today());if(x)x.ml=goal;else m.water.goals.push({date:today(),ml:goal});},'Active-day water goal updated');
};
window.fdCareNewSupp=()=>{careEdit=null;careShow('editor');};
window.fdCareEditSupp=id=>{if(!care().supplements.items.some(x=>x.id===id))return;careEdit=id;careShow('editor');};
window.fdCareSaveSupp=()=>{
 const name=document.getElementById('fd-care-name')?.value?.trim()||'',note=document.getElementById('fd-care-note')?.value?.trim()||'',t=document.getElementById('fd-care-time')?.value||'';
 const days=[0,1,2,3,4,5,6].filter(x=>document.getElementById('fd-care-week-'+x)?.checked);
 if(!name||name.length>70||note.length>100||t&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t)||days.length===0)return toast('Enter a supplement name and at least one scheduled day.');
 if(care().supplements.items.some(x=>x.id!==careEdit&&!x.archivedAt&&x.name.toLowerCase()===name.toLowerCase()))return toast('This supplement is already registered. Edit its schedule instead.');
 if(!careEdit&&care().supplements.items.length>=30)return toast('Maximum 30 registered routines.');
 const successful=carePersist(m=>{
  const existing=m.supplements.items.find(x=>x.id===careEdit);
  if(existing)Object.assign(existing,{name,note,time:t,days});
  else m.supplements.items.push({id:'supp-'+uid(),name,note,time:t,days,createdAt:new Date().toISOString(),archivedAt:null});
 },careEdit?'Routine updated':'Supplement registered');
 if(successful){careEdit=null;careShow('supplements');}
};
window.fdCareArchiveSupp=()=>{
 const row=care().supplements.items.find(x=>x.id===careEdit);
 if(!row||!confirm('Archive this routine? Recorded history stays saved.'))return;
 const successful=carePersist(m=>{m.supplements.items.find(x=>x.id===careEdit).archivedAt=new Date().toISOString();},'Routine archived');
 if(successful){careEdit=null;careShow('supplements');}
};
window.fdCareLogTaken=id=>{
 const m=care(),x=m.supplements.items.find(s=>s.id===id&&!s.archivedAt),day=today();
 if(!x||taken(id,day,m))return;
 const now=new Date(),min=now.getHours()*60+now.getMinutes(),scheduled=x.time?Number(x.time.slice(0,2))*60+Number(x.time.slice(3)):null;
 const onTime=scheduled===null?null:Math.abs(scheduled-min)<=90;
 carePersist(m=>{if(!m.supplements.taken.some(x=>x.supplementId===id&&x.date===day))m.supplements.taken.push({id:'taken-'+uid(),supplementId:id,date:day,at:now.toISOString(),onTime});},
 onTime===true?'Supplement logged · on schedule':'Supplement check-in logged');
};
window.fdCareUndoTaken=id=>{
 const row=taken(id,today());
 if(!row||!confirm('Undo this supplement check-in?'))return;
 carePersist(m=>{m.supplements.taken=m.supplements.taken.filter(x=>x.id!==row.id);},'Supplement check-in removed');
};
const oldAchievements=achievements;
achievements=function(){return oldAchievements()+careAchievements();};
})();
