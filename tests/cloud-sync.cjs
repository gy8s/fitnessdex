'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function deferred() {
  let resolve;
  const promise = new Promise(settle => { resolve = settle; });
  return { promise, resolve };
}

function fixture() {
  const profile = { logs:[{ id:'first-workout' }] };
  const storage = new Map();
  const requests = [];
  const timers = new Map();
  const handlers = new Map();
  const status = [], exports = [];
  let exportSucceeds = true;
  let timerId = 0;
  let authChanged;

  function request(operation, account, data) {
    const pending = deferred();
    requests.push({ operation, account, data, resolve:pending.resolve });
    return pending.promise;
  }

  const client = {
    auth:{ onAuthStateChange:handler => { authChanged = handler; } },
    from(table) {
      assert.equal(table, 'fitnessdex_saves');
      return {
        select() {
          return { eq(column,account) {
            assert.equal(column,'user_id');
            return { maybeSingle:() => request('read',account) };
          } };
        },
        update(data) {
          return { eq(column,account) {
            assert.equal(column,'user_id');
            return { eq(match,stamp) {
              assert.equal(match,'updated_at');
              assert(stamp);
              return { select:() => request('update',account,data) };
            } };
          } };
        },
        insert(data) {
          return { select:() => request('insert',data.user_id,data) };
        }
      };
    }
  };

  function element() {
    const children = new Map();
    return { style:{}, querySelector(selector) {
      if (!children.has(selector)) children.set(selector, element());
      return children.get(selector);
    } };
  }

  const section=element();
  vm.runInNewContext(fs.readFileSync('cloud.js','utf8'), {
    document:{
      querySelector:() => section, createElement:() => section,
      getElementById:() => ({ insertAdjacentElement() {} })
    },
    window:{
      supabase:{ createClient:() => client },
      fdSyncStatus:message => status.push(message),
      addEventListener:(name,handler) => handlers.set(name,handler)
    },
    navigator:{ onLine:true },
    localStorage:{
      getItem:key => storage.get(key) ?? null,
      setItem:(key,value) => storage.set(key,value)
    },
    validBackup:data => !!data&&!data.broken,
    backupProblem:()=>'Saved workout is incomplete.',
    exportBlob:async(content,name)=>{
      exports.push({content,name});
      return exportSucceeds;
    },
    today:()=> '2026-11-18',
    confirm:()=>true,
    S:profile,
    setTimeout:callback => {
      timers.set(++timerId, callback);
      return timerId;
    },
    clearTimeout:id => timers.delete(id)
  }, { filename:'cloud.js' });

  const flush = () => new Promise(resolve => setImmediate(resolve));
  return {
    profile,
    status:() => status.at(-1),
    marker:account => storage.get('fitnessdex-cloud-sync-' + account),
    switchAccount(account) {
      authChanged(account ? 'SIGNED_IN' : 'SIGNED_OUT',
        account ? {user:{id:account,email:account+'@example.test'}} : null);
    },
    saveLocally:() => handlers.get('fitnessdex:saved')(),
    reconnect:() => handlers.get('online')(),
    syncNow:() => section.querySelector('#fd-sync').onclick(),
    choose:button => section.querySelector('#fd-extra').querySelector(button).onclick?.(),
    canReplace:() => section.querySelector('#fd-extra').innerHTML.includes('id="fd-device"'),
    setExportResult:result => { exportSucceeds=result; },
    exports,
    async nextTimer() {
      const entry = timers.entries().next();
      if (entry.done) return;
      const [id, callback] = entry.value;
      timers.delete(id);
      callback();
      await flush();
    },
    take(operation, account) {
      const next = requests.shift();
      assert.equal(next?.operation,operation);
      assert.equal(next?.account,account);
      return next;
    },
    flush
  };
}

const stamp = '2026-11-18T08:00:00Z';
const row = profile => ({data:{save_data:structuredClone(profile), updated_at:stamp}});

async function switchDuringUpload() {
  const test = fixture();
  test.switchAccount('first');
  await test.nextTimer();
  test.take('read','first').resolve(row(test.profile));
  await test.flush();
  assert.match(test.status(),/Cloud save up to date/);

  test.profile.logs.push({id:'second-workout'});
  test.saveLocally();
  await test.nextTimer();
  const oldWrite = test.take('update','first');

  test.switchAccount('second');
  await test.nextTimer();
  const secondRead = test.take('read','second');
  const checking = test.status();
  oldWrite.resolve({data:[{updated_at:stamp}]});
  await test.flush();
  assert.equal(test.status(),checking,'An old backup must not change the new account status');
  assert.equal(test.marker('second'),undefined,'An old backup must not update the new account marker');

  secondRead.resolve({data:null});
  await test.flush();
  await test.nextTimer();
  const newWrite = test.take('insert','second');
  assert.equal(newWrite.data.save_data.logs.length,2);
  newWrite.resolve({data:[{updated_at:stamp}]});
  await test.flush();
  assert.match(test.status(),/Saved to cloud/);
  assert(test.marker('second'));
}

async function ignoreOldReadFailure() {
  const test = fixture();
  test.switchAccount('first');
  await test.nextTimer();
  const oldRead = test.take('read','first');
  test.switchAccount(null);
  test.switchAccount('first');
  await test.nextTimer();
  await test.nextTimer();
  const newRead = test.take('read','first');

  oldRead.resolve({error:new Error('Old request failed')});
  await test.flush();
  assert.match(test.status(),/Checking your cloud progress/);
  newRead.resolve(row(test.profile));
  await test.flush();
  assert.match(test.status(),/Cloud save up to date/);
}

async function retryFirstRead(){
  const test=fixture();
  test.switchAccount('first');
  await test.nextTimer();
  test.take('read','first').resolve({error:new Error('Offline')});
  await test.flush();
  assert.match(test.status(),/Cloud unavailable/);

  test.reconnect();
  await test.nextTimer();
  test.take('read','first').resolve({error:new Error('Still offline')});
  await test.flush();

  test.syncNow();
  test.syncNow();
  await test.nextTimer();
  test.take('read','first').resolve(row({logs:[{id:'other-device'}]}));
  await test.flush();
  assert.match(test.status(),/Choose which to keep/,'Retry must still ask about different progress');
  assert.equal(test.profile.logs[0].id,'first-workout');
  test.syncNow();
  assert.match(test.status(),/Choose which to keep/,'Manual sync must respect a pending conflict');
}

async function recoverCloudConflict(){
  const test=fixture();
  const invalid={logs:[{id:'remote-only'}],broken:true};
  test.switchAccount('first');await test.nextTimer();
  test.take('read','first').resolve(row(invalid));
  await test.flush();
  assert.match(test.status(),/needs recovery/);
  assert.equal(test.canReplace(),false);
  test.setExportResult(false);
  await test.choose('#fd-copy-cloud');
  assert.equal(test.canReplace(),false,'Cancelling the export must leave the backup protected');
  test.setExportResult(true);
  await test.choose('#fd-copy-cloud');
  assert.equal(test.canReplace(),true);
  assert.deepEqual(JSON.parse(test.exports.at(-1).content),invalid);
  test.choose('#fd-device');await test.nextTimer();
  const guarded=test.take('update','first');
  assert.equal(guarded.data.save_data.logs[0].id,'first-workout');
  guarded.resolve({data:[]});
  await test.flush();
  // A concurrent write means the other device's newer backup must be checked.
  test.take('read','first').resolve(row({logs:[{id:'concurrent-write'}]}));
  await test.flush();
  assert.match(test.status(),/Cloud changed elsewhere/);
  test.choose('#fd-later');
  test.syncNow();await test.nextTimer();
  test.take('read','first').resolve(row({logs:[{id:'concurrent-write'}]}));
  await test.flush();
  assert.match(test.status(),/Choose which to keep/);
  assert.equal(test.profile.logs[0].id,'first-workout');
}

async function firstInsertSeesOtherDevice(){
  const test=fixture();
  test.switchAccount('first');await test.nextTimer();
  test.take('read','first').resolve({data:null});
  await test.flush();await test.nextTimer();
  test.take('insert','first').resolve({error:{code:'23505'}});
  await test.flush();
  test.take('read','first').resolve(row({logs:[{id:'first-remote-write'}]}));
  await test.flush();
  assert.match(test.status(),/Cloud changed elsewhere/);
}
async function recoverLostAcknowledgement(anotherDevice=false) {
  const test=fixture();
  test.switchAccount('first');await test.nextTimer();
  test.take('read','first').resolve(row(test.profile));
  await test.flush();

  test.profile.logs.push({id:'second-workout',notes:'saved before losing the reply'});
  test.saveLocally();await test.nextTimer();
  const previous=test.take('update','first');
  previous.resolve({error:new Error('Response lost')});
  await test.flush();
  assert.match(test.status(),/Cloud save pending/);

  test.profile.logs.push({id:'third-workout'});
  test.saveLocally();await test.nextTimer();
  const cloudCopy=structuredClone(previous.data.save_data);
  // JSONB can reorder object keys, and timestamps may use an equivalent offset.
  cloudCopy.logs[1]={notes:cloudCopy.logs[1].notes,id:anotherDevice?'other-device':'second-workout'};
  test.take('read','first').resolve({data:{
    save_data:cloudCopy,updated_at:previous.data.updated_at.replace('Z','+00:00')
  }});
  await test.flush();
  if(anotherDevice){
    assert.match(test.status(),/Cloud changed elsewhere/);
    assert.equal(test.profile.logs.length,3);
    return;
  }
  const retry=test.take('update','first');
  assert.equal(retry.data.save_data.logs.length,3);
  retry.resolve({data:[{updated_at:retry.data.updated_at}]});
  await test.flush();
  assert.match(test.status(),/Saved to cloud/);
}
switchDuringUpload().then(ignoreOldReadFailure).then(retryFirstRead).then(recoverCloudConflict)
 .then(firstInsertSeesOtherDevice).then(()=>recoverLostAcknowledgement()).then(()=>recoverLostAcknowledgement(true)).then(() => {
  console.log('Cloud backup checks passed: account switching, reconnect, backup recovery, concurrent writes and lost upload replies.');
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
