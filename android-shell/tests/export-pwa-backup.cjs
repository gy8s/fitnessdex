'use strict';

// Generate the file with the unmodified PWA's export button in a clean Chromium profile.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const { screens, inspectScreen, verifyScreen } = require('./screen-parity.cjs');

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

async function main(output) {
  assert(output, 'Specify an output filename');
  const server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    // Serve the actual web app and a minimal same-origin page for seeding browser storage.
    if (pathname === '/test-profile') {
      response.setHeader('Content-Type', 'text/html');
      return response.end('<!doctype html><title>FitnessDex test profile</title>');
    }
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
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
    const parity = {};
    const visualDir = path.join(path.dirname(output), 'visual');
    await fs.mkdir(visualDir, { recursive:true });
    await page.goto(origin + '/');
    await page.locator('.fd-landing-hero').waitFor();
    for (const width of [360, 411]) {
      await page.setViewportSize({ width, height:870 });
      for (const screen of screens) {
        const state = await page.evaluate(inspectScreen, screen);
        verifyScreen(screen, state);
        parity[width + '-' + screen.name] = state;
        await page.screenshot({ path:path.join(visualDir, 'web-' + width + '-' + screen.name + '.png') });
      }
    }
    await fs.writeFile(path.join(visualDir, 'web-screen-parity.json'), JSON.stringify(parity, null, 2));
    console.log('PASS: captured web reference screens at 360px and 411px');
    await page.goto(origin + '/test-profile');

    const profile = testProfile();
    await page.evaluate(state => {
      localStorage.setItem('fitnessdex-v01', JSON.stringify(state));
      localStorage.setItem('fitnessdex-reminders-v1', '{"enabled":true}');
    }, profile);
    await page.goto(origin + '/');
    await page.locator('.fd-landing-hero').waitFor();
    assert(await page.evaluate(() => validBackup(snapshotForExport())), 'The loaded PWA test profile is invalid');
    await page.locator('nav.nav button[data-tab=more]').click();
    await page.getByRole('button', { name:/History & data/ }).click();
    await page.getByRole('button', { name:'Data tools', exact:true }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name:'Export complete backup', exact:true }).click()
    ]);
    assert.match(download.suggestedFilename(), /^FitnessDex_v04_backup_.*\.json$/);
    await fs.mkdir(path.dirname(output), { recursive:true });
    await download.saveAs(output);
    const backup = JSON.parse(await fs.readFile(output, 'utf8'));
    for (const key of Object.keys(profile)) {
      assert.deepEqual(backup[key], profile[key], 'PWA export changed ' + key);
    }
    assert.equal(backup.version, 5);
    assert(Number.isFinite(Date.parse(backup.exportedAt)));
    assert.equal(backup['fitnessdex-reminders-v1'], undefined);
    console.log('PASS: Chromium downloaded a real backup from the PWA containing four historical records and saved preferences');
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

main(process.argv[2]).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
