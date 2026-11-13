/* FitnessDex personal exercise images, v0.5.8.
 * Stored only in this browser's IndexedDB. Never sent to cloud saves or GitHub.
 */
(()=>{
'use strict';
const DB_NAME='fitnessdex-personal-exercise-media';
const STORE='images';
const MAX_BYTES=20*1024*1024;
const types=new Set(['image/png','image/jpeg','image/webp','image/gif']);
const objects=new Map();
const urls=new Map();
let db=null, error='';
function escapeHTML(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function setImage(id,blob){
 const old=urls.get(id);if(old)URL.revokeObjectURL(old);
 objects.set(id,blob);urls.set(id,URL.createObjectURL(blob));
}
function setMessage(id,msg){
 const el=document.getElementById('fd-media-message-'+id);if(el)el.textContent=msg;
}
function panel(id){
 if(!/^e\d{3}$/.test(id))return '';
 const image=urls.get(id);
 return '<div class="fd-media"><h4>Personal exercise illustration</h4>'
  +'<div class="fd-media-preview">'+(image?'<img src="'+escapeHTML(image)+'" alt="Personal reference illustration for this exercise">':'<span class="fd-media-empty">No image added yet</span>')+'</div>'
  +'<div class="fd-media-actions"><label class="fd-media-upload" for="fd-media-file-'+id+'">'+(image?'Replace image / GIF':'Add image / GIF')+'</label>'
  +'<input id="fd-media-file-'+id+'" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onchange="fdExerciseMediaAdd(\''+id+'\',this.files[0]);this.value=\'\'">'
  +(image?'<button class="small" type="button" onclick="fdExerciseMediaRemove(\''+id+'\')">Remove</button>':'')+'</div>'
  +'<p class="fd-media-note">Private to this browser. Not uploaded or cloud-synced. Add only media you have permission to use.</p>'
  +'<span class="fd-media-message" id="fd-media-message-'+id+'" role="status">'+escapeHTML(error)+'</span></div>';
}
function storeWrite(id,blob){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,'readwrite');
  if(blob)tx.objectStore(STORE).put({id,blob});else tx.objectStore(STORE).delete(id);
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||Error('Storage failed'));tx.onabort=()=>reject(tx.error||Error('Storage cancelled'));
 });
}
window.fdExerciseMediaPanel=panel;
window.fdExerciseMediaAdd=async(id,file)=>{
 if(!file)return;
 if(!db){setMessage(id,error||'Local image storage is not available.');return;}
 if(!/^e\d{3}$/.test(id)||!types.has(file.type)){setMessage(id,'Choose a PNG, JPEG, WebP or GIF image.');return;}
 if(file.size>MAX_BYTES){setMessage(id,'Choose a file smaller than 20 MB.');return;}
 try{await storeWrite(id,file);setImage(id,file);if(typeof window.render==='function')window.render();}
 catch(e){setMessage(id,'Could not save image: '+(e.message||'storage error'));}
};
window.fdExerciseMediaRemove=async id=>{
 if(!db||!objects.has(id)||!confirm('Remove this locally stored illustration?'))return;
 try{
  await storeWrite(id,null);
  const old=urls.get(id);if(old)URL.revokeObjectURL(old);
  objects.delete(id);urls.delete(id);
  if(typeof window.render==='function')window.render();
 }catch(e){setMessage(id,'Could not remove image: '+(e.message||'storage error'));}
};
async function initialise(){
 try{
  db=await new Promise((resolve,reject)=>{
   const req=indexedDB.open(DB_NAME,1);
   req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'id'});};
   req.onsuccess=()=>resolve(req.result);
   req.onerror=()=>reject(req.error||Error('Could not open image storage'));
   req.onblocked=()=>reject(Error('Close other FitnessDex tabs and reopen'));
  });
  const items=await new Promise((resolve,reject)=>{
   const tx=db.transaction(STORE,'readonly');
   const req=tx.objectStore(STORE).getAll();
   req.onsuccess=()=>resolve(req.result);
   req.onerror=()=>reject(req.error||Error('Could not read saved images'));
  });
  for(const item of items)if(item?.id&&item.blob instanceof Blob)setImage(item.id,item.blob);
 }catch(e){error='Local image storage unavailable: '+(e.message||'unknown error');}
 if(typeof window.render==='function')window.render();
}
window.addEventListener('pagehide',event=>{if(!event.persisted)for(const url of urls.values())URL.revokeObjectURL(url);});
initialise();
})();