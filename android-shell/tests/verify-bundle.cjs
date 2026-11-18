'use strict';
/* Strict non-runtime checks. An Android emulator is still required. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'android-shell', 'www');
const original = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const packed = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
const changed = original
  .replace('src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"', 'src="./vendor/supabase.js"')
  .replace('<script defer src="./updates.js"></script>', '')
  .replace('<script defer src="./cloud.js"></script>',
           '<script defer src="./native-cloud.js"></script><script defer src="./cloud.js"></script>')
  .replace('<script defer src="./notifications.js"></script>',
           '<script defer src="./native-reminders.js"></script><script defer src="./notifications.js"></script>')
  .replace('<script defer src="./notifications.js"></script>',
           '<script defer src="./native-cardio.js"></script><script defer src="./native-steps.js"></script><script defer src="./notifications.js"></script>')
  .replace('<div id="app"></div>', '<section id="fd-native-steps" class="card" aria-label="Step tracking" hidden>' +
           '<details class="fd-step-details"><summary><span class="fd-step-label">Steps today</span>' +
           '<span class="fd-step-total"><output>0</output><span class="fd-step-chevron" aria-hidden="true">⌄</span></span></summary>' +
           '<p id="fd-step-breakdown">No steps yet</p></details>' +
           '<button id="fd-toggle-steps" type="button" disabled>Enable steps</button>' +
           '<p id="fd-step-status" role="status" hidden></p>' +
           '<button id="fd-cardio-resume" type="button" hidden>Open current session</button></section><div id="app"></div>')
  .replace('<span class="pill">v0.8.9</span>', '<span class="pill">v0.8.25</span>')
  .replace('<script defer src="./push-client.js"></script>', '')
  .replace('</script><script>\'use strict\';\n// FitnessDex v0.3',
           '</script><script src="./native-profile-storage.js"></script><script>\'use strict\';\n// FitnessDex v0.3')
  .replace(/localStorage\.(getItem|setItem)\((K|PRE_MIGRATION|PRE_IMPORT|PRE_V04|RECOVERY)(?=[,)])/g,
           'window.fdProfileStorage.$1($2')
  .replace('<script defer src="./exercise-reference.js"></script>',
           '<script defer src="./native-backup.js"></script><script defer src="./exercise-reference.js"></script>')
  .replace('if("serviceWorker" in navigator){addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(e=>console.warn("Offline installation not available:",e)));}',
           '/* Android-only: bundled files update with a signed APK, not the PWA service worker. */');
assert.equal(packed, changed, 'The Android interface must differ only in the reviewed script adaptations.');
assert.deepEqual(fs.readFileSync(path.join(OUT, 'native-backup.js')),
  fs.readFileSync(path.join(ROOT, 'android-shell/src/native-backup.js')));
assert.deepEqual(fs.readFileSync(path.join(OUT, 'native-profile-storage.js')),
  fs.readFileSync(path.join(ROOT, 'android-shell/src/native-profile-storage.js')));
assert.equal((packed.match(/window\.fdProfileStorage\.(getItem|setItem)\(/g) || []).length, 13);
assert(!packed.includes('cdn.jsdelivr.net'), 'Native app must not depend on an external script CDN.');
assert(!packed.includes('navigator.serviceWorker.register'), 'Native app must not register the PWA service worker.');
assert(!packed.includes('src="./updates.js"'), 'Native app must not display a misleading web update dialog.');
assert(fs.statSync(path.join(OUT, 'vendor/supabase.js')).size > 10000, 'Offline Supabase client bundle must exist.');

const sources = [
  'ui.css','manifest.json','manifest.webmanifest','version.json','exercise-reference.js',
  'workouts.js','habits.js','log-flow.js','ui-shell.js','campaigns.js','progression.js',
  'set-ui.js','daily-care.js','quick-tools.js',
  'push-client.js','exercise-media.js','icons/icon-192.png','icons/icon-512.png'
];
for (const f of sources) {
  assert.deepEqual(fs.readFileSync(path.join(OUT, f)), fs.readFileSync(path.join(ROOT, f)),
    'PWA asset changed in the generated Android bundle: '+f);
}
const cloud = fs.readFileSync(path.join(OUT, 'cloud.js'), 'utf8');
const reminders = fs.readFileSync(path.join(OUT, 'notifications.js'), 'utf8');
assert(reminders.includes('window.fdAndroidReminders.ask()'));
assert(reminders.includes('window.fdProfileStorage.setItem(KEY,'));
assert(!reminders.includes('navigator.serviceWorker'));
assert(cloud.includes('...window.fdAndroidCloud.auth'));
assert(cloud.includes('emailRedirectTo:window.fdAndroidCloud.redirect,shouldCreateUser:false'));
assert(cloud.includes("checkpoint('Before cloud restore')"));
assert(cloud.includes('window.fdAndroidCloud.listen(client,setStatus)'));
assert.equal(cloud.includes("const URL = 'http://127.0.0.1:54321';"),
  Boolean(process.env.FITNESSDEX_TEST_SUPABASE_KEY), 'Only the isolated CI build may target localhost');
for (const match of packed.matchAll(/(?:src|href)="\.\/([^"?#]+)"/g)) {
  assert(fs.existsSync(path.join(OUT, match[1])), 'HTML asset is missing: '+match[1]);
}
const config = JSON.parse(fs.readFileSync(path.join(ROOT,'android-shell/capacitor.config.json'),'utf8'));
assert.equal(config.appId,'io.github.gy8s.fitnessdex');
assert.equal(config.webDir,'www');
assert.equal(config.loggingBehavior,'none','Backup data sent through the bridge must not be logged.');
assert.equal(config.server.url,undefined,'Android must load bundled assets, never a remote website.');
console.log('PASS: unchanged PWA source assets and stylesheet, reviewed HTML adaptations, pinned local Supabase bundle, local-only shell config.');
console.log('NOTE: This does NOT prove visual parity, authentication, notifications, or Android runtime behaviour.');
