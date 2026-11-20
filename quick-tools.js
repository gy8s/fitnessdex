/* FitnessDex v0.8.2: small, reversible convenience actions. Core exercise records remain unchanged. */
(()=>{
'use strict';
const KEY='fitnessdex-quick-log-draft-v1';
const draftToken=d=>d.token||JSON.stringify([d.id,d.editId||null,d.at]);
const html=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
function recent(){
 let latest=null,latestTime=-Infinity;
 for(const log of completedLogs()){
  const time=logWhen(log);
  if(time>latestTime){latest=log;latestTime=time;}
 }
 return latest;
}
function getDraft(){
 try{
  const raw=localStorage.getItem(KEY);if(!raw||raw.length>40000)return null;
  const d=JSON.parse(raw);
  if(!d||typeof d!=='object'||!ex(d.id)||typeof d.at!=='string'||!Number.isFinite(Date.parse(d.at))||Date.parse(d.at)>Date.now()+60000||!d.fields||typeof d.fields!=='object'||!Array.isArray(d.sets)||(d.editId&&!S.logs.some(x=>logId(x)===d.editId)))return null;
  if(S.v4?.lastResult?.draftToken===draftToken(d)){
   localStorage.removeItem(KEY);
   return null;
  }
  return d;
 }catch(e){return null;}
}
function collectDraft(){
 if(tab!=='log'||!editId&&window.fdLogStage?.()!=='record')return;
 const date=document.getElementById('date'),notes=document.getElementById('notes');
 if(!date||!notes)return;
 const fields={};for(const id of ['date','clock','notes','session','value','extra','side','stroke','lengths','mobilityType']){
  const el=document.getElementById(id);if(el)fields[id]=String(el.value||'').slice(0,500);
 }
 const rows=readSetRows().slice(0,100).map(row=>({
  reps:row.reps.slice(0,9),
  weight:row.weight.slice(0,9)
 }));
 const draft={id:chosen,editId:editId||null,at:new Date().toISOString(),token:uid(),fields,sets:rows,copiedSide:window.fdCopiedLogSide?.()||null};
 try{const value=JSON.stringify(draft);if(value.length<=40000)localStorage.setItem(KEY,value);}catch(e){}
}
window.fdSaveQuickDraft=collectDraft;
window.fdQuickDraftToken=(id,editing)=>{
 const saved=getDraft();
 if(saved&&saved.id===id&&(saved.editId||null)===(editing||null))return draftToken(saved);
};
window.fdClearQuickDraft=(id,logEditId)=>{
 if(id){
  const saved=getDraft();
  if(!saved||saved.id!==id||(saved.editId||null)!==(logEditId||null))return;
 }
 try{localStorage.removeItem(KEY);}catch(e){}
};
window.fdQuickDraftHome=()=>{
 const d=getDraft();if(!d)return '';
 return '<div class="fd-draft-banner"><span><strong>Unfinished activity</strong><small>'+html(ex(d.id)?.name||'Exercise')+' · Not yet saved</small></span><button onclick="fdResumeQuickDraft()">Resume</button><button class="fd-draft-discard" onclick="fdDiscardQuickDraft()" aria-label="Discard unfinished activity">×</button></div>';
};
window.fdResumeQuickDraft=()=>{
 const d=getDraft();if(!d){toast('No recoverable draft found.');return;}
 if(d.editId){if(!editLog(d.editId))return;}
 else{if(!choose(d.id))return;if(['sets','bodysets'].includes(ex(d.id).mode))window.fdQuickLog?.();}
 for(const [id,val] of Object.entries(d.fields)){
  const el=document.getElementById(id);if(!el)continue;
  if(id==='session'&&!Array.from(el.options||[]).some(x=>x.value===val))continue;
  el.value=val;
 }
 if(d.sets.length&&['sets','bodysets'].includes(ex(d.id).mode)){
  const area=document.getElementById('setrows');
  if(area)area.innerHTML=formSetRows(ex(d.id),{sets:d.sets.map(x=>({weight:x.weight,reps:x.reps}))});
 }
 if(d.fields.side)window.fdRefreshLogComparison?.();
 window.fdRestoreCopiedLogSide?.(d.copiedSide);
 toast('Unfinished activity restored. Review the numbers before saving.');
};
window.fdDiscardQuickDraft=()=>{
 if(!getDraft())return;
 if(!confirm('Discard this unfinished activity? Nothing from this draft has been logged yet.'))return;
 window.fdClearQuickDraft();render();
};
window.fdRepeatLast=()=>{
 const last=recent();if(!last)return toast('No recent exercise to repeat.');
 if(!choose(last.id))return;
 if(['sets','bodysets'].includes(ex(last.id).mode)){window.fdQuickLog?.();const area=document.getElementById('setrows');if(area&&last.sets?.length)area.innerHTML=formSetRows(ex(last.id),last);}
 else{const value=document.getElementById('value');if(value)value.value=last.value??'';
  const extra=document.getElementById('extra');if(extra)extra.value=last.mode==='distance'?(last.minutes??''):(last.distance??'');
  for(const id of ['stroke','lengths']){const el=document.getElementById(id);if(el&&last[id]!=null)el.value=last[id];}
 }
 const side=document.getElementById('side');
 if(side&&last.side){side.value=last.side;window.fdRefreshLogComparison?.();}
 window.fdRestoreCopiedLogSide?.(last.side||'both');
 collectDraft();
 toast('Previous result copied as a starting point. Edit it to match what you actually do.');
};
window.fdQuickRepeatHome=()=>{
 const last=recent();if(!last)return '';
 return '<button class="fd-repeat-shortcut" onclick="fdRepeatLast()"><span><strong>Repeat last activity</strong><small>'+html(ex(last.id)?.name||'Exercise')+' · prefill previous results</small></span><b>›</b></button>';
};
window.fdCareQuickHome=()=>{
 if(!window.fdCareStatus)return '';
 const status=window.fdCareStatus(),supp=status.supp||{done:0,due:0};
 return '<details class="fd-care-home-quick"><summary>Quick check-in <small>'+html((status.ml/1000).toLocaleString('en-GB',{maximumFractionDigits:2}))+' / '+html((status.goal/1000).toLocaleString('en-GB',{maximumFractionDigits:2}))+' L water · '+supp.done+'/'+supp.due+' supplements</small></summary><div class="fd-care-home-buttons"><button onclick="fdCareAddWater(250)">+250 ml water</button><button onclick="fdCareSupplements()">Supplements</button></div></details>';
};
window.fdUndoLastLog=()=>{
 const id=S.v4?.lastResult?.logId;
 if(!id||!S.logs.some(x=>logId(x)===id))return toast('This log has already been removed.');
 deleteLog(id);
 if(!S.logs.some(x=>logId(x)===id))navigate('home');
};
window.fdHistoryQuery='';
window.fdHistoryDate='';
window.fdHistoryPage=0;
window.fdHistoryApply=()=>{
 const search=document.getElementById('fd-history-query'),date=document.getElementById('fd-history-date');
 window.fdHistoryQuery=(search?.value||'').slice(0,100);window.fdHistoryDate=date?.value||'';
 window.fdHistoryPage=0;renderHistoryResults();
};
window.fdHistoryReset=()=>{
 const search=document.getElementById('fd-history-query'),date=document.getElementById('fd-history-date');
 if(search)search.value='';
 if(date)date.value='';
 window.fdHistoryQuery='';window.fdHistoryDate='';window.fdHistoryPage=0;
 renderHistoryResults();
};
window.fdHistoryPageBy=direction=>{
 window.fdHistoryPage=Math.max(0,window.fdHistoryPage+(direction<0?-1:1));
 renderHistoryResults();
 document.getElementById('fd-history-results')?.scrollIntoView?.({block:'start'});
};
const onFormInput=e=>{
 const el=e.target;if(!el?.closest?.('#app'))return;
 if(tab==='log'&&(editId||window.fdLogStage?.()==='record'))collectDraft();
};
document.addEventListener('input',onFormInput);
document.addEventListener('change',onFormInput);
let lastDay=today();
function refreshIfNeeded(){
 if(document.hidden)return;
 const day=today();if(day===lastDay)return;lastDay=day;
 // Never refresh an editable activity form, guided set, or supplement editor.
 if(['home','more','campaigns','achievements','dex'].includes(tab)||tab==='care'&&!window.fdCareIsEditing?.())render();
}
document.addEventListener('visibilitychange',refreshIfNeeded);
window.addEventListener('focus',refreshIfNeeded);
if(tab==='home')render();
})();
