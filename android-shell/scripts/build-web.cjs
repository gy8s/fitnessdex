'use strict';
/* Copy the exact PWA UI into a disposable Android-only bundle.
 * Never edit the original index.html, service worker, or update checker.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

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
html = replaceOnce(
  html,
  'if("serviceWorker" in navigator){addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(e=>console.warn("Offline installation not available:",e)));}',
  '/* Android-only: bundled files update with a signed APK, not the PWA service worker. */',
  'Exclude PWA service-worker registration from the Android APK'
);
fs.writeFileSync(indexFile, html);

fs.mkdirSync(path.join(OUT, 'vendor'), { recursive: true });
const esbuild = path.join(SHELL, 'node_modules', 'esbuild', 'bin', 'esbuild');
execFileSync(process.execPath, [
  esbuild, 'src/supabase-global.js', '--bundle', '--platform=browser',
  '--format=iife', '--target=es2020', '--outfile=www/vendor/supabase.js'
], { cwd: SHELL, stdio: 'inherit' });
console.log('Generated non-release FitnessDex Android web bundle at android-shell/www');
