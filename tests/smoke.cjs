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
assert(external.includes('push-client.js'),'Background push registration module missing');
assert(sw.includes("self.addEventListener('push'"),'Background push delivery handler missing');
assert(read('push-client.js').includes('fdPushBackgroundTest'),'Queued server push test missing');
assert(sw.includes("self.addEventListener('notificationclick'"),'Notifications must navigate correctly when tapped');
new vm.Script(sw,{filename:'sw.js'});

function boot(initial,cardioForSave){
 const keys=new Map();
 if(initial)keys.set('fitnessdex-v01',JSON.stringify(initial));
 let failWrites=false, rejectProfileWrite=()=>false;
 const profileWrites=[];
 const storage={
  getItem:key=>keys.get(key)??null,
  setItem:(key,val)=>{
   if(key==='fitnessdex-v01'){
    const snapshot=JSON.parse(val);
    if(failWrites||rejectProfileWrite(snapshot))throw new Error('Simulated device quota error');
    profileWrites.push(snapshot);
   }
   keys.set(key,String(val));
  },
  removeItem:key=>keys.delete(key)
 };
 function node(){return {value:'',innerHTML:'',style:{},dataset:{},classList:{toggle(){}},addEventListener(){},focus(){},scrollIntoView(){},setAttribute(){},textContent:''};}
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
 const window={scrollTo(){},dispatchEvent(e){emitted.push(e.type)},fdCardioForSave:cardioForSave};
 const fn=new Function('window','document','localStorage','Event','alert','confirm','console',
  codeScripts[0]+'\n'+codeScripts[1]+
  '\nreturn {state:()=>S,save,choose,openDexFamily,openPathNode,submitLog,deleteLog,checkpoint,recoveryRows,restoreCheckpoint,validBackup,editLog,today,localTime};');
 const app=fn(window,doc,storage,function Event(type){this.type=type;},m=>alerts.push(m),()=>true,console);
 const now=new Date();
 for(const [id,val] of [['date',app.today()],['clock',app.localTime(now)],['notes',''],['session','standalone']])doc.getElementById(id).value=val;
 return {app,doc,keys,alerts,emitted,profileWrites,setFail:v=>{failWrites=v;},rejectWrite:fn=>{rejectProfileWrite=fn;}};
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

const challengeStart=new Date(Date.now()-2*60*60*1000).toISOString();
const challengeProfile=sample();
challengeProfile.logs=[];
challengeProfile.v3.active.push({
 cid:'save-regression',type:'weekly',kind:'reps',ex:'e004',goal:8,unit:'reps',label:'Save regression',
 periodKey:'weekly:save-regression',periodStart:challengeStart,issuedAt:challengeStart,
 periodEnd:new Date(Date.now()+24*60*60*1000).toISOString(),slot:0
});
const challenge=boot(challengeProfile);
const challengeActivity=new Date(Date.now()-60*1000);
const challengeDate=challengeActivity.getFullYear()+'-'+String(challengeActivity.getMonth()+1).padStart(2,'0')+'-'+String(challengeActivity.getDate()).padStart(2,'0');
challenge.doc.getElementById('date').value=challengeDate;
challenge.doc.getElementById('clock').value=challenge.app.localTime(challengeActivity);
const priorProfile=challenge.keys.get('fitnessdex-v01');
const priorState=JSON.stringify(challenge.app.state());
challenge.profileWrites.length=0;
challenge.emitted.length=0;
challenge.rejectWrite(snapshot=>Boolean(snapshot.v4.lastResult));
challenge.app.submitLog();
assert(challenge.alerts.length,'The failed workout save should be reported');
assert.equal(JSON.stringify(challenge.app.state()),priorState,'Failed challenge save should roll back the workout and reward');
assert.equal(challenge.keys.get('fitnessdex-v01'),priorProfile,'No intermediate workout or challenge reward should reach storage');
assert.equal(challenge.profileWrites.length,0,'A failed workout should commit no profile snapshots');
assert.deepEqual(challenge.emitted,[],'A failed workout should emit no cloud sync event');
challenge.rejectWrite(()=>false);
challenge.app.submitLog();
assert.equal(challenge.profileWrites.length,1,'One workout and its rewards should commit together');
assert.deepEqual(challenge.emitted,['fitnessdex:saved']);
const savedChallengeProfile=JSON.parse(challenge.keys.get('fitnessdex-v01'));
assert.equal(savedChallengeProfile.logs.length,1);
assert(savedChallengeProfile.v3.completed.some(c=>c.cid==='save-regression'&&c.rewardXP===85));
assert.equal(savedChallengeProfile.v4.lastResult.logId,savedChallengeProfile.logs[0].at);
assert(savedChallengeProfile.v4.lastResult.challengeNames.includes('Save regression'));
assert.equal(JSON.stringify(challenge.app.state()),JSON.stringify(savedChallengeProfile));
const reopenedChallenge=boot(savedChallengeProfile);
assert.equal(reopenedChallenge.app.state().logs.length,1);
assert(reopenedChallenge.app.state().v3.completed.some(c=>c.cid==='save-regression'));

const empty=boot(null);
assert.equal(empty.app.state().logs.length,0,'Existing empty profile broken');
assert(empty.app.validBackup(empty.app.state()),'Old profile backward compatibility broken');
const hike=boot(sample(),()=>({id:'tracked-hike',finished:true,total:240,today:240,day:today,source:'24189eb3-1363-4f80-9bed-ef37d7faa770'}));
const today=hike.app.today();
hike.app.choose('e149');
hike.doc.getElementById('value').value='1.4';
hike.doc.getElementById('extra').value='21';
hike.setFail(true);
hike.app.submitLog();
assert.equal(hike.app.state().logs.length,1,'A failed recorder save changed the history');
hike.setFail(false);
hike.app.submitLog();
const savedHike=hike.app.state().logs.find(l=>l.at==='tracked-hike');
assert.equal(savedHike.cardioSteps.total,240);
assert.equal(savedHike.minutes,21);
assert.equal(savedHike.value,1.4);
assert(hike.app.validBackup(hike.app.state()),'Saved hike failed the backup validator');
assert.match(hike.app.state().v4.lastResult.summary,/240 steps.*15:00\/km/);
const dexTree=boot(null);
dexTree.app.openDexFamily('Calisthenics','Push-ups');
const dexSource=dexTree.doc.getElementById('app').innerHTML;
assert.match(dexSource,/aria-label="Step 3">03/);
assert.match(dexSource,/data-skill="e004" data-stage="2" data-parents="e002 e003"/);
assert.match(dexSource,/Incline push-up or Knee push-up/);
dexTree.app.openPathNode('e004');
assert.match(dexTree.doc.getElementById('app').innerHTML,/Build your push-up · Step 3/);
dexTree.app.openDexFamily('Flexibility & mobility','General mobility');
const squatTree=dexTree.doc.getElementById('app').innerHTML;
assert.match(squatTree,/data-skill="e148" data-stage="1" data-parents="e147"/);
assert(squatTree.indexOf('Supported deep squat hold')<squatTree.indexOf('Unsupported deep squat hold'));


console.log('FitnessDex smoke checks passed: version, PWA assets, JS syntax, old saves, failed/successful activity saves, deletion rollback, recovery.');


/* 0.8.2: exercise-copy, quick draft, undo and old-history regression. */
function bootConvenience(extraLogs=[]){
 let elapsed=0;
 const now=new Date(),date=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
 const entries=Array.from({length:210},(_,i)=>({at:'older-walk-'+i,id:'e045',mode:'distance',date,performedAt:new Date(Date.now()-(i+60)*60000).toISOString(),value:0.5,notes:'older walking record '+i}));
 entries.push({at:'recent-pushups',id:'e004',mode:'bodysets',date,performedAt:new Date(Date.now()-15000).toISOString(),sets:[{reps:7},{reps:6}],notes:'unique newest push-ups'});
 const seed={...sample(),logs:[...entries,...extraLogs]};
 const keys=new Map([['fitnessdex-v01',JSON.stringify(seed)]]),nodes=new Map();
 const fakeNode=id=>({id,value:'',checked:true,innerHTML:'',textContent:'',dataset:{},style:{},classList:{toggle(){},add(){},remove(){}},parentNode:{insertBefore(){}},addEventListener(){},appendChild(){},dispatchEvent(event){doc.handlers[event.type]?.({target:this})},focus(){},setSelectionRange(){},scrollIntoView(){},closest(){return true},setAttribute(){},options:[]});
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
  '\nreturn {state:()=>S,tab:()=>tab,history,navigate,choose,submitLog,validBackup,prefillSets};';
 const app=new Function('window','document','localStorage','alert','confirm','Event','console','performance',code)(win,doc,localStorage,
  msg=>{throw Error('Unexpected alert: '+msg)},()=>true,function Event(type){this.type=type},console,{now:()=>elapsed});
 return {app,win,doc,keys,date,advance:ms=>{elapsed+=ms}};
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

const held=(id,value,age,side)=>{
 const performed=new Date(Date.now()-age*60000);
 return {at:id+'-'+age,id,mode:id==='e117'?'range':'time',value,side,performedAt:performed.toISOString(),
  date:[performed.getFullYear(),String(performed.getMonth()+1).padStart(2,'0'),String(performed.getDate()).padStart(2,'0')].join('-')};
};
const overview=bootConvenience([
 held('e036',28,2),held('e036',35,10),
 held('e084',18,2,'left'),held('e084',24,3,'left'),held('e084',45,4,'right'),
 held('e117',3,2),held('e117',-2,4),
 {...held('e025',null,2),mode:'sets',sets:[{weight:42.5,reps:5},{weight:40,reps:6}]},
 {...held('e025',null,10),mode:'sets',sets:[{weight:35,reps:5}]},
 {...held('e075',null,2,'left'),mode:'bodysets',sets:[{reps:4}]},
 {...held('e075',null,1,'right'),mode:'bodysets',sets:[{reps:9}]}
]);
const overviewPage=()=>overview.doc.getElementById('app').innerHTML;
const input=id=>overview.doc.getElementById(id);
const beforeCopy=overview.app.state().logs.length;
overview.app.choose('e036');
assert.match(overviewPage(),/Foundation<\/span><span>Step 2 of 2/);
assert.match(overviewPage(),/<dt>Last<\/dt><dd>28 s.*<dt>Best<\/dt><dd>35 s<\/dd>.*Copy 28 s/);
assert(overviewPage().indexOf('Save activity')<overviewPage().indexOf('How to do this exercise'));
overview.win.fdCopyLastHold();
assert.equal(input('value').value,'28');
assert.equal(JSON.parse(overview.keys.get('fitnessdex-quick-log-draft-v1')).fields.value,'28');
assert.equal(overview.app.state().logs.length,beforeCopy);
overview.app.choose('e084');
assert.match(overviewPage(),/View skill tree.*Front split preparation · Step 1 of 3.*Forward fold preparation · Step 1 of 2/);
assert.doesNotMatch(overviewPage(),/fd-copy-last-hold/);
input('side').value='left';
overview.win.fdRefreshLogComparison();
assert.match(input('fd-log-previous').innerHTML,/<dt>Last \(left\)<\/dt><dd>18 s.*<dt>Best<\/dt><dd>24 s<\/dd>/);
overview.win.fdCopyLastHold();
assert.equal(input('value').value,'18');
assert.equal(JSON.parse(overview.keys.get('fitnessdex-quick-log-draft-v1')).copiedSide,'left');
input('side').value='right';
overview.win.fdChangeLogSide();
assert.match(input('fd-log-previous').innerHTML,/<dt>Last \(right\)<\/dt><dd>45 s/);
assert.equal(input('value').value,'');
overview.win.fdCopyLastHold();
assert.equal(input('value').value,'45');
input('side').value='both';
overview.win.fdChangeLogSide();
assert.equal(input('fd-log-previous').innerHTML,'');
overview.win.fdCopyLastHold();
assert.equal(input('value').value,'','A side with no history must not retain another side’s copied result');
input('value').value='25';
overview.win.fdToggleHold();
assert.equal(input('side').disabled,true);
input('side').value='right';
overview.win.fdChangeLogSide();
assert.equal(input('side').value,'both');
overview.advance(150);
overview.win.fdToggleHold();
assert.equal(input('value').value,'25');
assert.equal(input('side').disabled,false);
overview.win.fdToggleHold();
overview.advance(1800);
overview.win.fdToggleHold();
assert.equal(input('value').value,'1');
input('side').value='right';
overview.win.fdChangeLogSide();
assert.equal(input('value').value,'');
overview.win.fdOpenLogSkillTree(0);
assert.equal(overview.app.tab(),'dex');
assert.match(overviewPage(),/Front splits.*Front split preparation/);
overview.app.choose('e117');
assert.match(overviewPage(),/<dt>Best<\/dt><dd>-2 cm gap<\/dd>/);
overview.app.choose('e004');
assert.match(overviewPage(),/Build your push-up · Step 3 of 5.*One-arm and leverage · Step 1 of 4/);
overview.win.fdQuickLog();
assert.match(overviewPage(),/<dt>Last<\/dt><dd>7 reps in one set.*Copy 2 sets/);
overview.app.prefillSets();
assert.match(input('setrows').innerHTML,/value="7".*value="6"/);
overview.app.choose('e025');
overview.win.fdQuickLog();
assert.match(overviewPage(),/<dt>Last<\/dt><dd>42\.5 kg × 5.*Copy 2 sets/);
assert.equal((overviewPage().match(/Copy 2 sets/g)||[]).length,1);
overview.app.prefillSets();
assert.match(input('setrows').innerHTML,/value="42\.5".*value="40"/);
overview.app.choose('e075');
overview.win.fdQuickLog();
assert.doesNotMatch(overviewPage(),/Copy \d+ sets?/);
input('side').value='left';
overview.win.fdRefreshLogComparison();
assert.match(input('fd-log-previous').innerHTML,/<dt>Last \(left\)<\/dt><dd>4 reps in one set.*Copy 1 set/);
overview.app.prefillSets();
assert.match(input('setrows').innerHTML,/value="4"/);
input('side').value='right';
overview.win.fdChangeLogSide();
assert.doesNotMatch(input('setrows').innerHTML,/value="4"/);
assert.equal(overview.app.state().logs.length,beforeCopy);
overview.app.choose('e085');
assert.doesNotMatch(overviewPage(),/fd-copy-last-hold/);
const historyMarkup=overview.app.history();
assert(historyMarkup.indexOf('fd-history-query')<historyMarkup.indexOf('fd-history-entries'));
assert(historyMarkup.indexOf('fd-history-entries')<historyMarkup.indexOf('id="fd-history-tools"'));
assert.match(historyMarkup,/<details id="fd-history-tools" class="fd-log-details fd-history-tools">/);
console.log('Exercise selection checks passed: skill paths, last and best, exact-side timed copies, and strength/bodyweight copies.');

function finishHold(seconds){
 overview.app.choose('e036');
 const now=new Date();
 const clock=[now.getHours(),now.getMinutes()].map(n=>String(n).padStart(2,'0')).join(':');
 for(const [id,value] of Object.entries({date:overview.date,clock,value:String(seconds),notes:'',session:'standalone'}))
  overview.doc.getElementById(id).value=value;
 overview.app.submitLog();
}
finishHold(35);
assert.match(overviewPage(),/\+7 s since last time/);
assert.doesNotMatch(overviewPage(),/New personal best/);
finishHold(42);
assert.match(overviewPage(),/\+7 s since last time/);
assert.match(overviewPage(),/New personal best/);
finishHold(42);
assert.match(overviewPage(),/Same as last time/);
assert.doesNotMatch(overviewPage(),/New personal best/);

const habitUI=bootConvenience();
const habitView=()=>habitUI.doc.getElementById('app').innerHTML;
const habits=habitUI.app.state().v6;
const habitDate=(offset)=>{
 const d=new Date(habitUI.date+'T12:00:00');
 d.setDate(d.getDate()+offset);
 return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
};
const habitRow=(category,date=habitUI.date)=>habitUI.app.state().v6.days.find(row=>row.category===category&&row.date===date);
const streak=(category,days)=>assert.match(habitView(),new RegExp('id="fd-habit-title-'+category+'">[^<]+</h2><span class="fd-habit-streak"><strong>'+days+'</strong>'));
for(const [category,days] of [['alcohol',6],['takeaway',29]]){
 for(let i=1;i<=days;i++)habits.days.push({category,date:habitDate(-i),quantity:0});
}
habits.days.push({category:'smoking',date:habitDate(-1),quantity:2});
habits.baselineWeek.smoking=12;
habits.awards.push({id:'smoking-streak-3',at:habitDate(-1)});
habitUI.app.navigate('more');
assert.match(habitView(),/<strong>Habits<\/strong>/);
habitUI.win.fdHabitsOpen();
assert.match(habitView(),/<h1>Habits<\/h1>.*Alcohol-free.*Smoke-free.*Takeaway-free/);
assert.equal((habitView().match(/class="fd-habit-day /g)||[]).length,21);
assert.match(habitView(),/Start a new chain today/);
assert.match(habitView(),/None today/);
streak('alcohol',6);
streak('takeaway',29);
habitUI.win.fdHabitsNoneToday();
for(const category of ['alcohol','smoking','takeaway'])assert.equal(habitRow(category).quantity,0);
assert.equal(habits.days.length,39,'Bulk check-in must add three records');
assert.match(habitView(),/7-day milestone.*30-day milestone/);
assert.match(habitView(),/7 alcohol-free days in the last 30/);
assert.equal(habits.awards.filter(a=>a.id==='alcohol-streak-7').length,1);
streak('alcohol',7);
streak('smoking',1);
streak('takeaway',30);
habitUI.win.fdHabitsNoneToday();
assert.equal(habits.days.length,39,'Repeated taps must not duplicate check-ins');
habitUI.win.fdHabitsAnswer('alcohol',true);
assert.deepEqual(habitRow('alcohol'),{category:'alcohol',date:habitUI.date,quantity:1,amountUnspecified:true});
streak('alcohol',0);
streak('takeaway',30);
assert.match(habitView(),/6 alcohol-free days in the last 30/);
assert.doesNotMatch(habitView(),/None today/);
habitUI.win.fdHabitsNoneToday();
assert.equal(habitRow('alcohol').quantity,1,'Bulk check-in must preserve an existing Yes');

habitUI.win.fdHabitsDateChange(habitDate(-1));
assert.match(habitView(),/Smoked\?<small>2 cigarettes/);
habitUI.win.fdHabitsAnswer('smoking',true);
assert.equal(habitRow('smoking',habitDate(-1)).quantity,2,'Existing exact quantities must be preserved');
habitUI.win.fdHabitsRemove('takeaway');
assert.equal(habitRow('takeaway',habitDate(-1)),undefined);
assert.match(habitView(),new RegExp('id="fd-habit-day-takeaway-'+habitDate(-1)+'" class="fd-habit-day unlogged"'));
streak('takeaway',1);
habitUI.win.fdHabitsAnswer('takeaway',false);
streak('takeaway',30);
assert.equal(habits.awards.filter(a=>a.id==='takeaway-streak-30').length,1);
habitUI.win.fdHabitsDateChange(habitDate(-12));
assert.match(habitView(),new RegExp('id="fd-habit-day-takeaway-'+habitDate(-12)+'"'));
assert.doesNotMatch(habitView(),/aria-current="date"/);
habitUI.win.fdHabitsDateChange(habitUI.date);
assert.match(habitView(),/aria-current="date"/);
assert.equal(habits.baselineWeek.smoking,12);
assert(habits.awards.some(a=>a.id==='smoking-streak-3'));
habitUI.win.fdHabitsBack();
assert.equal(habitUI.app.tab(),'more');
const savedHabits=JSON.parse(habitUI.keys.get('fitnessdex-v01'));
assert(habitUI.app.validBackup(savedHabits));
assert.equal(savedHabits.v6.days.find(row=>row.date===habitUI.date&&row.category==='alcohol').amountUnspecified,true);
console.log('Habits checks passed: three independent chains, quick check-in, corrections, milestones, and compatible history.');




/* v0.8.5: the browser notification prompt must be user-initiated. */
function verifyReminders(){
 const browserStorage=new Map(),shown=[],messages=[];
 let permissionRequests=0,intervals=0;
 const FakeNotification={permission:'default',requestPermission:()=>{permissionRequests++;FakeNotification.permission='granted';return Promise.resolve('granted');}};
 const fakeWindow={isSecureContext:true,Notification:FakeNotification,addEventListener(){}};
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

function checkCampaignReturns(){
 const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value));
 const validator=codeScripts[1].split('function validCampaignState(')[1].split('function validProgressionState(')[0];
 function fixture(){
  let day='2026-07-29',canSave=true;
  const date=()=>day,window={scrollTo(){}};
  const model={v7:{campaigns:[{id:'run5k',started:'2026-07-01',managed:true}]},logs:[]};
  const validate=new Function('validDate','today','return function validCampaignState('+validator)(validDate,date);
  const run=new Function('window','S','today','validDate','logWhen','logMetrics','n','ex','save','validCampaignState','confirm','navigate','render','toast','choose','tab',
   read('campaigns.js')+'\nreturn window;');
  run(window,model,date,validDate,log=>Date.parse(log.date),log=>({distance:log.value}),Number,id=>({name:id,mode:id==='e046'?'distance':'bodysets'}),()=>canSave,validate,()=>true,()=>{},()=>{},()=>{},()=>{},'campaigns');
  function log(date,id='e046'){
   model.logs.push({id,date,value:1});
  }
  for(const dates of [['01','03','05'],['08','10','12'],['15','17','19'],['22','24','26']]){
   dates.forEach(d=>log('2026-07-'+d));
   log('2026-07-'+dates[0],'e109');
  }
  window.fdCampaignOpen('run5k');
  const body=()=>window.fdCampaignsView();
  const act=name=>{
   window['fdCampaign'+name]('run5k');
   assert(validate(JSON.parse(JSON.stringify(model.v7))),name+' generated invalid campaign data');
  };
  return {model,log,body,act,setDay:d=>{day=d;},failSave:()=>{canSave=false;},validate};
 }

 const brief=fixture();
 assert.match(brief.body(),/4\/16/);
 brief.act('Pause');
 brief.setDay('2026-08-02');brief.act('Resume');
 assert.match(brief.body(),/This week/);
 assert.match(brief.body(),/5<\/strong><span>Current \/ final week/);
 assert.match(brief.body(),/1\/4<\/strong><span>Chapter medals/);
 assert.equal(brief.model.logs.length,16);

 const repeated=fixture();
 repeated.act('Pause');repeated.setDay('2026-08-05');
 assert.match(repeated.body(),/Repeat week 4/);
 repeated.act('Resume');
 assert.match(repeated.body(),/4<\/strong><span>Current \/ final week/);
 repeated.log('2026-08-05');repeated.log('2026-08-05','e109');repeated.log('2026-08-07');repeated.log('2026-08-09');
 repeated.setDay('2026-08-09');
 assert.match(repeated.body(),/4\/16/,'Repeating an earned week must not credit it twice');

 const deload=fixture();
 deload.act('Pause');deload.setDay('2026-08-12');deload.act('Resume');
 assert.match(deload.body(),/Return week/);
 deload.setDay('2026-08-19');
 assert.match(deload.body(),/This week/);
 assert.match(deload.body(),/4<\/strong><span>Current \/ final week/);

 const baseline=fixture();
 baseline.act('Pause');baseline.setDay('2026-08-26');baseline.act('Resume');
 assert.match(baseline.body(),/Log baseline/);
 baseline.act('BaselineDone');
 assert.match(baseline.body(),/Log baseline/,'A baseline must have a real session');
 baseline.log('2026-08-26');
 assert.match(baseline.body(),/Begin return week/);
 baseline.act('BaselineDone');assert.match(baseline.body(),/Return week/);

 const missed=fixture();
 missed.setDay('2026-08-03');missed.log('2026-08-03');
 assert.match(missed.body(),/Return needed/,'Logging again cannot silently skip a full missed training week');

 const planned=fixture();
 planned.act('Recovery');planned.setDay('2026-08-04');
 assert.match(planned.body(),/Recovery week/);
 planned.setDay('2026-08-05');
 assert.match(planned.body(),/5<\/strong><span>Current \/ final week/);
 assert.match(planned.body(),/This week/);
 assert.match(planned.body(),/4\/16/);

 const ended=fixture();
 ended.act('End');assert.match(ended.body(),/>Ended<\/h2>/);
 ended.act('Restart');assert.match(ended.body(),/Restart scheduled/);
 ended.setDay('2026-07-30');
 assert.match(ended.body(),/0\/16/);
 assert.match(ended.body(),/4 qualifying weeks in earlier attempts/);
 assert.match(ended.body(),/1\/4<\/strong><span>Chapter medals/);

 const legacy=fixture();
 assert(legacy.validate({campaigns:[{id:'run5k',started:'2026-07-01'}]}));
 assert(!legacy.validate({campaigns:[{id:'run5k',started:'2026-07-01',breaks:[{from:'2026-07-29',resumed:'2026-07-28'}]}]}));
 legacy.failSave();legacy.act('Pause');
 assert.equal(legacy.model.v7.campaigns[0].breaks,undefined,'Failed storage write must restore campaign state');
 console.log('Campaign checks passed: short pauses, repeats, deloads, baseline, recovery, restart and compatible saves.');
}
checkCampaignReturns();
require('./cloud-sync.cjs');
