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
  const window = { Capacitor: { Plugins: { Steps: { status: async () => ({ ...snapshot }) } } } };
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

  const total = {}, reopen = {};
  recorder.fdCardioHome(snapshot, total, reopen);
  assert.equal(total.textContent, '240 in sessions · 170 other steps');
  logs.push({ at: session.id, cardioSteps: { total: session.total, today: session.today, day: session.day, source: session.source } });
  recorder.fdCardioHome(snapshot, total, reopen);
  assert.equal(total.textContent, '240 in sessions · 170 other steps');
  assert.equal(reopen.hidden, true);
  assert.equal(draft.size, 0);

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
test().catch(error => { console.error(error); process.exitCode = 1; });
