#!/usr/bin/env node
/* FitnessDex release smoke checks — no npm dependencies. Run: node tests/smoke.cjs */
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const read=p=>fs.readFileSync(p,'utf8');
const html=read('index.html'),version=JSON.parse(read('version.json')),sw=read('sw.js');
const match=html.match(/name="fitnessdex-version"\s+content="([^"]+)"/);
assert(match,'HTML release version meta absent');
assert.equal(match[1],version.version,'HTML and version.json must match');
assert(html.includes('v'+version.version+'</title>'),'Document title must use same version');
assert(html.includes('>v'+version.version+'</span>'),'Header version must match');
const codeScripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(x=>x.trim());
assert(codeScripts.length>=2,'Expected exercise catalogue and app logic');
for(const source of codeScripts)new vm.Script(source);
const external=[...html.matchAll(/<script[^>]*src="\.\/([^"]+\.js)"/g)].map(m=>m[1]);
assert(external.length>5,'External app scripts missing');
const cacheMatch=sw.match(/const CACHE='(fitnessdex-shell-v\d+)'/);
assert(cacheMatch,'Service worker cache ID missing');
const cacheFiles=[...sw.matchAll(/'\.\/([^']+)'/g)].map(m=>m[1]);
for(const path of ['index.html','ui.css','version.json',...external]){
 assert(fs.existsSync(path),'Missing release asset: '+path);
 assert(cacheFiles.includes(path),'Missing from offline cache: '+path);
}
for(const file of external){new vm.Script(read(file),{filename:file});}
assert(external.includes('notifications.js'),'Foreground notification UI module missing');
assert(sw.includes("self.addEventListener('notificationclick'"),'Notifications must navigate correctly when tapped');
new vm.Script(sw,{filename:'sw.js'});

function boot(initial){
 const keys=new Map();
 if(initial)keys.set('fitnessdex-v01',JSON.stringify(initial));
 let failWrites=false;
 const storage={
  getItem:key=>keys.get(key)??null,
  setItem:(key,val)=>{if(failWrites&&key==='fitnessdex-v01')throw new Error('Simulated device quota error');keys.set(key,String(val));},
  removeItem:key=>keys.delete(key)
 };
 function node(){return {value:'',innerHTML:'',style:{},dataset:{},classList:{toggle(){}},addEventListener(){},focus(){},setAttribute(){},textContent:''};}
 const nodes=new Map(),nav=['home','log','dex','more'].map(tab=>({dataset:{tab},classList:{toggle(){}},addEventListener(){}}));
 const doc={
  body:{dataset:{}},getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},
  querySelectorAll(query){
   if(query==='.nav button')return nav;
   if(query==='#setrows .setrow')return [{querySelector(k){return {value:k==='.reps'?'8':''};}}];
   return [];
  }
 };
 const emitted=[],alerts=[];
 const window={scrollTo(){},dispatchEvent(e){emitted.push(e.type)}};
 const fn=new Function('window','document','localStorage','Event','alert','confirm','console',
  codeScripts[0]+'\n'+codeScripts[1]+
  '\nreturn {state:()=>S,save,submitLog,deleteLog,checkpoint,recoveryRows,restoreCheckpoint,validBackup,editLog,today,localTime};');
 const app=fn(window,doc,storage,function Event(type){this.type=type;},m=>alerts.push(m),()=>true,console);
 const now=new Date();
 for(const [id,val] of [['date',app.today()],['clock',app.localTime(now)],['notes',''],['session','standalone']])doc.getElementById(id).value=val;
 return {app,doc,keys,alerts,emitted,setFail:v=>{failWrites=v;}};
}
function sample(){
 const now=new Date(),date=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
 return {logs:[{at:'old-workout-1',id:'e004',mode:'bodysets',date,performedAt:new Date().toISOString(),sets:[{reps:6}],notes:'original',sessionId:null}],
 claimed:[],assign:{},tally:{},v3:{active:[],completed:[],nextSerial:0},v4:{hunts:[],lastResult:null},v5:{workouts:[],dismissed:[]},v6:{baselineWeek:{alcohol:null,smoking:null,takeaway:null},days:[],awards:[]}};
}
const b=boot(sample());
assert.equal(b.app.state().logs.length,1,'Existing records did not load');
assert(b.app.validBackup(b.app.state()),'Existing profile failed validation');
const before=JSON.stringify(b.app.state());
b.setFail(true);b.app.submitLog();
assert.equal(JSON.stringify(b.app.state()),before,'Failed save must roll back in-memory changes');
assert.equal(b.app.state().logs.length,1,'Failed save fabricated an activity');
assert(b.alerts.length>0,'Failed save must visibly report an error');
b.setFail(false);b.app.submitLog();
assert.equal(b.app.state().logs.length,2,'Successful save failed to add a real exercise record');
assert(b.keys.has('fitnessdex-v01'),'Record not persisted to device');
assert(b.emitted.includes('fitnessdex:saved'),'Successful save must dispatch sync event');
const added=b.app.state().logs.find(l=>l.at!=='old-workout-1');
const beforeDelete=JSON.stringify(b.app.state());
b.setFail(true);b.app.deleteLog(added.at);
assert.equal(JSON.stringify(b.app.state()),beforeDelete,'Failed delete must roll back');
b.setFail(false);b.app.deleteLog(added.at);
assert.equal(b.app.state().logs.length,1,'Successful delete failed');
assert(b.app.recoveryRows().length>0,'Pre-change recovery snapshot missing');
b.app.restoreCheckpoint(0);
assert.equal(b.app.state().logs.length,2,'Recovery checkpoint failed to restore deleted record');
assert(b.app.validBackup(b.app.state()),'Recovery restored invalid data');

const empty=boot(null);
assert.equal(empty.app.state().logs.length,0,'Existing empty profile broken');
assert(empty.app.validBackup(empty.app.state()),'Old profile backward compatibility broken');
console.log('FitnessDex smoke checks passed: version, PWA assets, JS syntax, old saves, failed/successful activity saves, deletion rollback, recovery.');


/* 0.8.2: exercise-copy, quick draft, undo and old-history regression. */
function bootConvenience(){
 const now=new Date(),date=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
 const entries=Array.from({length:210},(_,i)=>({at:'older-walk-'+i,id:'e045',mode:'distance',date,performedAt:new Date(Date.now()-(i+60)*60000).toISOString(),value:0.5,notes:'older walking record '+i}));
 entries.push({at:'recent-pushups',id:'e004',mode:'bodysets',date,performedAt:new Date(Date.now()-15000).toISOString(),sets:[{reps:7},{reps:6}],notes:'unique newest push-ups'});
 const seed={...sample(),logs:entries};
 const keys=new Map([['fitnessdex-v01',JSON.stringify(seed)]]),nodes=new Map();
 const fakeNode=id=>({id,value:'',checked:true,innerHTML:'',textContent:'',dataset:{},style:{},classList:{toggle(){},add(){},remove(){}},parentNode:{insertBefore(){}},addEventListener(){},appendChild(){},focus(){},setSelectionRange(){},scrollIntoView(){},closest(){return true},setAttribute(){},options:[]});
 const appNode=fakeNode('app'),buttons=['home','log','dex','more'].map(tab=>({...fakeNode(tab),dataset:{tab}}));
 const doc={
  body:{dataset:{}},head:{appendChild(){}},hidden:false,handlers:{},
  getElementById(id){if(id==='app')return appNode;if(!nodes.has(id))nodes.set(id,fakeNode(id));return nodes.get(id)},
  querySelectorAll(query){
   if(query==='.nav button')return buttons;
   if(query==='#setrows .setrow')return [7,7].map(reps=>({querySelector(sel){return {value:sel==='.reps'?String(reps):''}}}));
   return [];
  },
  querySelector(sel){if(sel==='main .nav')return fakeNode('nav');if(sel==='.nav [data-tab="more"]')return buttons[3];return null},
  addEventListener(name,handler){this.handlers[name]=handler},createElement(tag){return fakeNode(tag)}
 };
 const localStorage={getItem:k=>keys.get(k)??null,setItem:(k,v)=>keys.set(k,String(v)),removeItem:k=>keys.delete(k)};
 const win={handlers:{},addEventListener(k,cb){this.handlers[k]=cb},scrollTo(){},dispatchEvent(){}};
 const modules=['workouts.js','habits.js','log-flow.js','ui-shell.js','campaigns.js','progression.js','set-ui.js','daily-care.js','quick-tools.js'];
 const code='const queueMicrotask=fn=>{};\n'+codeScripts[0]+'\n'+codeScripts[1]+'\n'+modules.map(read).join('\n')+
  '\nreturn {state:()=>S,tab:()=>tab,history,submitLog,validBackup};';
 const app=new Function('window','document','localStorage','alert','confirm','Event','console',code)(win,doc,localStorage,
  msg=>{throw Error('Unexpected alert: '+msg)},()=>true,function Event(type){this.type=type},console);
 return {app,win,doc,keys,date};
}
const convenience=bootConvenience(),cv=convenience,cvApp=cv.app,cvWin=cv.win;
assert.equal(cvApp.state().logs.length,211,'Existing activity records lost on boot');
assert(cv.doc.getElementById('app').innerHTML.includes('Repeat last activity'),'Recent exercise shortcut missing');
cvWin.fdRepeatLast();
assert(cv.doc.getElementById('setrows').innerHTML.includes('value="7"'),'Last reps not prefilled');
assert(cv.doc.getElementById('setrows').innerHTML.includes('value="6"'),'Second previous set missing');
assert.equal(cvApp.state().logs.length,211,'Repeating last must not auto-save a second activity');
cvWin.fdHistoryQuery='older walking record 209';
assert(cvApp.history().includes('older walking record 209'),'Searching whole History (beyond latest 200) failed');
cvWin.fdHistoryQuery='';
const doneAt=new Date(Date.now()-120000),doneDay=[doneAt.getFullYear(),String(doneAt.getMonth()+1).padStart(2,'0'),String(doneAt.getDate()).padStart(2,'0')].join('-'),doneClock=[String(doneAt.getHours()).padStart(2,'0'),String(doneAt.getMinutes()).padStart(2,'0')].join(':');
for(const [id,value] of Object.entries({date:doneDay,clock:doneClock,notes:'Unfinished and recoverable',session:'standalone'}))
 cv.doc.getElementById(id).value=value;
cv.doc.handlers.input({target:{closest(){return true}}});
assert(cv.keys.has('fitnessdex-quick-log-draft-v1'),'Ordinary quick-log draft not captured');
cvWin.fdResumeQuickDraft();
assert.equal(cv.doc.getElementById('notes').value,'Unfinished and recoverable','Draft contents not restored');
cvApp.submitLog();
assert.equal(cvApp.state().logs.length,212,'Completing draft did not produce a saved log');
assert(!cv.keys.has('fitnessdex-quick-log-draft-v1'),'Successfully saved draft was not cleared');
const loggedId=cvApp.state().v4.lastResult?.logId;
assert(loggedId&&cvApp.state().logs.some(l=>l.at===loggedId),'Saved exercise result missing');
cvWin.fdUndoLastLog();
assert(!cvApp.state().logs.some(l=>l.at===loggedId),'Undo failed to remove the latest saved log');
assert.equal(cvApp.state().logs.length,211,'Undo must preserve earlier exercises');
assert(cvApp.validBackup(cvApp.state()),'Undo produced an invalid backup');
console.log('Convenience smoke checks passed: repeat, draft, full-history search, save and undo.');


/* v0.8.5: the browser notification prompt must be user-initiated. */
function verifyReminders(){
 const browserStorage=new Map(),shown=[],messages=[];
 let permissionRequests=0,intervals=0;
 const FakeNotification={permission:'default',requestPermission:()=>{permissionRequests++;FakeNotification.permission='granted';return Promise.resolve('granted');}};
 const fakeWindow={isSecureContext:true,addEventListener(){}};
 const fakeDocument={getElementById(id){return {id,innerHTML:'',value:'10:00',checked:true}},querySelectorAll(){return []},addEventListener(){},body:{dataset:{}}};
 const fakeNavigator={serviceWorker:{getRegistration:async()=>({active:{},showNotification:async(title,options)=>{shown.push({title,options})}}),addEventListener(){}}};
 const storage={getItem:k=>browserStorage.get(k)??null,setItem:(k,v)=>browserStorage.set(k,v),removeItem:k=>browserStorage.delete(k)};
 const module=new Function('window','document','navigator','localStorage','Notification','setInterval','location','today','S','render','tab','navigate','toast',
  read('notifications.js')+'\nreturn window;');
 const result=module(fakeWindow,fakeDocument,fakeNavigator,storage,FakeNotification,()=>{intervals++},{search:''},
  ()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');},
  {v9:{water:{baseGoal:2000,goals:[],entries:[]},supplements:{items:[],taken:[]}}},()=>{},'home',()=>{},s=>messages.push(s));
 assert.equal(permissionRequests,0,'App must never ask for notification permission on boot');
 assert.equal(result.fdReminderStatus().config.enabled,false,'Reminders must default to off');
 assert.equal(intervals,1,'Reminder scheduler not registered');
 return (async()=>{
  await result.fdReminderEnable();
  assert.equal(permissionRequests,1,'Enabling must request notification permission once');
  assert.equal(result.fdReminderStatus().config.enabled,true,'Enabled reminder preference missing');
  await result.fdReminderTest();
  assert.equal(shown.length,1,'Test notification not delivered through service worker');
  assert.equal(shown[0].options.data.section,'water','Test action must route to Daily Care');
  result.fdReminderDisable();
  assert.equal(result.fdReminderStatus().config.enabled,false,'Disabling failed to persist');
  console.log('Reminder regression checks passed: opt-in permission, system delivery, opt-out.');
 })();
}
verifyReminders().catch(e=>{console.error(e);process.exitCode=1;});
