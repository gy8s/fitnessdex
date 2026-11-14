/* FitnessDex 0.6 — focused home and compact navigation. */
(() => {
'use strict';
let moreView='menu';
const basicNavigate=navigate, originalRender=render;
function landing(){
 const xp=playerXP(),found=achievementCounts(),st=streakMetrics();
 const level=1+Math.floor(xp/500),earned=Math.max(0,xp%500),pct=Math.min(100,Math.round(earned/5));
 const date=new Date().toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});
 return '<div class="fd-step-screen fd-landing"><header class="fd-landing-hero"><div class="fd-home-eyebrow"><span class="fd-home-kicker">YOUR TRAINING</span><span class="fd-home-date">'+date+'</span></div><div class="fd-home-intro"><div><h1>Make today count.</h1><p>One set or a full workout. It all adds up.</p></div><div class="fd-home-level"><small>LEVEL</small><strong>'+level+'</strong></div></div><div class="fd-level-progress"><div class="fd-level-progress-label"><span>Next level</span><strong>'+earned+' <small>/ 500 XP</small></strong></div><div class="fd-level-bar" role="progressbar" aria-label="Progress towards the next level" aria-valuemin="0" aria-valuemax="500" aria-valuenow="'+earned+'"><span style="width:'+pct+'%"></span></div></div><button class="fd-landing-primary" onclick="navigate(\'log\')"><span class="fd-primary-plus" aria-hidden="true">+</span><span><strong>Log an activity</strong><small>Exercise, sets or a full workout</small></span><span class="fd-arrow" aria-hidden="true">›</span></button></header>'+(window.fdQuickDraftHome?.()||'')+(window.fdQuickRepeatHome?.()||'')+'<div class="fd-home-links"><button onclick="navigate(\'habits\')"><span class="fd-home-link-icon habits" aria-hidden="true">◎</span><span class="fd-home-link-text"><strong>Cutting back</strong><small>Daily habit check-in</small></span><span class="fd-arrow" aria-hidden="true">›</span></button><button onclick="fdCareHome()"><span class="fd-home-link-icon care" aria-hidden="true">◈</span><span class="fd-home-link-text"><strong>Daily care</strong><small>Water & supplements</small></span><span class="fd-arrow" aria-hidden="true">›</span></button></div>'+(window.fdCareQuickHome?.()||'')+'<details class="fd-log-details fd-progress-closed"><summary>Your progress <small>Discoveries, streaks & awards</small></summary><div class="fd-progress-metrics"><div><strong>Lv '+level+'</strong><small>'+xp+' total XP</small></div><div><strong>'+found.discovered+'/'+DATA.length+'</strong><small>Exercises discovered</small></div><div><strong>'+st.daily+' days</strong><small>Activity streak</small></div></div><button class="small" onclick="navigate(\'achievements\')">See all achievements</button></details></div>';
}
function more(){
 if(moreView==='cloud')return '<div class="fd-step-screen"><button class="fd-minimal-back" onclick="fdMoreMenu()">‹ Back</button><header class="fd-step-hero"><h1>Cloud saving</h1><p>Check your account and backup settings below.</p></header></div>';
 const routes=[['Daily care','Water and supplement routines',"navigate('care')"],['Progressions','Train for reps, strength and new variations',"navigate('progression')"],['Campaigns','Long-term strength and skill programmes',"navigate('campaigns')"],['Cutting back','Alcohol, smoking and takeaway',"navigate('habits')"],['Workouts','Group exercise records',"navigate('workouts')"],['Achievements','Your rewards and records',"navigate('achievements')"],['History & data','Edit, export or import records',"navigate('history')"],['Notifications','Water and supplement reminders','fdReminderOpen()'],['Cloud saving','Account and backups','fdMoreCloud()']];
 return '<div class="fd-step-screen"><header class="fd-step-hero"><small>FitnessDex</small><h1>More</h1></header><div class="fd-option-list">'+routes.map(([title,subtitle,action])=>'<button class="fd-option" onclick="'+action+'"><span><strong>'+title+'</strong><small>'+subtitle+'</small></span><span class="fd-arrow">›</span></button>').join('')+'</div></div>';
}
window.fdMoreCloud=()=>{moreView='cloud';render();window.scrollTo({top:0,behavior:'instant'});};
window.fdMoreMenu=()=>{moreView='menu';render();window.scrollTo({top:0,behavior:'instant'});};
navigate=function(next){if(next==='more')moreView='menu';basicNavigate(next);};
home=landing;
render=function(){
 if(tab==='more'){
  document.getElementById('app').innerHTML=more();
 }else originalRender();
 for(const btn of document.querySelectorAll('.nav button'))btn.classList.toggle('active',btn.dataset.tab===(['home','log','dex'].includes(tab)?tab:'more'));
 document.body.dataset.fdTab=tab;
 document.body.dataset.fdMore=tab==='more'?moreView:'';
};
render();
})();
