/* FitnessDex 0.7 — compact Strength/Bodyweight set grid.
 * The existing submitLog() remains the only saving path for quick logging.
 */
(()=>{
'use strict';
const oldRows=formSetRows;
const escSet=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
function row(e,s,i){
 const reps=s?.reps??'',weight=s?.weight??'',done=Number(reps)>0,loaded=e.mode==='sets';
 return '<div class="setrow fd-set-row '+(done?'fd-set-done':'')+'">'+
  '<span class="fd-set-index">'+(i+1)+'</span>'+
  '<button type="button" class="fd-set-mark '+(done?'done':'')+'" aria-label="Set '+(i+1)+': '+(done?'clear recorded reps':'enter reps')+'" onclick="fdSetToggle(this)">'+(done?'✓':'○')+'</button>'+
  (loaded?'<label class="fd-set-input"><small>kg</small><input class="weight" type="number" min="0" max="1000" step="0.5" aria-label="Set '+(i+1)+' weight in kg" placeholder="kg" value="'+escSet(weight)+'" oninput="fdSetEdited(this)"></label>':'<span class="fd-set-body">Bodyweight</span>')+
  '<label class="fd-set-input"><small>Reps</small><input class="reps" type="number" min="0" max="1000" step="1" aria-label="Set '+(i+1)+' repetitions" placeholder="reps" value="'+escSet(reps)+'" oninput="fdSetEdited(this)"></label>'+
  '<button type="button" class="fd-set-remove" aria-label="Remove set '+(i+1)+'" onclick="fdSetRemove(this)">×</button></div>';
}
formSetRows=function(e,existing){
 if(!['sets','bodysets'].includes(e?.mode))return oldRows(e,existing);
 const s=Array.isArray(existing?.sets)&&existing.sets.length?existing.sets:Array.from({length:3},()=>({weight:'',reps:''}));
 return '<div class="fd-set-grid">'+s.map((entry,i)=>row(e,entry,i)).join('')+'</div>';
};
window.fdSetEdited=function(input){
 const r=input.closest('.fd-set-row');if(!r)return;
 const done=Number(r.querySelector('.reps')?.value)>0;r.classList.toggle('fd-set-done',done);
 const mark=r.querySelector('.fd-set-mark');mark.classList.toggle('done',done);mark.textContent=done?'✓':'○';
 mark.setAttribute('aria-label','Set '+(Number(r.querySelector('.fd-set-index').textContent))+': '+(done?'clear recorded reps':'enter reps'));
};
window.fdSetToggle=function(button){
 const r=button.closest('.fd-set-row'),input=r?.querySelector('.reps');if(!input)return;
 if(Number(input.value)>0){input.value='';window.fdSetEdited(input);}
 else input.focus();
};
window.fdSetRemove=function(button){
 const a=document.querySelectorAll('#setrows .setrow');
 if(a.length<=1){const row=button.closest('.fd-set-row');row.querySelector('.reps').value='';window.fdSetEdited(row.querySelector('.reps'));return;}
 button.closest('.setrow')?.remove();
 document.querySelectorAll('#setrows .setrow').forEach((r,i)=>{
  r.querySelector('.fd-set-index').textContent=String(i+1);
  r.querySelector('.fd-set-mark').setAttribute('aria-label','Set '+(i+1));
 });
};
addSet=function(){
 const e=ex(chosen),holder=document.querySelector('#setrows .fd-set-grid');if(!holder)return;
 const i=holder.querySelectorAll('.setrow').length;if(i>=100)return;
 holder.insertAdjacentHTML('beforeend',row(e,{weight:'',reps:''},i));
};
})();
