'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const { inspect } = require('./devtools.cjs');

const endpoint = 'http://127.0.0.1:54321';
const mailpit = 'http://127.0.0.1:54324/api/v1';
const callback = 'io.github.gy8s.fitnessdex://auth/callback';
const email = 'android-test@example.com';
const app = 'io.github.gy8s.fitnessdex';
const serviceKey = process.env.FITNESSDEX_TEST_SERVICE_KEY;

function adb(...args) {
  return execFileSync('adb', args, { encoding:'utf8', stdio:['ignore', 'pipe', 'ignore'], timeout:20000 }).trim();
}

async function waitFor(check, description) {
  for (let i = 0; i < 40; i++) {
    try {
      const result = await check();
      if (result) return result;
    } catch (error) {
      if (i === 39) throw Error(description + ': ' + error.message);
    }
    await delay(500);
  }
  throw Error(description);
}

async function evaluate(expression) {
  const response = await fetch('http://127.0.0.1:9222/json');
  const target = (await response.json()).find(page => page.type === 'page' && page.url.startsWith('https://localhost/'));
  if (!target) return null;
  return inspect(target, expression, true);
}

async function openActivity(url) {
  if (url) {
    // Only send the single-use code to the registered app. Keep it out of CI logs.
    const result = adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', url, app);
    assert(result.includes(app) && !result.includes('Error'), 'Email link did not open FitnessDex');
  } else {
    adb('shell', 'am', 'start', '-n', app + '/.MainActivity');
  }
  const pid = await waitFor(() => {
    try { return adb('shell', 'pidof', app); } catch { return null; }
  }, 'FitnessDex did not start');
  adb('forward', 'tcp:9222', 'localabstract:webview_devtools_remote_' + pid);
  await waitFor(() => evaluate("Boolean(document.querySelector('.fd-landing-hero') && window.fdCloudClient?.())"),
    'FitnessDex cloud UI did not load');
}

async function request(path, method = 'GET', data) {
  const response = await fetch(endpoint + path, {
    method, headers:{ apikey:serviceKey, Authorization:'Bearer ' + serviceKey, 'Content-Type':'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data)
  });
  if (!response.ok) throw Error(path.split('?')[0] + ' failed with status ' + response.status);
  return response.status === 204 ? null : response.json();
}

async function emailLink() {
  const messageId = await waitFor(async () => {
    const response = await fetch(mailpit + '/messages');
    const inbox = await response.json();
    return inbox.messages?.find(message => message.To?.some(recipient => recipient.Address === email))?.ID;
  }, 'Sign-in email did not arrive in the isolated mailbox');
  const message = await (await fetch(mailpit + '/message/' + messageId)).json();
  const link = (message.HTML || message.Text).match(/https?:[^"'<>\s]+\/auth\/v1\/verify\?[^"'<>\s]+/)?.[0]?.replaceAll('&amp;', '&');
  assert(link, 'Captured email did not contain a Supabase verification link');
  const verify = new URL(link);
  assert.equal(verify.port, '54321', 'Email link must target the isolated service');
  const response = await fetch(endpoint + verify.pathname + verify.search, { redirect:'manual' });
  const destination = new URL(response.headers.get('location'));
  assert.equal(destination.protocol + '//' + destination.host + destination.pathname, callback);
  const code = destination.searchParams.get('code');
  assert(/^[A-Za-z0-9_-]{16,256}$/.test(code || ''), 'The email did not produce a PKCE exchange code');
  return callback + '?code=' + code;
}

async function main() {
  assert(serviceKey, 'The isolated backend service key is required');
  const user = await request('/auth/v1/admin/users', 'POST', { email, email_confirm:true });
  const rowPath = '/rest/v1/fitnessdex_saves?user_id=eq.' + user.id;
  await waitFor(() => evaluate("Boolean(document.querySelector('#fd-login') && window.fdCloudClient?.())"),
    'Android cloud client did not initialize');
  assert.equal(await evaluate(`(() => {
    document.querySelector('nav.nav button[data-tab=more]').click();
    [...document.querySelectorAll('#app button.fd-option')].find(b => b.textContent.includes('Cloud saving')).click();
    document.querySelector('#fd-login').click();
    const input = document.querySelector('#fd-email');
    input.value = ${JSON.stringify(email)};
    input.form.requestSubmit();
    return true;
  })()`), true);
  await waitFor(() => evaluate("document.querySelector('#fd-sync-status')?.textContent.includes('Sign-in email sent')"),
    'Android did not request the email successfully');
  const link = await emailLink();

  adb('shell', 'am', 'force-stop', app);
  adb('forward', '--remove', 'tcp:9222');
  await openActivity(link);
  await waitFor(() => evaluate("Boolean(document.querySelector('#fd-logout'))"), 'Cold-start link did not sign in');
  const uploaded = await waitFor(async () => (await request(rowPath))[0], 'First cloud upload was not received');
  assert.equal(uploaded.save_data.logs.length, 1);
  assert.equal(uploaded.save_data.logs[0].notes, 'FitnessDex disposable Android test EDITED');
  console.log('PASS: Signed in with a real Supabase email link after force-stop and uploaded the saved Android walk');

  adb('shell', 'am', 'force-stop', app);
  adb('forward', '--remove', 'tcp:9222');
  await openActivity();
  await waitFor(() => evaluate("Boolean(document.querySelector('#fd-logout'))"), 'Android did not retain its session');
  const isSynced = "document.querySelector('#fd-sync-status')?.textContent.includes('Cloud save up to date')";
  try {
    await waitFor(() => evaluate(isSynced), 'Android did not recognise the saved cloud revision');
  } catch (error) {
    const status = await evaluate("document.querySelector('#fd-sync-status')?.textContent");
    throw Error(error.message + ': ' + status);
  }
  console.log('PASS: Signed-in session and cloud save survived Android restart');

  const remote = structuredClone(uploaded.save_data);
  remote.logs[0].notes = 'Isolated cloud revision';
  await request(rowPath, 'PATCH', { save_data:remote, updated_at:new Date(Date.now() + 2000).toISOString() });
  assert.equal(await evaluate(`(() => {
    S.logs[0].notes = 'Isolated Android revision';
    return save();
  })()`), true);
  await waitFor(() => evaluate("Boolean(document.querySelector('#fd-device') && document.querySelector('#fd-cloud'))"),
    'Android did not stop on a cloud conflict');
  assert.equal((await request(rowPath))[0].save_data.logs[0].notes, 'Isolated cloud revision');
  assert.equal(await evaluate("S.logs[0].notes"), 'Isolated Android revision');
  await evaluate("document.querySelector('#fd-cloud').click(); true");
  assert.equal(await evaluate("S.logs[0].notes"), 'Isolated cloud revision');
  assert.equal(await evaluate("JSON.parse(recoveryRows()[0].data).logs[0].notes"), 'Isolated Android revision');
  assert.equal((await request(rowPath))[0].save_data.logs[0].notes, 'Isolated cloud revision');
  console.log('PASS: A cloud conflict preserved both versions until selection, then retained a local recovery snapshot');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
