'use strict';
// Only checks an Android emulator's debug WebView. No production user data.
const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');
const stage = process.argv[2];
if (!['first','after-restart'].includes(stage)) throw Error('Specify first or after-restart');
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
