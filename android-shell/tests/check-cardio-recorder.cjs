'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '../src/native-cardio.js'), 'utf8');
const draft = new Map();
const fields = new Map();
const logs = [];
let now = Date.parse('2026-11-17T22:00:00Z');
const snapshot = {
  enabled: true, available: true, running: true, source: 'test-device',
  tracked: 100, today: 100, day: '2026-11-17'
};

function field(id) {
  if (!fields.has(id)) fields.set(id, { value: '', isConnected: true, querySelectorAll: () => [] });
  return fields.get(id);
}

function boot() {
  const events = new Map();
  const window = {
    Capacitor: { Plugins: { Steps: { status: async () => ({ ...snapshot }) } } },
    addEventListener: (name, run) => events.set(name, run),
    recordSaved: () => events.get('fitnessdex:saved')()
  };
  class TestDate extends Date { static now() { return now; } }
  vm.runInNewContext(script, {
    window, Date: TestDate, document: { addEventListener() {} }, setInterval() {},
    localStorage: { getItem: k => draft.get(k) ?? null, setItem: (k, v) => draft.set(k, v), removeItem: k => draft.delete(k) },
    $: field, chosen: 'e045', S: { logs }, isFootCardio: id => ['e045', 'e046', 'e047', 'e149'].includes(id),
    uid: () => 'test-session', stamp: d => d.toISOString().slice(0, 10), localTime: d => d.toISOString().slice(11, 16),
    toast: message => { throw Error(message); }
  });
  return window;
}

async function test() {
  let recorder = boot();
  const walk = { id: 'e045' };
  assert.match(recorder.fdCardioRecorder(walk), /Start timer/);
  await recorder.fdCardioAction('start');
  now += 120000;
  snapshot.tracked += 160;
  snapshot.today += 160;
  recorder = boot(); // The WebView can be destroyed while the timer is running.
  assert.match(recorder.fdCardioRecorder(walk), /02:00/);
  await recorder.fdCardioAction('pause');
  now += 60000;
  snapshot.tracked += 70;
  snapshot.today += 70;
  await recorder.fdCardioAction('resume');
  now += 60000;
  snapshot.tracked += 80;
  snapshot.today += 80;
  await recorder.fdCardioAction('finish');
  const session = recorder.fdCardioForSave(walk);
  assert.equal(session.total, 240);
  assert.equal(session.elapsedMs, 180000);
  assert.equal(field('extra').value, '3');

  const reopen = {};
  let historyScans = 0;
  logs.reduce = function (...args) {
    historyScans++;
    return Array.prototype.reduce.apply(this, args);
  };
  assert.equal(recorder.fdCardioHome(snapshot,reopen,false),'');
  assert.equal(historyScans,0);
  assert.equal(recorder.fdCardioHome(snapshot,reopen,true),'240 in sessions · 170 other steps');
  assert.equal(recorder.fdCardioHome(snapshot,reopen,true),'240 in sessions · 170 other steps');
  assert.equal(historyScans,1,'Repeated Home reads must reuse the previous saved steps total');
  logs.push({ at: session.id, cardioSteps: { total: session.total, today: session.today, day: session.day, source: session.source } });
  assert.equal(recorder.fdCardioHome(snapshot,reopen,true),'240 in sessions · 170 other steps');
  assert.equal(reopen.hidden, true);
  assert.equal(draft.size, 0);
  logs[0].cardioSteps.today = 200;
  recorder.recordSaved();
  assert.equal(recorder.fdCardioHome(snapshot,reopen,true),'200 in sessions · 210 other steps');

  await recorder.fdCardioAction('start');
  now = Date.parse('2026-11-18T00:01:00Z');
  snapshot.tracked += 60;
  snapshot.today = 20;
  snapshot.day = '2026-11-18';
  await recorder.fdCardioAction('finish');
  const midnight = recorder.fdCardioForSave(walk);
  assert.equal(midnight.total, 60);
  assert.equal(midnight.today, 20);
  assert.equal(midnight.day, '2026-11-18');
  assert.equal(recorder.fdCardioDiscard(walk.id), true);
  assert.equal(recorder.fdCardioForSave(walk), null);
  console.log('PASS: cardio timer recovery, pause/resume steps, midnight, and no double counting after save');
}
async function testHomeRefresh() {
  const source = fs.readFileSync(path.join(__dirname, '../src/native-steps.js'), 'utf8');
  const nodes = new Map();
  const reads = [];
  function node(key) {
    if (!nodes.has(key)) {
      let text = '';
      nodes.set(key,{
        open:false, hidden:false, writes:0,
        querySelector:node,
        addEventListener(name,run) { this[name] = run; },
        get textContent() { return text; },
        set textContent(value) { this.writes++;text = value; }
      });
    }
    return nodes.get(key);
  }
  node('.nav button.active').dataset = {tab:'home'};
  let refresh;
  const current = {...snapshot,today:200,running:true,enabled:true};
  vm.runInNewContext(source,{
    window:{
      Capacitor:{Plugins:{Steps:{
        status:() => new Promise(resolve => reads.push(resolve)),
        disable:async () => ({...current,today:205,running:false,enabled:false})
      }}},
      fdCardioHome:(_state,_resume,open) => open ? '50 in sessions · 150 other steps' : ''
    },
    document:{querySelector:node,addEventListener() {}},
    MutationObserver:class { observe() {} },
    setInterval:run => { refresh = run; }
  });
  async function finishRead(state) {
    reads.shift()(state);
    await new Promise(resolve => setImmediate(resolve));
  }

  refresh();
  assert.equal(reads.length,1,'Only one Home status check should be in flight');
  await finishRead(current);
  const output = node('output');
  const breakdown = node('#fd-step-breakdown');
  assert.equal(output.textContent,'200');
  assert.equal(breakdown.writes,0,'The closed breakdown should not be updated');
  refresh();
  await finishRead(current);
  assert.equal(output.writes,1,'The same step count should not be redrawn');

  const details = node('.fd-step-details');
  details.open = true;
  details.toggle();
  await finishRead(current);
  assert.match(breakdown.textContent,/50 in sessions/);
  refresh();
  await node('#fd-toggle-steps').click();
  await finishRead(current);
  assert.equal(output.textContent,'205','An earlier reading should not replace a newer toggle result');
  assert.equal(node('#fd-toggle-steps').textContent,'Enable steps');
  console.log('PASS: Home steps avoid repeat draws and ignore older readings after a toggle.');
}

test().then(testHomeRefresh).catch(error => { console.error(error); process.exitCode = 1; });
