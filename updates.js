/* FitnessDex version gate. Release process: bump the HTML meta version and version.json together. */
(()=>{
'use strict';
const current=document.querySelector('meta[name="fitnessdex-version"]')?.content||'';
let checking=false,shown=false,lastCheck=0;
function compare(a,b){
 const x=a.split('.').map(Number),y=b.split('.').map(Number);
 if(!x.length||!y.length||[...x,...y].some(v=>!Number.isFinite(v)))return 0;
 for(let i=0;i<Math.max(x.length,y.length);i++){if((x[i]||0)!==(y[i]||0))return (x[i]||0)>(y[i]||0)?1:-1;}
 return 0;
}
async function updateNow(version,button,status){
 button.disabled=true;button.textContent='Updating…';status.textContent='Checking for the latest files.';
 try{
  if('serviceWorker' in navigator){
   const reg=await navigator.serviceWorker.getRegistration('./');
   if(reg)await reg.update();
  }
  // A fresh navigation gets the latest HTML without clearing local or cloud saves.
  const next=new URL(location.href);
  next.searchParams.set('fitnessdex-update',version);
  next.searchParams.set('refresh',Date.now().toString());
  location.replace(next.toString());
 }catch(e){
  button.disabled=false;button.textContent='Try update again';
  status.textContent='Could not update while offline. Reconnect and try again.';
 }
}
function requireUpdate(version){
 if(shown)return;shown=true;
 const overlay=document.createElement('div');
 overlay.id='fd-update-overlay';overlay.className='fd-update-overlay';
 overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','fd-update-title');
 overlay.innerHTML='<div class="fd-update-dialog"><h2 id="fd-update-title">FitnessDex update available</h2>'
  +'<p>Version '+version+' is ready. You are using v'+current+'. Update to continue.</p>'
  +'<button type="button" id="fd-update-now">Update now</button>'
  +'<small id="fd-update-status" role="status">Your workouts and progress are saved. Personal exercise images stay on this device.</small></div>';
 for(const selector of ['header','main','footer'])document.querySelector(selector)?.setAttribute('inert','');
 document.body.appendChild(overlay);
 const btn=document.getElementById('fd-update-now');
 btn.addEventListener('click',()=>updateNow(version,btn,document.getElementById('fd-update-status')));
 btn.focus();
}
async function checkVersion(force=false){
 if(!navigator.onLine||checking||shown||!current)return;
 if(!force&&Date.now()-lastCheck<60000)return;
 checking=true;lastCheck=Date.now();
 try{
  const url=new URL('./version.json',location.href);
  url.searchParams.set('check',Date.now().toString());
  const res=await fetch(url.toString(),{cache:'no-store'});
  if(!res.ok)return;
  const data=await res.json();
  if(typeof data.version==='string'&&compare(data.version,current)>0)requireUpdate(data.version);
 }catch(e){/* Offline check is non-blocking; local training stays accessible. */}
 finally{checking=false;}
}
window.addEventListener('pageshow',()=>checkVersion(true));
window.addEventListener('focus',()=>checkVersion());
window.addEventListener('online',()=>checkVersion(true));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkVersion();});
checkVersion(true);
})();