'use strict';
// Only checks an Android emulator's debug WebView. No production user data.
const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');
const stage = process.argv[2];
if (!['first','after-restart','navigation','activity-save','activity-reopen','activity-edit','activity-edit-reopen','activity-delete','activity-delete-reopen','activity-restore','activity-restore-reopen','backup-export'].includes(stage)) throw Error('Specify a supported Android test stage');
const address = 'http://127.0.0.1:9222';
const probeKey = 'fitnessdex-stage2-ci-restart-check';

async function findTarget() {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch(address + '/json');
      if (!response.ok) throw Error('DevTools HTTP ' + response.status);
      const targets = await response.json();
      const found = targets.find(x => x.type === 'page' &&
        x.url.startsWith('https://localhost/') && x.webSocketDebuggerUrl);
      if (found) return found;
    } catch (err) { /* Android WebView might still be starting. */ }
    await delay(600);
  }
  throw Error('Could not inspect the FitnessDex local WebView. A running process is not adequate evidence.');
}

async function inspect(target, expression) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  await Promise.race([opened, delay(10000).then(() => { throw Error('WebView debugger timed out'); })]);
  try {
    const response = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('WebView evaluate timed out')), 10000);
      socket.addEventListener('message', event => {
        const msg = JSON.parse(event.data);
        if (msg.id !== 1) return;
        clearTimeout(timeout);
        if (msg.error || msg.result?.exceptionDetails) return reject(Error(JSON.stringify(msg.error || msg.result.exceptionDetails)));
        resolve(msg.result?.result?.value);
      });
    });
    socket.send(JSON.stringify({ id:1, method:'Runtime.evaluate',
      params:{expression,returnByValue:true,awaitPromise:true} }));
    return await response;
  } finally { socket.close(); }
}

(async () => {
  if (stage === 'navigation') {
    // Read-only interaction test: clicks the real four tab buttons in disposable emulator storage.
    const expected = [['log','What did you do?'],['dex','ExerciseDex'],['more','More'],['home','Make today count.']];
    const countExpr = "(() => { const s = JSON.parse(localStorage.getItem('fitnessdex-v01') || '{}'); return Array.isArray(s.logs) ? s.logs.length : 0; })()";
    const beforeCount = await inspect(await findTarget(), countExpr);
    for (const [targetTab, label] of expected) {
      const clickCode = `(() => { const b = document.querySelector('nav.nav button[data-tab="${targetTab}"]'); if(!b) return false; b.click(); return true; })()`;
      assert.equal(await inspect(await findTarget(), clickCode), true, 'Missing main tab button: ' + targetTab);
      const snapshot = "JSON.stringify({tab:document.body.dataset.fdTab,active:document.querySelector('nav.nav button.active')?.dataset.tab,heading:document.querySelector('#app h1')?.textContent?.trim() || '',characters:document.querySelector('#app')?.textContent?.trim().length || 0})";
      let info;
      for (let attempt = 0; attempt < 10; attempt++) {
        info = JSON.parse(await inspect(await findTarget(), snapshot));
        if (info.tab === targetTab && info.active === targetTab && info.heading.includes(label) && info.characters > 50) break;
        await delay(300);
      }
      console.log('Navigation:', targetTab, JSON.stringify(info));
      assert.equal(info.tab, targetTab, 'Wrong page opened');
      assert.equal(info.active, targetTab, 'Wrong navigation item highlighted');
      assert(info.heading.includes(label), 'Missing ' + targetTab + ' heading');
      assert(info.characters > 50, 'Empty or incomplete ' + targetTab + ' screen');
    }
    const afterCount = await inspect(await findTarget(), countExpr);
    assert.equal(afterCount, beforeCount, 'Navigating must not change workout records');
    console.log('PASS: Android Home, Log, ExerciseDex and More navigation, with records unchanged');
    return;
  }
  if (stage === 'activity-save') {
    // This test writes ONE fake walking record to an isolated, disposable emulator.
    // It must refuse to run if there are any existing activity records.
    const expression = String.raw`JSON.stringify((() => {
      const key = 'fitnessdex-v01';
      const existing = JSON.parse(localStorage.getItem(key) || '{"logs":[]}');
      if (!Array.isArray(existing.logs) || existing.logs.length) return {error:'Test phone not empty',count:existing.logs?.length};
      const nav = document.querySelector('nav.nav button[data-tab=log]');
      if (!nav) return {error:'Log tab not found'};
      nav.click();
      const cardio = document.querySelector('button.fd-category-option[data-cat=Cardio]');
      if (!cardio) return {error:'Cardio choice not found'};
      cardio.click();
      const search = document.querySelector('#fd-exercise-search');
      if (!search) return {error:'Exercise search not found'};
      search.value = 'Walking';
      search.dispatchEvent(new Event('input',{bubbles:true}));
      const walking = [...document.querySelectorAll('.fd-find-results button.fd-option')].find(b => (b.getAttribute('onclick') || '').includes('e045'));
      if (!walking) return {error:'Walking exercise not found'};
      walking.click();
      const value = document.querySelector('#value');
      const extra = document.querySelector('#extra');
      const notes = document.querySelector('#notes');
      const session = document.querySelector('#session');
      const save = document.querySelector('.fd-save-actions button.primary');
      if (![value,extra,notes,session,save].every(Boolean)) return {error:'Walking form incomplete',stage:window.fdLogStage?.()};
      value.value = '1.2';
      extra.value = '15';
      notes.value = 'FitnessDex disposable Android test';
      session.value = 'standalone';
      save.click();
      const state = JSON.parse(localStorage.getItem(key) || '{}');
      const record = state.logs?.find(l => l.notes === 'FitnessDex disposable Android test');
      return {count:state.logs?.length,exercise:record?.id,distance:record?.value,minutes:record?.minutes,notes:record?.notes,confirmed:!!document.querySelector('.fd-logged')};
    })())`;
    const info = JSON.parse(await inspect(await findTarget(), expression));
    console.log('Disposable activity save:', JSON.stringify(info));
    assert.equal(info.error, undefined, 'Walking log did not open: ' + info.error);
    assert.equal(info.count, 1, 'Exactly one new record must be saved');
    assert.equal(info.exercise, 'e045');
    assert.equal(info.distance, 1.2);
    assert.equal(info.minutes, 15);
    assert.equal(info.confirmed, true, 'Save confirmation missing');
    console.log('PASS: One disposable walking activity saved using real Android UI');
    return;
  }
  if (stage === 'activity-reopen') {
    const expression = String.raw`JSON.stringify((() => {
      const page = document.querySelector('.fd-landing-hero');
      if (!page) return {ready:false};
      const state = JSON.parse(localStorage.getItem('fitnessdex-v01') || '{}');
      const record = state.logs?.find(l => l.notes === 'FitnessDex disposable Android test');
      const more = document.querySelector('nav.nav button[data-tab=more]');
      if (!more) return {ready:false};
      more.click();
      const history = [...document.querySelectorAll('#app button.fd-option')].find(b => b.textContent.includes('History & data'));
      if (!history) return {ready:true,error:'History option missing'};
      history.click();
      return {ready:true,count:state.logs?.length,exercise:record?.id,distance:record?.value,minutes:record?.minutes,historyVisible:document.querySelector('#app h2')?.textContent?.includes('History & data') && document.querySelector('#app .entry .name')?.textContent?.includes('Walking')};
    })())`;
    let info;
    for (let attempt = 0; attempt < 25; attempt++) {
      try {
        info = JSON.parse(await inspect(await findTarget(), expression));
        if (info.ready) break;
      } catch (err) { if (attempt % 5 === 0) console.log('Waiting for relaunched Android page:', err.message); }
      await delay(500);
    }
    console.log('Disposable activity after restart:', JSON.stringify(info));
    assert.equal(info?.ready, true, 'Android UI did not render after activity restart');
    assert.equal(info?.error, undefined, info?.error || '');
    assert.equal(info?.count, 1, 'Saved activity disappeared or duplicated after restart');
    assert.equal(info?.exercise, 'e045');
    assert.equal(info?.distance, 1.2);
    assert.equal(info?.minutes, 15);
    assert.equal(info?.historyVisible, true, 'Saved walk missing from History screen');
    console.log('PASS: Disposable activity survived force-stop and appears in History');
    return;
  }
  if (stage === 'activity-edit') {
    const expression = String.raw`JSON.stringify((() => {
      const key = 'fitnessdex-v01';
      const prior = JSON.parse(localStorage.getItem(key) || '{}');
      if (prior.logs?.length !== 1 || prior.logs[0]?.id !== 'e045') return {error:'Original walking record missing'};
      const originalId = prior.logs[0].at;
      const edit = [...document.querySelectorAll('#app .entry button')].find(b => b.textContent.trim() === 'Edit');
      if (!edit) return {error:'History edit button not found'};
      edit.click();
      const value = document.querySelector('#value');
      const extra = document.querySelector('#extra');
      const notes = document.querySelector('#notes');
      const save = document.querySelector('.fd-save-actions button.primary');
      if (![value,extra,notes,save].every(Boolean)) return {error:'Edit activity form incomplete'};
      value.value = '1.6';
      extra.value = '20';
      notes.value = 'FitnessDex disposable Android test EDITED';
      save.click();
      const state = JSON.parse(localStorage.getItem(key) || '{}');
      const record = state.logs?.[0];
      return {count:state.logs?.length,exercise:record?.id,distance:record?.value,minutes:record?.minutes,notes:record?.notes,sameId:record?.at === originalId};
    })())`;
    const info = JSON.parse(await inspect(await findTarget(), expression));
    console.log('Disposable activity edit:', JSON.stringify(info));
    assert.equal(info.error, undefined, info.error || '');
    assert.equal(info.count, 1, 'Editing must not create a duplicate');
    assert.equal(info.exercise, 'e045');
    assert.equal(info.distance, 1.6);
    assert.equal(info.minutes, 20);
    assert.equal(info.notes, 'FitnessDex disposable Android test EDITED');
    assert.equal(info.sameId, true, 'Editing must preserve the record identity');
    console.log('PASS: Existing Android walking record edited without creating duplicates');
    return;
  }
  if (stage === 'activity-edit-reopen') {
    const expression = String.raw`JSON.stringify((() => {
      if (!document.querySelector('.fd-landing-hero')) return {ready:false};
      const state = JSON.parse(localStorage.getItem('fitnessdex-v01') || '{}');
      const record = state.logs?.[0];
      const more = document.querySelector('nav.nav button[data-tab=more]');
      if (!more) return {ready:false};
      more.click();
      const history = [...document.querySelectorAll('#app button.fd-option')].find(b => b.textContent.includes('History & data'));
      if (!history) return {ready:true,error:'History option missing'};
      history.click();
      const description = document.querySelector('#app .stack .entry .sub')?.textContent || '';
      return {ready:true,count:state.logs?.length,exercise:record?.id,distance:record?.value,minutes:record?.minutes,notes:record?.notes,historyVisible:document.querySelector('#app .stack .entry .name')?.textContent?.includes('Walking') && description.includes('1.6 km') && description.includes('20 min')};
    })())`;
    let info;
    for (let attempt = 0; attempt < 25; attempt++) {
      try { info = JSON.parse(await inspect(await findTarget(), expression)); if (info.ready) break; }
      catch (err) { if (attempt % 5 === 0) console.log('Waiting for Android edit reload:', err.message); }
      await delay(500);
    }
    console.log('Edited walk after Android restart:', JSON.stringify(info));
    assert.equal(info?.ready, true);
    assert.equal(info?.error, undefined, info?.error || '');
    assert.equal(info?.count, 1);
    assert.equal(info?.exercise, 'e045');
    assert.equal(info?.distance, 1.6);
    assert.equal(info?.minutes, 20);
    assert.equal(info?.notes, 'FitnessDex disposable Android test EDITED');
    assert.equal(info?.historyVisible, true, 'Edited walk not shown correctly in History');
    console.log('PASS: Android edited activity survived restart and is correct in History');
    return;
  }
  if (stage === 'activity-delete') {
    const expression = String.raw`JSON.stringify((() => {
      const key = 'fitnessdex-v01';
      const before = JSON.parse(localStorage.getItem(key) || '{}');
      if (before.logs?.length !== 1 || before.logs[0]?.value !== 1.6) return {error:'Expected edited walk missing'};
      const remove = [...document.querySelectorAll('#app .stack .entry button')].find(b => b.textContent.trim() === 'Delete');
      if (!remove) return {error:'Delete action missing from activity History'};
      const originalConfirm = window.confirm;
      window.confirm = () => true;
      try { remove.click(); } finally { window.confirm = originalConfirm; }
      const state = JSON.parse(localStorage.getItem(key) || '{}');
      const snapshots = JSON.parse(localStorage.getItem('fitnessdex-recovery-checkpoints-v1') || '[]');
      const hasRecovery = snapshots.some(x => { try { return JSON.parse(x.data).logs?.some(l => l.id === 'e045' && l.value === 1.6); } catch { return false; } });
      return {count:state.logs?.length,hasRecovery,historyEmpty:(document.querySelector('#app .stack')?.textContent || '').includes('No matching exercise records.')};
    })())`;
    const info = JSON.parse(await inspect(await findTarget(), expression));
    console.log('Disposable walk deletion:', JSON.stringify(info));
    assert.equal(info.error, undefined, info.error || '');
    assert.equal(info.count, 0, 'Deleted walk should be removed from live data');
    assert.equal(info.hasRecovery, true, 'Before-delete recovery snapshot missing');
    assert.equal(info.historyEmpty, true, 'History still shows deleted walk');
    console.log('PASS: Dummy walk deleted; recovery snapshot safely retained');
    return;
  }
  if (stage === 'activity-delete-reopen') {
    const expression = String.raw`JSON.stringify((() => {
      if (!document.querySelector('.fd-landing-hero')) return {ready:false};
      const state = JSON.parse(localStorage.getItem('fitnessdex-v01') || '{}');
      const snapshots = JSON.parse(localStorage.getItem('fitnessdex-recovery-checkpoints-v1') || '[]');
      document.querySelector('nav.nav button[data-tab=more]')?.click();
      const history = [...document.querySelectorAll('#app button.fd-option')].find(b => b.textContent.includes('History & data'));
      if (!history) return {ready:true,error:'History option missing'};
      history.click();
      return {ready:true,count:state.logs?.length,hasRecovery:snapshots.some(x => {try{return JSON.parse(x.data).logs?.some(l=>l.id==='e045'&&l.value===1.6)}catch{return false}}),historyEmpty:(document.querySelector('#app .stack')?.textContent||'').includes('No matching exercise records.')};
    })())`;
    let info;
    for (let attempt = 0; attempt < 25; attempt++) {
      try { info = JSON.parse(await inspect(await findTarget(), expression)); if (info.ready) break; }
      catch (err) { if (attempt % 5 === 0) console.log('Waiting for Android deletion reload:', err.message); }
      await delay(500);
    }
    console.log('Deleted walk after restart:', JSON.stringify(info));
    assert.equal(info?.ready, true);
    assert.equal(info?.error, undefined, info?.error || '');
    assert.equal(info?.count, 0);
    assert.equal(info?.hasRecovery, true);
    assert.equal(info?.historyEmpty, true);
    console.log('PASS: Deletion persists across app restart, with recovery available');
    return;
  }
  if (stage === 'activity-restore') {
    const expression = String.raw`JSON.stringify((() => {
      const restore = document.querySelector('#app details.fd-log-details button[onclick^="restoreCheckpoint("]');
      if (!restore) return {error:'Recovery restore button missing'};
      const originalConfirm = window.confirm;
      window.confirm = () => true;
      try { restore.click(); } finally { window.confirm = originalConfirm; }
      const state = JSON.parse(localStorage.getItem('fitnessdex-v01') || '{}');
      const record = state.logs?.[0];
      return {count:state.logs?.length,exercise:record?.id,distance:record?.value,minutes:record?.minutes,notes:record?.notes};
    })())`;
    const info = JSON.parse(await inspect(await findTarget(), expression));
    console.log('Recovery snapshot restored:', JSON.stringify(info));
    assert.equal(info.error, undefined, info.error || '');
    assert.equal(info.count, 1);
    assert.equal(info.exercise, 'e045');
    assert.equal(info.distance, 1.6);
    assert.equal(info.minutes, 20);
    assert.equal(info.notes, 'FitnessDex disposable Android test EDITED');
    console.log('PASS: Recovery restored the edited walking record');
    return;
  }
  if (stage === 'activity-restore-reopen') {
    const expression = String.raw`JSON.stringify((() => {
      if (!document.querySelector('.fd-landing-hero')) return {ready:false};
      const state = JSON.parse(localStorage.getItem('fitnessdex-v01') || '{}');
      const record = state.logs?.[0];
      document.querySelector('nav.nav button[data-tab=more]')?.click();
      const history = [...document.querySelectorAll('#app button.fd-option')].find(b => b.textContent.includes('History & data'));
      if (!history) return {ready:true,error:'History link missing'};
      history.click();
      const description = document.querySelector('#app .stack .entry .sub')?.textContent || '';
      return {ready:true,count:state.logs?.length,exercise:record?.id,distance:record?.value,minutes:record?.minutes,historyVisible:document.querySelector('#app .stack .entry .name')?.textContent?.includes('Walking') && description.includes('1.6 km') && description.includes('20 min')};
    })())`;
    let info;
    for (let attempt = 0; attempt < 25; attempt++) {
      try { info = JSON.parse(await inspect(await findTarget(), expression)); if (info.ready) break; }
      catch (err) { if (attempt % 5 === 0) console.log('Waiting for recovery restart:', err.message); }
      await delay(500);
    }
    console.log('Restored walking record after restart:', JSON.stringify(info));
    assert.equal(info?.ready, true);
    assert.equal(info?.error, undefined, info?.error || '');
    assert.equal(info?.count, 1);
    assert.equal(info?.exercise, 'e045');
    assert.equal(info?.distance, 1.6);
    assert.equal(info?.minutes, 20);
    assert.equal(info?.historyVisible, true);
    console.log('PASS: Restored activity survives another restart and appears in History');
    return;
  }
  if (stage === 'backup-export') {
    // Test the REAL Android export button, not merely JavaScript object creation.
    // No real user data: this is the disposable emulator with one restored fake walk.
    const expression = String.raw`JSON.stringify((() => {
      const data = JSON.parse(localStorage.getItem('fitnessdex-v01') || '{}');
      if (data.logs?.length !== 1 || data.logs[0]?.id !== 'e045') return {error:'Disposable source data missing'};
      const button = [...document.querySelectorAll('#app button')].find(b => b.textContent.trim() === 'Export complete backup');
      if (!button) return {error:'Real export button missing from History'};
      const valid = validBackup(snapshotForExport());
      button.click();
      const after = JSON.parse(localStorage.getItem('fitnessdex-v01') || '{}');
      return {clicked:true,valid,recordCount:after.logs?.length,sameRecord:after.logs?.[0]?.at === data.logs[0].at};
    })())`;
    const info = JSON.parse(await inspect(await findTarget(), expression));
    console.log('Android real backup export button:', JSON.stringify(info));
    assert.equal(info.error, undefined, info.error || '');
    assert.equal(info.clicked, true);
    assert.equal(info.valid, true, 'Backup content must validate');
    assert.equal(info.recordCount, 1, 'Export must not alter activity records');
    assert.equal(info.sameRecord, true);
    console.log('PASS: Android export button invoked with valid backup content; physical file checked separately');
    return;
  }
  const expr = stage === 'first'
    ? `JSON.stringify((() => {
       const details = {
         title: document.title,
         hostname: location.hostname,
         version: document.querySelector('meta[name="fitnessdex-version"]')?.content,
         rendered: !!document.querySelector('.fd-landing-hero'),
         homeText: document.querySelector('#app')?.textContent?.includes('Make today count.'),
         nav: !!document.querySelector('main .nav'),
         cloudClient: !!window.supabase?.createClient,
         webUpdater: !!document.querySelector('script[src="./updates.js"]')
       };
       localStorage.setItem('${probeKey}', 'persisted');
       return details;
     })())`
    : `JSON.stringify((() => {
       const persisted = localStorage.getItem('${probeKey}');
       return {persisted, rendered:!!document.querySelector('.fd-landing-hero')};
     })())`;
  // The Android activity can launch before the local WebView finishes loading.
  // A fast single snapshot previously reported a blank page while the saved
  // screenshot showed the real FitnessDex UI seconds later.
  let info;
  let lastError;
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      // The WebView may be destroyed and replaced during a cold Android launch.
      // Fetch a fresh debugger target every attempt instead of retrying a stale socket.
      const target = await findTarget();
      info = JSON.parse(await inspect(target, expr));
      ready = stage === 'first'
        ? info.hostname === 'localhost' &&
          info.version === '0.8.7' &&
          info.rendered === true &&
          info.homeText === true &&
          info.nav === true &&
          info.cloudClient === true &&
          info.webUpdater === false
        : info.persisted === 'persisted' && info.rendered === true;
      if (ready) break;
      if (attempt % 8 === 0) console.log('Waiting for FitnessDex to render:', JSON.stringify(info));
    } catch (err) {
      lastError = err;
      if (attempt % 8 === 0) console.log('WebView still loading:', err.message);
    }
    await delay(1500);
  }
  console.log('WebView probe:', JSON.stringify(info));
  if (!ready) {
    throw Error('FitnessDex WebView did not reach the required UI/storage state: ' +
      JSON.stringify(info) + (lastError ? ' | ' + lastError.message : ''));
  }
  if (stage === 'first') {
    assert.equal(info.hostname, 'localhost');
    assert.equal(info.version, '0.8.7');
    assert.equal(info.rendered, true, 'The FitnessDex home UI must actually render');
    assert.equal(info.homeText, true);
    assert.equal(info.nav, true);
    assert.equal(info.cloudClient, true, 'Locally bundled cloud JS must be available');
    assert.equal(info.webUpdater, false);
  } else {
    assert.equal(info.persisted, 'persisted', 'WebView storage must survive force-stop/restart');
    assert.equal(info.rendered, true);
    await inspect(await findTarget(), `localStorage.removeItem('${probeKey}'); true`);
  }
  console.log('PASS: Android WebView ' + stage + ' UI/storage check');
})().catch(err => { console.error(err); process.exitCode = 1; });
