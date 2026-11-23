/* FitnessDex 0.6 — focused home and compact navigation. */
(() => {
'use strict';
let moreView='menu';
const basicNavigate=navigate, originalRender=render;
function landing(){
 const xp=playerXP(),found=achievementCounts(),st=streakMetrics();
 const level=1+Math.floor(xp/500),earned=Math.max(0,xp%500),pct=Math.min(100,Math.round(earned/5));
 const date=new Date().toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});
 return `<div class="fd-step-screen fd-landing">
  <header class="fd-landing-hero">
   <div class="fd-home-heading"><h1>Training</h1><span class="fd-home-date">${date}</span></div>
   <div class="fd-level-progress">
    <div class="fd-level-progress-label"><strong>Level ${level}</strong><span>${earned} / 500 XP</span></div>
    <div class="fd-level-bar" role="progressbar" aria-label="Progress towards the next level" aria-valuemin="0" aria-valuemax="500" aria-valuenow="${earned}"><span style="width:${pct}%"></span></div>
   </div>
   <button class="fd-landing-primary" onclick="navigate('log')"><span aria-hidden="true">+</span> Log an activity</button>
  </header>
  ${window.fdQuickDraftHome?.()||''}${window.fdQuickRepeatHome?.()||''}
  <div class="fd-home-links">
   <button onclick="fdHabitsOpen()">Habits<span class="fd-arrow" aria-hidden="true">›</span></button>
   <button onclick="fdCareHome()">Daily care<span class="fd-arrow" aria-hidden="true">›</span></button>
  </div>
  ${window.fdCareQuickHome?.()||''}
  <details class="fd-log-details fd-progress-closed">
   <summary>Progress &amp; awards</summary>
   <div class="fd-progress-metrics"><div><strong>Lv ${level}</strong><small>${xp} total XP</small></div><div><strong>${found.discovered}/${DATA.length}</strong><small>Exercises discovered</small></div><div><strong>${st.daily} days</strong><small>Activity streak</small></div></div>
   <button class="small" onclick="navigate('achievements')">See all achievements</button>
  </details>
 </div>`;
}
function more(){
 if(moreView==='cloud')return '<div class="fd-step-screen"><button class="fd-minimal-back" onclick="fdMoreMenu()">‹ Back</button><header class="fd-step-hero"><h1>Cloud saving</h1></header></div>';
 const routes=[['Daily care','Water and supplements',"navigate('care')"],['Progressions','Train for reps, strength and new variations',"navigate('progression')"],['Campaigns','Long-term strength and skill programmes',"navigate('campaigns')"],['Habits','Alcohol, smoking and takeaway','fdHabitsOpen()'],['Workouts','Group activities',"navigate('workouts')"],['Achievements','Rewards and records',"navigate('achievements')"],['History & data','Edit, export or import records',"navigate('history')"],['Notifications','Water and supplement reminders','fdReminderOpen()'],['Cloud saving','Account and backups','fdMoreCloud()']];
 return '<div class="fd-step-screen"><header class="fd-step-hero"><h1>More</h1></header><div class="fd-option-list">'+routes.map(([title,subtitle,action])=>'<button class="fd-option" onclick="'+action+'"><span><strong>'+title+'</strong><small>'+subtitle+'</small></span><span class="fd-arrow" aria-hidden="true">›</span></button>').join('')+'</div></div>';
}
window.fdMoreCloud=()=>{moreView='cloud';render();window.scrollTo({top:0,behavior:'instant'});};
window.fdMoreMenu=()=>{moreView='menu';render();window.scrollTo({top:0,behavior:'instant'});};
navigate=function(next){if(next==='more')moreView='menu';return basicNavigate(next);};
home=landing;
render=function(){
 if(tab==='more'){
  document.getElementById('app').innerHTML=more();
 }else originalRender();
 const activeTab=['home','log','dex'].includes(tab)?tab:'more';
 for(const btn of document.querySelectorAll('.nav button')){
  const active=btn.dataset.tab===activeTab;
  btn.classList.toggle('active',active);
  btn.setAttribute('aria-current',active?'page':'false');
 }
 document.body.dataset.fdTab=tab;
 document.body.dataset.fdMore=tab==='more'?moreView:'';
};
render();
})();
