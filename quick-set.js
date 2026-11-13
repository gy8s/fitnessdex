/* FitnessDex v0.7 — fast, standalone, set-first logging.
 * One exercise/set at a time. Completed sets saved as ordinary ExerciseDex records.
 */
(()=>{
'use strict';
const KEY='fitnessdex-quick-set-draft-v1';
let draft=null,number=0,kg=0,variantId=null,stage='entry',restUntil=0,interval=null;
const supported=id=>['bodysets','sets','time'].includes(ex(id)?.mode);
const group=e=>e.cat==='Calisthenics'&&/push[ -]?up/i.test(e.name)?'Push-ups':e.cat+'|'+e.family;
const family=id=>{const e=ex(id);return e?DATA.filter(x=>supported(x.id)&&x.mode===e.mode&&group(x)===group(e)).slice(0,30):[];};
const recent=id=>S.logs.filter(l=>l.id===id&&Number.isFinite(logWhen(l))).sort((a,b)=>logWhen(b)-logWhen(a))[0];
const last=id=>{const l=recent(id),e=ex(id);return {n:l?(e.mode==='time'?logMetrics(l).seconds:logMetrics(l).bestReps):0,kg:l?.sets?.find(s=>s.weight>0)?.weight||0};};
function persist(){try{if(draft)localStorage.setItem(KEY,JSON.stringify(draft));else localStorage.removeItem(KEY);return true;}catch(e){alert('Could not keep the draft on this device. Free some space first.');return false;}}
function restore(){
 try{const d=JSON.parse(localStorage.getItem(KEY)||'null');
  return d&&supported(d.root)&&Array.isArray(d.sets)&&d.sets.length<=100&&d.id&&d.sets.every(s=>supported(s.id))?d:null;
 }catch(e){return null;}
}
const time=seconds=>{const s=Math.max(0,Math.ceil(seconds));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};
function resetInput(id){variantId=id;const x=last(id);number=x.n||0;kg=x.kg||0;}
function html(){
 if(!draft&&stage==='done')return '<div class="fd-prog fd-prog-done"><div class="fd-prog-done-icon">✓</div><h1>Activity saved</h1><p>Your completed sets now count in ExerciseDex, challenges and campaigns.</p><button class="primary fd-prog-wide" onclick="fdQuickAgain()">Log another</button><button class="fd-prog-secondary fd-prog-wide" onclick="navigate(\'home\')">Done for now</button></div>';
 if(!draft)return '<div class="fd-prog"><p>No quick session is open.</p><button onclick="navigate(\'log\')">Log an activity</button></div>';
 const e=ex(variantId),items=family(draft.root),done=draft.sets.length;
 const header='<div class="fd-prog fd-prog-session"><div class="fd-prog-top"><button onclick="fdQuickClose()">‹ Back</button><span>Quick sets · '+done+' logged in draft</span></div>';
 if(stage==='rest')return header+'<section class="fd-prog-focus"><small>REST</small><h1>Ready for another?</h1><div class="fd-prog-clock" id="fd-quick-rest">'+time((restUntil-Date.now())/1000)+'</div><p>You can continue whenever you feel ready.</p><button class="primary fd-prog-wide" onclick="fdQuickReady()">Next set</button></section><button class="fd-prog-secondary fd-prog-wide" onclick="fdQuickSave()">Save '+done+' '+(done===1?'set':'sets')+' now</button></div>';
 if(stage==='after')return header+'<section class="fd-prog-focus"><small>SET RECORDED</small><h1>'+done+' '+(done===1?'set':'sets')+' in your draft</h1><p>'+esc(ex(draft.sets[done-1].id).name)+' · '+draft.sets[done-1].value+(ex(draft.sets[done-1].id).mode==='time'?' seconds':' reps')+'</p><button class="primary fd-prog-wide" onclick="fdQuickMore()">+ Log another set</button><button class="fd-prog-secondary fd-prog-wide" onclick="fdQuickSave()">Save '+done+' '+(done===1?'set':'sets')+'</button></section><button class="fd-prog-undo" onclick="fdQuickUndo()">Undo previous set</button></div>';
 if(stage==='done')return header+'<section class="fd-prog-focus"><div class="fd-prog-done-icon">✓</div><h1>Activity saved</h1><p>Your completed sets now count in ExerciseDex, challenges and campaigns.</p><button class="primary fd-prog-wide" onclick="fdQuickAgain()">Log another</button><button class="fd-prog-secondary fd-prog-wide" onclick="navigate(\'home\')">Done for now</button></section></div>';
 return header+'<section class="fd-prog-focus"><small>SET '+(done+1)+'</small><h1>'+esc(e.name)+'</h1><p>No targets. Record what you actually completed.</p>'+
 '<div class="fd-prog-counter"><button onclick="fdQuickStep(-1)">−</button><div><strong id="fd-quick-number">'+number+'</strong><small>'+(e.mode==='time'?'seconds':'reps')+'</small></div><button onclick="fdQuickStep(1)">+</button></div>'+
 '<label class="fd-prog-field">Actual '+(e.mode==='time'?'seconds':'repetitions')+'<input id="fd-quick-input" inputmode="numeric" type="number" step="1" min="0" max="'+(e.mode==='time'?86400:1000)+'" value="'+number+'" oninput="fdQuickNumber(this.value)"></label>'+
 (e.mode==='sets'?'<label class="fd-prog-field">Weight (kg)<input id="fd-quick-weight" type="number" inputmode="decimal" min="0.5" max="1000" step="0.5" value="'+(kg||'')+'" oninput="fdQuickWeight(this.value)"></label>':'')+
 '<button class="primary fd-prog-wide fd-prog-record" onclick="fdQuickLog()">✓ Log set</button></section>'+
 '<details class="fd-prog-switch"><summary>Change variation</summary><select onchange="fdQuickVariation(this.value)">'+items.map(x=>'<option value="'+x.id+'" '+(x.id===e.id?'selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select></details>'+
 (done?'<button class="fd-prog-secondary fd-prog-wide" onclick="fdQuickSave()">Save '+done+' completed '+(done===1?'set':'sets')+'</button>':'')+
 '<button class="fd-prog-undo" onclick="fdQuickDetailed()">Use detailed logging form instead</button></div>';
}
window.fdQuickView=()=>html();
window.fdQuickStart=id=>{
 if(!supported(id))return;
 if(draft?.sets?.length){
  stage='after';tab='quick';render();window.scrollTo({top:0,behavior:'instant'});
  return;
 }
 draft={id:'q-'+uid(),root:id,sets:[]};resetInput(id);stage='entry';persist();tab='quick';render();window.scrollTo({top:0,behavior:'instant'});
};
window.fdQuickResume=()=>{draft=restore();if(!draft)return navigate('log');resetInput(draft.sets.at(-1)?.id||draft.root);stage=draft.sets.length?'after':'entry';tab='quick';render();};
window.fdQuickNumber=value=>{
 const v=Number(value);if(!Number.isInteger(v)||v<0||v>86400)return;number=v;
 const d=document.getElementById('fd-quick-number');if(d)d.textContent=String(v);
};
window.fdQuickWeight=value=>{if(Number.isFinite(Number(value)))kg=Number(value);};
window.fdQuickStep=change=>{
 number=Math.max(0,number+change*(ex(variantId).mode==='time'?5:1));
 const field=document.getElementById('fd-quick-input');if(field)field.value=number;
 const d=document.getElementById('fd-quick-number');if(d)d.textContent=String(number);
};
window.fdQuickVariation=id=>{if(!draft||!family(draft.root).some(x=>x.id===id))return;resetInput(id);render();};
window.fdQuickLog=()=>{
 if(!draft||stage!=='entry')return;
 const e=ex(variantId),input=document.getElementById('fd-quick-input');
 const value=input?Number(input.value):number;
 const w=document.getElementById('fd-quick-weight'),mass=w?Number(w.value):kg;
 if(!Number.isInteger(value)||value<=0||value>(e.mode==='time'?86400:1000))return alert('Enter a positive number of completed '+(e.mode==='time'?'seconds':'reps')+'.');
 if(e.mode==='sets'&&(!Number.isFinite(mass)||mass<=0||mass>1000))return alert('Enter a positive weight in kg.');
 const data={id:e.id,value,weight:e.mode==='sets'?mass:0,at:new Date().toISOString()};
 draft.sets.push(data);
 if(!persist()){draft.sets.pop();return;}
 stage='after';render();
};
window.fdQuickMore=()=>{stage='rest';restUntil=Date.now()+90000;render();};
window.fdQuickReady=()=>{stage='entry';resetInput(draft.sets.at(-1)?.id||draft.root);render();};
window.fdQuickUndo=()=>{if(!draft||!draft.sets.length)return;const l=draft.sets.pop();resetInput(l.id);number=l.value;kg=l.weight||0;stage='entry';persist();render();};
window.fdQuickDetailed=()=>{if(draft?.sets?.length&&!confirm('The unsaved quick sets will be discarded. Continue to the detailed form?'))return;draft=null;persist();window.fdLogUseDetailed?.();};
window.fdQuickClose=()=>{if(draft?.sets?.length&&!confirm('Discard this unsaved quick-set session?'))return;draft=null;persist();navigate('log');};
window.fdQuickAgain=()=>window.fdQuickStart(draft?.root||lastRoot);
let lastRoot=null;
window.fdQuickSave=()=>{
 if(!draft)return;
 if(!draft.sets.length)return alert('Log at least one set.');
 if(S.logs.some(l=>l.quickSessionId===draft.id)){lastRoot=draft.root;draft=null;persist();stage='done';render();return;}
 const before=JSON.stringify(S),current=new Date(),byExercise=new Map();
 for(const item of draft.sets){
  if(!byExercise.has(item.id))byExercise.set(item.id,[]);
  byExercise.get(item.id).push(item);
 }
 const entries=[];
 for(const [id,sets] of byExercise){
  const e=ex(id),when=new Date(sets[sets.length-1].at);
  const row={at:current.toISOString()+'-'+uid(),quickSessionId:draft.id,id,mode:e.mode,date:stamp(when),performedAt:when.toISOString(),notes:'',sessionId:null};
  if(e.mode==='time'){
   // Timed holds are saved as separate real hold records, not combined into a fictitious maximum.
   for(const item of sets){
    const holdWhen=new Date(item.at);
    entries.push({...row,at:current.toISOString()+'-'+uid(),date:stamp(holdWhen),performedAt:holdWhen.toISOString(),value:item.value});
   }
  }else{row.sets=sets.map(x=>e.mode==='sets'?{weight:x.weight,reps:x.value}:{reps:x.value});entries.push(row);}
 }
 if(!entries.every(isSafeEntry))return alert('One or more sets were invalid. Nothing was saved.');
 S.logs.push(...entries);resetDerived();
 if(!save()){S=JSON.parse(before);resetDerived();return;}
 const finishedSets=draft.sets.length;
 lastRoot=draft.root;draft=null;persist();
 const revoked=reconcileCompleted(),claimed=claimReady();
 S.v4=S.v4||{hunts:[],lastResult:null};
 S.v4.lastResult={logId:entries[entries.length-1].at,exercise:ex(lastRoot).name,summary:finishedSets+' sets of '+new Set(entries.map(x=>x.id)).size+' exercises',xpGain:0,challengeNames:claimed.map(x=>x.label),milestones:[]};
 save();stage='done';tab='quick';render();window.scrollTo({top:0,behavior:'instant'});
 if(revoked)toast('A corrected challenge was recalculated.');
};
draft=restore();
if(typeof setInterval==='function'){
 interval=setInterval(()=>{
  if(tab==='quick'&&stage==='rest'){
   const el=document.getElementById('fd-quick-rest');if(el)el.textContent=time((restUntil-Date.now())/1000);
  }
 },1000);
}
})();
