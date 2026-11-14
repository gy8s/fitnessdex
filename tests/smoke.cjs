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
