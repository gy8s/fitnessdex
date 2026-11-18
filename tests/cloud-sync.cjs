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
  const status = [];
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
    validBackup:() => true,
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

  const remote = row(test.profile);
  test.profile.logs.push({id:'second-workout'});
  test.saveLocally();
  await test.nextTimer();
  test.take('read','first').resolve(remote);
  await test.flush();
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
  test.take('read','second').resolve({data:null});
  await test.flush();
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

switchDuringUpload().then(ignoreOldReadFailure).then(retryFirstRead).then(() => {
  console.log('Cloud backup checks passed: account switching, reconnect, manual retry, and conflict protection.');
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
