/* FitnessDex 0.6 — focused home and compact navigation. */
(() => {
'use strict';
let moreView='menu';
const basicNavigate=navigate, originalRender=render;
function landing(){
 const xp=playerXP(),found=achievementCounts(),st=streakMetrics();
 return '<div class="fd-step-screen fd-landing"><header class="fd-landing-hero"><small>FitnessDex</small><h1>What do you want to do?</h1><button class="fd-landing-primary" onclick="navigate(\'log\')"><span class="fd-primary-plus">＋</span><span><strong>Log an activity</strong><small>Get straight to your exercise</small></span><span class="fd-arrow">›</span></button></header>'+(window.fdQuickDraftHome?.()||'')+(window.fdQuickRepeatHome?.()||'')+'<div class="fd-home-links"><button onclick="navigate(\'habits\')"><strong>Cutting back</strong><small>Daily habit check-in</small></button><button onclick="fdCareHome()"><strong>Daily care</strong><small>Water and supplements</small></button></div>'+(window.fdCareQuickHome?.()||'')+'<details class="fd-log-details fd-progress-closed"><summary>Your progress <small>Level, discoveries & streak</small></summary><div class="fd-progress-metrics"><div><strong>Lv '+(1+Math.floor(xp/500))+'</strong><small>'+xp+' XP</small></div><div><strong>'+found.discovered+'/'+DATA.length+'</strong><small>Exercises discovered</small></div><div><strong>'+st.daily+' days</strong><small>Activity streak</small></div></div><button class="small" onclick="navigate(\'achievements\')">See all achievements</button></details></div>';
}
function more(){
 if(moreView==='cloud')return '<div class="fd-step-screen"><button class="fd-minimal-back" onclick="fdMoreMenu()">‹ Back</button><header class="fd-step-hero"><h1>Cloud saving</h1><p>Check your account and backup settings below.</p></header></div>';
 const routes=[['Daily care','Water and supplement routines',"navigate('care')"],['Progressions','Train for reps, strength and new variations',"navigate('progression')"],['Campaigns','Long-term strength and skill programmes',"navigate('campaigns')"],['Cutting back','Alcohol, smoking and takeaway',"navigate('habits')"],['Workouts','Group exercise records',"navigate('workouts')"],['Achievements','Your rewards and records',"navigate('achievements')"],['History & data','Edit, export or import records',"navigate('history')"],['Cloud saving','Account and backups','fdMoreCloud()']];
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
