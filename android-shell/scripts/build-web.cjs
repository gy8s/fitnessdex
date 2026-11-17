'use strict';
/* Copy the exact PWA UI into a disposable Android-only bundle.
 * Never edit the original index.html, service worker, or update checker.
 */
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '../..');
const SHELL = path.resolve(__dirname, '..');
const OUT = path.join(SHELL, 'www');
const FILES = [
  'index.html', 'ui.css', 'manifest.json', 'manifest.webmanifest', 'version.json',
  'exercise-reference.js', 'workouts.js', 'habits.js', 'log-flow.js',
  'ui-shell.js', 'campaigns.js', 'progression.js', 'set-ui.js',
  'daily-care.js', 'quick-tools.js', 'notifications.js', 'cloud.js',
  'push-client.js', 'exercise-media.js'
];
function replaceOnce(source, from, to, label) {
  const count = source.split(from).length - 1;
  if (count !== 1) throw Error(label + ': expected exactly one occurrence, found ' + count);
  return source.replace(from, to);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const item of FILES) {
  fs.copyFileSync(path.join(ROOT, item), path.join(OUT, item));
}
fs.cpSync(path.join(ROOT, 'icons'), path.join(OUT, 'icons'), { recursive: true });

const indexFile = path.join(OUT, 'index.html');
let html = fs.readFileSync(indexFile, 'utf8');
html = replaceOnce(
  html,
  'src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"',
  'src="./vendor/supabase.js"',
  'Replace the remote Supabase CDN script with a local pinned bundle'
);
html = replaceOnce(html, '<script defer src="./updates.js"></script>', '',
  'Exclude the PWA web-update checker from the Android APK');
html = replaceOnce(html, '</script><script>\'use strict\';\n// FitnessDex v0.3',
  '</script><script src="./native-profile-storage.js"></script><script>\'use strict\';\n// FitnessDex v0.3',
  'Load the Android profile store before the application opens its save');
html = html.replace(/localStorage\.(getItem|setItem)\((K|PRE_MIGRATION|PRE_IMPORT|PRE_V04|RECOVERY)(?=[,)])/g,
  'window.fdProfileStorage.$1($2');
html = replaceOnce(
  html,
  '<script defer src="./exercise-reference.js"></script>',
  '<script defer src="./native-backup.js"></script><script defer src="./exercise-reference.js"></script>',
  'Route Android backup exports to the native Save dialog'
);
html = replaceOnce(html, '<script defer src="./cloud.js"></script>',
  '<script defer src="./native-cloud.js"></script><script defer src="./cloud.js"></script>',
  'Load the Android cloud adapter before the shared cloud UI');
html = replaceOnce(html, '<script defer src="./notifications.js"></script>',
  '<script defer src="./native-reminders.js"></script><script defer src="./notifications.js"></script>',
  'Load Android reminders before the shared preferences UI');
html = replaceOnce(html, '<script defer src="./push-client.js"></script>', '',
  'Use local Android delivery for reminders');
html = replaceOnce(
  html,
  'if("serviceWorker" in navigator){addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(e=>console.warn("Offline installation not available:",e)));}',
  '/* Android-only: bundled files update with a signed APK, not the PWA service worker. */',
  'Exclude PWA service-worker registration from the Android APK'
);
html = replaceOnce(html, '<div id="app"></div>',
  '<section id="fd-native-steps" class="card" aria-label="Step tracking" hidden>' +
  '<div class="row"><div><div class="muted">Steps today</div><output class="metric">0</output></div>' +
  '<button id="fd-toggle-steps" type="button" disabled>Enable steps</button></div><div class="hint"></div>' +
  '<p class="hint" id="fd-step-breakdown"></p><button id="fd-cardio-resume" type="button" hidden>Open current session</button></section><div id="app"></div>',
  'Show step tracking on the Android home screen');
html = replaceOnce(html, '<script defer src="./notifications.js"></script>',
  '<script defer src="./native-cardio.js"></script><script defer src="./native-steps.js"></script><script defer src="./notifications.js"></script>',
  'Load the Android steps adapter');
html = replaceOnce(html, '<span class="pill">v0.8.9</span>', '<span class="pill">v0.8.16</span>',
  'Show the Android release version');
fs.writeFileSync(indexFile, html);
for (const adapter of ['native-profile-storage.js', 'native-backup.js', 'native-cloud.js', 'native-reminders.js', 'native-cardio.js', 'native-steps.js']) {
  fs.copyFileSync(path.join(SHELL, 'src', adapter), path.join(OUT, adapter));
}

const cloudFile = path.join(OUT, 'cloud.js');
let cloud = fs.readFileSync(cloudFile, 'utf8');
cloud = replaceOnce(cloud, 'emailRedirectTo:location.origin+location.pathname',
  'emailRedirectTo:window.fdAndroidCloud.redirect,shouldCreateUser:false', 'Use the Android email link for existing accounts');
cloud = replaceOnce(cloud, 'detectSessionInUrl:true', '...window.fdAndroidCloud.auth', 'Use Android PKCE and native session storage');
cloud = replaceOnce(cloud, 'const fingerprint = s => JSON.stringify(',
  'const fingerprint = s => window.fdAndroidCloud.fingerprint(', 'Compare stable Android and JSONB snapshots');
cloud = cloud.replace(/localStorage\.(getItem|setItem)\(STORAGE\+uid/g, 'window.fdProfileStorage.$1(STORAGE+uid');
cloud = replaceOnce(cloud, 'try{localStorage.setItem(BACKUP,JSON.stringify(S))}',
  "try{if(!checkpoint('Before cloud restore'))return false;}", 'Create a recoverable Android snapshot before cloud restore');
cloud = replaceOnce(cloud, 'const BACKUP = \'fitnessdex-cloud-before-restore\';\n', '', 'Remove unused browser backup key from Android');
cloud = replaceOnce(cloud, 'window.fdCloudClient=()=>client;', 'window.fdCloudClient=()=>client;\nwindow.fdAndroidCloud.listen(client,setStatus);',
  'Exchange the email callback in the Android app');

// The CI probe uses a disposable local backend. Production builds use the existing endpoint.
const testBackend = process.env.FITNESSDEX_TEST_SUPABASE_KEY;
if (testBackend) {
  if (!/^[A-Za-z0-9._-]+$/.test(testBackend)) throw Error('Invalid isolated backend key');
  cloud = replaceOnce(cloud, cloud.match(/^const URL = .*;$/m)[0],
    "const URL = 'http://127.0.0.1:54321';", 'Use isolated test backend URL');
  cloud = replaceOnce(cloud, cloud.match(/^const KEY = .*;$/m)[0],
    'const KEY = ' + JSON.stringify(testBackend) + ';', 'Use isolated test publishable key');
}
fs.writeFileSync(cloudFile, cloud);

const remindersFile = path.join(OUT, 'notifications.js');
let reminders = fs.readFileSync(remindersFile, 'utf8');
reminders = replaceOnce(reminders, "const supported=()=>!!(window.isSecureContext&&'Notification' in window&&'serviceWorker' in navigator);",
  'const supported=()=>window.fdAndroidReminders.available;', 'Use Android notification support');
reminders = reminders.replaceAll('Notification.permission', 'window.fdAndroidReminders.permission')
  .replaceAll('localStorage.getItem(KEY)', 'window.fdProfileStorage.getItem(KEY)')
  .replaceAll('localStorage.setItem(KEY,', 'window.fdProfileStorage.setItem(KEY,');
reminders = replaceOnce(reminders, 'await Notification.requestPermission()', 'await window.fdAndroidReminders.ask()', 'Request Android notification permission');
reminders = replaceOnce(reminders, "  const reg=await navigator.serviceWorker.getRegistration('./');\n  if(!reg||!reg.active||typeof reg.showNotification!=='function')return toast('Reopen FitnessDex once its offline service is ready, then try again.');\n", '',
  'Enable Android reminders without a service worker');
reminders = replaceOnce(reminders, "  if(write({...read(),enabled:true})){render();window.dispatchEvent(new Event('fitnessdex:reminder-settings'));toast('Notifications enabled. Connecting background push when cloud saving is signed in.');}",
  "  if(write({...read(),enabled:true})){render();toast('Android reminders enabled.');}", 'Schedule local reminders on opt-in');
reminders = replaceOnce(reminders, "try{await notify('FitnessDex notifications are working','You will only be reminded about the routines you enable.','water','test');toast('Test notification sent.');}",
  "try{await window.fdAndroidReminders.test(false);toast('Test notification sent.');}", 'Show a real Android test notification');
reminders = replaceOnce(reminders, 'On this device · while FitnessDex is running', 'On this device · works when FitnessDex is closed', 'Describe Android delivery');
const backgroundStart = reminders.indexOf(" '<div class=\"fd-reminder-push\">");
const renderEnd = reminders.indexOf('\n}', backgroundStart);
if (backgroundStart < 0 || renderEnd < 0) throw Error('Reminder background UI changed');
reminders = reminders.slice(0, backgroundStart) + ` '<div class="fd-reminder-push"><strong>Background delivery</strong><p>Android schedules reminders on this device. Battery restrictions can delay them.</p>'+(active?'<button class="fd-care-secondary" onclick="fdAndroidReminders.backgroundTest()">Queue a closed-app test</button>':'')+'</div></section>';` + reminders.slice(renderEnd);
const foregroundStart = reminders.indexOf('function seen(');
const foregroundEnd = reminders.indexOf('function view()');
if (foregroundStart < 0 || foregroundEnd < foregroundStart) throw Error('Reminder scheduling source changed');
reminders = reminders.slice(0, foregroundStart) + reminders.slice(foregroundEnd);
reminders = reminders.replace("const SENT_KEY='fitnessdex-reminders-delivered-v1';\n", '')
  .replace("if(write({...read(),enabled:false})){await window.fdPushDisconnect?.();", "if(write({...read(),enabled:false})){");
const webEvents = reminders.indexOf('function openSection(');
if (webEvents < 0) throw Error('Reminder events source changed');
fs.writeFileSync(remindersFile, reminders.slice(0, webEvents) + '})();\n');

fs.mkdirSync(path.join(OUT, 'vendor'), { recursive: true });
esbuild.buildSync({
  entryPoints: [path.join(SHELL, 'src/supabase-global.js')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  outfile: path.join(OUT, 'vendor/supabase.js'),
  logLevel: 'info'
});
console.log('Generated non-release FitnessDex Android web bundle at android-shell/www');
