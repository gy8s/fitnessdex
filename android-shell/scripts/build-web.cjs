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
html = replaceOnce(
  html,
  'if("serviceWorker" in navigator){addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(e=>console.warn("Offline installation not available:",e)));}',
  '/* Android-only: bundled files update with a signed APK, not the PWA service worker. */',
  'Exclude PWA service-worker registration from the Android APK'
);
fs.writeFileSync(indexFile, html);
for (const adapter of ['native-profile-storage.js', 'native-backup.js', 'native-cloud.js']) {
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
