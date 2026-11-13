/* FitnessDex 0.6 — one decision per logging screen. */
(() => {
'use strict';
let stage='type', category=null, family=null, query='', returnStage='variants';
const baseNavigate=navigate, baseChoose=choose, baseSubmit=submitLog;
const categoryNames={
 'Calisthenics':['◆','Bodyweight','Push-ups, pull-ups and core'],
 'Weight training':['▥','Weights','Squats, pressing and pulling'],
 'Flexibility & mobility':['◎','Mobility','Stretches and controlled movement'],
 'Cardio':['↗','Cardio','Walking, running, swimming and cycling']
};
const simplify=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const top=()=>window.scrollTo({top:0,behavior:'instant'});
function familyName(e){
 if(e.cat==='Calisthenics'&&/push[ -]?up/i.test(e.name))return 'Push-ups';
 if(e.cat==='Weight training'&&/squat/i.test(e.name))return 'Squats';
 return familyOf(e);
}
function familiar(cat=null){
 const records=new Map();
 for(const l of S.logs){
  const e=ex(l.id);if(!e||(cat&&cat!==e.cat))continue;
  const old=records.get(e.id)||{e,uses:0,last:0};
  old.uses++;old.last=Math.max(old.last,logWhen(l)||0);
  records.set(e.id,old);
 }
 return [...records.values()].sort((a,b)=>b.uses-a.uses||b.last-a.last).slice(0,5).map(x=>x.e);
}
function item(e,subtitle){return '<button class="fd-option" type="button" onclick="fdSelectExercise(\''+e.id+'\')"><span><strong>'+esc(e.name)+'</strong><small>'+esc(subtitle||familyName(e))+'</small></span><span class="fd-arrow">›</span></button>';}
function back(label,number){return '<div class="fd-stepback"><button onclick="fdLogBack()">‹ Back</button><span>'+esc(label)+' · '+number+'/4</span></div>';}
function frequent(cat){const r=familiar(cat);return r.length?'<section class="fd-step-section"><div class="fd-section-label"><h2>Recent & frequent</h2><small>Up to 5</small></div><div class="fd-option-list">'+r.map(e=>item(e)).join('')+'</div></section>':'';}
function categories(){return '<div class="fd-step-screen"><header class="fd-step-hero"><small>Log activity</small><h1>What did you do?</h1></header><div class="fd-category-list">'+CATS.map(cat=>{
 const [symbol,name,note]=categoryNames[cat];
 return '<button class="fd-category-option" data-cat="'+esc(cat)+'" onclick="fdPickActivityType(this.dataset.cat)"><span class="fd-category-symbol">'+symbol+'</span><span><strong>'+esc(name)+'</strong><small>'+esc(note)+'</small></span><span class="fd-arrow">›</span></button>';
 }).join('')+'</div>'+frequent()+'</div>';}
function find(){
 const exercises=DATA.filter(e=>e.cat===category),families=[...new Set(exercises.map(familyName))].sort((a,b)=>a.localeCompare(b)),q=simplify(query);
 let content;
 if(q){
  const results=exercises.filter(e=>simplify(e.name).includes(q)||simplify(familyName(e)).includes(q));
  content='<div class="fd-section-label"><h2>Matching exercises</h2><small>'+results.length+' found</small></div><div class="fd-option-list">'+results.slice(0,60).map(e=>item(e)).join('')+'</div>';
  if(!results.length)content='<p class="fd-step-empty">Nothing found in this activity type. Try another search.</p>';
 }else{
  content=frequent(category)+'<section class="fd-step-section"><div class="fd-section-label"><h2>Exercise groups</h2><small>Choose a group</small></div><div class="fd-option-list fd-group-list">'+families.map(f=>{
   const count=exercises.filter(e=>familyName(e)===f).length;
   return '<button class="fd-option" data-group="'+esc(f)+'" onclick="fdPickExerciseGroup(this.dataset.group)"><span><strong>'+esc(f)+'</strong><small>'+count+' '+(count===1?'exercise':'variations')+'</small></span><span class="fd-arrow">›</span></button>';
  }).join('')+'</div></section>';
 }
 return '<div class="fd-step-screen">'+back('Find exercise',2)+'<header class="fd-step-hero"><small>'+esc(category)+'</small><h1>Find an exercise</h1></header><label class="fd-search-label" for="fd-exercise-search">Search exercises</label><input id="fd-exercise-search" class="fd-exercise-search" type="search" autocomplete="off" placeholder="Search exercise or group" value="'+esc(query)+'" oninput="fdExerciseQuery(this.value)"><div class="fd-find-results">'+content+'</div></div>';
}
function variants(){const exercises=DATA.filter(e=>e.cat===category&&familyName(e)===family);
 return '<div class="fd-step-screen">'+back('Choose variation',3)+'<header class="fd-step-hero"><small>'+esc(category)+'</small><h1>'+esc(family)+'</h1><p>Which variation did you do?</p></header><div class="fd-option-list">'+exercises.map(e=>item(e,'Select to record')).join('')+'</div></div>';
}
function method(){const e=ex(chosen);return '<div class="fd-step-screen fd-method-screen">'+back('Training method',4)+'<header class="fd-step-hero"><small>'+esc(e.cat)+'</small><h1>'+esc(e.name)+'</h1><p>How do you want to train?</p></header><div class="fd-option-list"><button class="fd-option fd-method-choice" onclick="fdQuickLog()"><span><strong>Just log sets and reps</strong><small>Record what you actually complete, without targets</small></span><span class="fd-arrow">›</span></button><button class="fd-option fd-method-choice" onclick="fdStartProgression(\''+e.id+'\')"><span><strong>Follow a progression</strong><small>Suggested sets, variations, recovery and persistence awards</small></span><span class="fd-arrow">›</span></button></div></div>';}
function record(){
 const e=ex(chosen)||DATA[0], l=editId?S.logs.find(x=>logId(x)===editId):null,m=e.mode;
 const setMode=m==='sets'||m==='bodysets';
 const defaultSets=l||null;
 const valueTitle=m==='time'?'Seconds':m==='range'?'Gap from floor (cm)':m==='duration'?'Minutes':'Distance (km)';
 const metrics=setMode?'<label class="fd-record-label">'+(m==='sets'?'Weight and repetitions':'Repetitions per set')+'</label><div id="setrows">'+formSetRows(e,defaultSets)+'</div><div class="fd-set-actions"><button class="small" type="button" onclick="addSet()">+ Add set</button>'+(logsFor(e.id).some(x=>x.sets?.length)?'<button class="small" type="button" onclick="prefillSets()">Use last session</button>':'')+'</div>':'<div class="field"><label for="value">'+valueTitle+'</label><input id="value" type="number" '+(m==='range'?'':'min="0"')+' step="any" value="'+esc(l?.value??'')+'" placeholder="'+esc(e.unit)+'"></div>';
 const extra=m==='distance'||m==='duration'?'<div class="field"><label for="extra">'+(m==='distance'?'Minutes':'Distance (km)')+' (optional)</label><input id="extra" type="number" min="0" step="any" value="'+esc(m==='distance'?l?.minutes??'':l?.distance??'')+'"></div>':'';
 const isSwim=m==='duration'&&(e.id==='e051'||['e121','e122','e123','e124'].includes(e.id));
 const swim=isSwim?'<div class="two"><div class="field"><label for="stroke">Stroke</label><select id="stroke">'+['','Front crawl','Breaststroke','Backstroke','Butterfly','Mixed'].map(x=>'<option '+(x===(l?.stroke||'')?'selected':'')+'>'+esc(x)+'</option>').join('')+'</select></div><div class="field"><label for="lengths">Lengths</label><input id="lengths" type="number" min="0" step="1" value="'+esc(l?.lengths??'')+'"></div></div>':'';
 const side=e.side?'<div class="field"><label for="side">Side</label><select id="side">'+['both','left','right'].map(x=>'<option value="'+x+'" '+(x===(l?.side||'both')?'selected':'')+'>'+x+'</option>').join('')+'</select></div>':'';
 const mobility=e.cat==='Flexibility & mobility'?'<div class="field"><label for="mobilityType">Movement type (optional)</label><select id="mobilityType">'+['','Passive stretch','Active mobility','Controlled end range'].map(x=>'<option '+(x===(l?.mobilityType||'')?'selected':'')+'>'+esc(x)+'</option>').join('')+'</select></div>':'';
 const groupPicker=window.fdWorkoutSelector?window.fdWorkoutSelector(l):'<div class="field"><label>How to save</label><select id="session"><option value="standalone">Standalone</option></select></div>';
 const details='<details class="fd-log-details"><summary>More details <small>Time, notes, workout</small></summary><div class="fd-log-details-inner"><div class="two"><div class="field"><label for="date">Date</label><input id="date" type="date" value="'+esc(l?.date||today())+'"></div><div class="field"><label for="clock">Time</label><input id="clock" type="time" value="'+timeText(l)+'"></div></div>'+mobility+groupPicker+'<div class="field"><label for="notes">Notes (optional)</label><input id="notes" maxlength="500" value="'+esc(l?.notes||'')+'" placeholder="Technique, route, how it felt…"></div></div></details>';
 return '<div class="fd-step-screen fd-log-record">'+back('Record activity',4)+'<header class="fd-step-hero"><small>'+esc(e.cat)+'</small><h1>'+esc(e.name)+'</h1></header><section class="fd-entry-card"><h2>What did you complete?</h2>'+metrics+extra+swim+side+'</section>'+details+'<details class="fd-log-details"><summary>How to do this exercise</summary><p>'+esc(EXERCISE_GUIDES[e.id]||'')+'</p></details><div class="fd-save-actions"><button class="primary" onclick="submitLog()">'+(l?'Save corrections':'Save activity')+'</button></div></div>';
}
function done(){const last=S.v4?.lastResult||{},xp=last.xpGain||0;
 return '<div class="fd-step-screen fd-logged"><div class="fd-logged-symbol">✓</div><small>Activity saved</small><h1>'+esc(last.exercise||'Exercise')+' logged</h1><p>'+esc(last.summary||'')+'</p>'+(xp?'<div class="fd-logged-xp">+'+Math.round(xp)+' XP</div>':'')+(last.milestones?.length?'<p>New milestone: '+esc(last.milestones.slice(0,2).join(' · '))+'</p>':'')+(last.challengeNames?.length?'<p>Challenge complete: '+esc(last.challengeNames.slice(0,2).join(' · '))+'</p>':'')+'<div class="fd-logged-actions"><button class="primary" onclick="navigate(\'log\')">Log another</button><button onclick="navigate(\'home\')">Done for now</button></div></div>';
}
window.fdLogStage=()=>stage;
window.fdPickActivityType=cat=>{if(!CATS.includes(cat))return;category=cat;family=null;query='';stage='find';render();top();};
window.fdPickExerciseGroup=group=>{if(!DATA.some(e=>e.cat===category&&familyName(e)===group))return;family=group;stage='variants';render();top();};
window.fdExerciseQuery=value=>{query=value;render();const input=document.getElementById('fd-exercise-search');if(input){input.focus();input.setSelectionRange(value.length,value.length);}};
window.fdSelectExercise=id=>{if(!ex(id))return;returnStage=stage;stage=['sets','bodysets'].includes(ex(id).mode)?'method':'record';family=familyName(ex(id));category=ex(id).cat;editId=null;baseChoose(id);};
window.fdQuickLog=()=>{stage='record';render();top();};
window.fdLogBack=()=>{if(editId){editId=null;stage='variants';}else if(stage==='record'&&['sets','bodysets'].includes(ex(chosen)?.mode))stage='method';else if(stage==='method')stage=['type','find','variants'].includes(returnStage)?returnStage:'variants';else if(stage==='record')stage=['type','find','variants'].includes(returnStage)?returnStage:'variants';else if(stage==='variants')stage='find';else if(stage==='find')stage='type';else return navigate('home');render();top();};
navigate=function(next){if(next==='log'){stage='type';query='';family=null;editId=null;}baseNavigate(next);};
choose=function(id){if(!ex(id))return;returnStage='variants';stage=['sets','bodysets'].includes(ex(id).mode)?'method':'record';category=ex(id).cat;family=familyName(ex(id));baseChoose(id);};
logForm=function(){return editId?record():stage==='type'?categories():stage==='find'?find():stage==='variants'?variants():stage==='method'?method():stage==='done'?done():record();};
submitLog=function(){const before=S.logs.length,wasEdit=!!editId;baseSubmit();if(!wasEdit&&S.logs.length>before){stage='done';tab='log';render();top();}};
})();
