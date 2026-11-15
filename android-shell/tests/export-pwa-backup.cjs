'use strict';

// Generate the file with the unmodified PWA's export button in a clean Chromium profile.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const { command, inspect } = require('./devtools.cjs');

const root = path.resolve(__dirname, '../..');
const contentTypes = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json' };

function testProfile() {
  const past = '2025-06-18';
  const at = past + 'T12:00:00.000Z';
  const workout = 'w-pwa-test';
  return {
    logs: [
      { at:'pwa-legacy-pushups', id:'e004', date:past, performedAt:at, mode:'reps', value:12 },
      { at:'pwa-walk', id:'e045', date:past, performedAt:at, mode:'distance', value:5.4, minutes:65 },
      { at:'pwa-pushups', id:'e004', date:past, performedAt:at, mode:'bodysets', sets:[{reps:8},{reps:6}], sessionId:workout },
      { at:'pwa-squat', id:'e025', date:past, performedAt:at, mode:'sets', sets:[{weight:42.5,reps:5}], sessionId:workout }
    ],
    recoveryDays: ['2025-06-19'],
    v5: { workouts:[{ id:workout, name:'Migration test workout', createdAt:at }], dismissed:[] },
    v6: { baselineWeek:{ alcohol:null, smoking:null, takeaway:3 }, days:[{ category:'takeaway', date:past, quantity:1 }], awards:[] },
    v7: { campaigns:[{ id:'run5k', started:past }] },
    v8: { tracks:[{ id:'track-test', baseId:'e004', focus:'volume', baseline:8, setCount:3, restSec:90, createdAt:at }], sessions:[] },
    v9: {
      water: { baseGoal:2750, goals:[], entries:[{ id:'water-migration-test', date:past, at, ml:500 }] },
      supplements: {
        items:[{
          id:'supp-migration-test', name:'Migration test routine', note:'With breakfast',
          time:'08:00', days:[0,1,2,3,4,5,6], createdAt:at, archivedAt:null
        }],
        taken:[{ id:'taken-migration-test', supplementId:'supp-migration-test', date:past, at, onTime:false }]
      }
    }
  };
}

async function waitFor(action, message) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const value = await action();
    if (value) return value;
    await delay(250);
  }
  throw Error(message);
}

async function main(output) {
  assert(output, 'Specify an output filename');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fitnessdex-web-export-'));
  const downloads = path.join(directory, 'downloads');
  await fs.mkdir(downloads);
  const server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    // Serve the actual web app and a minimal same-origin page for seeding browser storage.
    if (pathname === '/test-profile') return response.end('FitnessDex test profile');
    const filename = path.join(root, pathname === '/' ? 'index.html' : pathname);
    if (!filename.startsWith(root + path.sep)) return response.writeHead(404).end();
    try {
      const body = await fs.readFile(filename);
      response.setHeader('Content-Type', contentTypes[path.extname(filename)] || 'application/octet-stream');
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const origin = 'http://127.0.0.1:' + server.address().port;
    browser = spawn(process.env.FITNESSDEX_CHROME || 'chromium', [
      '--headless', '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
      '--remote-debugging-port=0', '--user-data-dir=' + directory, origin + '/test-profile'
    ], { stdio:['ignore','ignore','pipe'] });
    let browserErrors = '';
    browser.stderr.on('data', chunk => { browserErrors = (browserErrors + chunk).slice(-2500); });
    let spawnError;
    browser.once('error', error => { spawnError = error; });
    const port = await waitFor(async () => {
      if (spawnError) throw spawnError;
      if (browser.exitCode !== null || browser.signalCode !== null) {
        throw Error('Chromium exited during startup:\n' + browserErrors);
      }
      return fs.readFile(path.join(directory, 'DevToolsActivePort'), 'utf8')
        .then(value => value.split('\n')[0], () => null);
    }, 'Chromium did not start');
    const debuggerOrigin = 'http://127.0.0.1:' + port;
    const target = await waitFor(async () => {
      const response = await fetch(debuggerOrigin + '/json');
      return (await response.json()).find(page => page.url === origin + '/test-profile');
    }, 'Chromium test page did not open');

    const profile = testProfile();
    const seeded = await inspect(target, `(() => {
      localStorage.setItem('fitnessdex-v01', ${JSON.stringify(JSON.stringify(profile))});
      localStorage.setItem('fitnessdex-reminders-v1', '{"enabled":true}');
      return true;
    })()`);
    assert.equal(seeded, true);
    const browserInfo = await (await fetch(debuggerOrigin + '/json/version')).json();
    await command(browserInfo.webSocketDebuggerUrl, 'Browser.setDownloadBehavior', { behavior:'allow', downloadPath:downloads });
    await command(target.webSocketDebuggerUrl, 'Page.navigate', { url:origin + '/' });
    await waitFor(async () => inspect(target, `(() => {
      if (!document.querySelector('.fd-landing-hero')) return false;
      if (!validBackup(snapshotForExport())) throw Error('The loaded PWA test profile is invalid');
      document.querySelector('nav.nav button[data-tab=more]').click();
      [...document.querySelectorAll('#app button.fd-option')].find(b => b.textContent.includes('History & data')).click();
      [...document.querySelectorAll('#app button')].find(b => b.textContent.trim() === 'Export complete backup').click();
      return true;
    })()`, true), 'The PWA export button did not become available');
    const download = await waitFor(async () => {
      const files = await fs.readdir(downloads);
      return files.find(filename => /^FitnessDex_v04_backup_.*\.json$/.test(filename));
    }, 'Chromium did not download the PWA backup');
    const downloaded = path.join(downloads, download);
    const backup = JSON.parse(await fs.readFile(downloaded, 'utf8'));
    for (const key of Object.keys(profile)) {
      assert.deepEqual(backup[key], profile[key], 'PWA export changed ' + key);
    }
    assert.equal(backup.version, 5);
    assert(Number.isFinite(Date.parse(backup.exportedAt)));
    assert.equal(backup['fitnessdex-reminders-v1'], undefined);
    await fs.mkdir(path.dirname(output), { recursive:true });
    await fs.copyFile(downloaded, output);
    console.log('PASS: Chromium downloaded a real backup from the PWA containing four historical records and saved preferences');
  } finally {
    if (browser?.pid && browser.exitCode === null && browser.signalCode === null) {
      const closed = new Promise(resolve => browser.once('exit', resolve));
      browser.kill();
      await closed;
    }
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await fs.rm(directory, { force:true, recursive:true });
  }
}

main(process.argv[2]).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
