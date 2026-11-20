'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const { inspect } = require('./devtools.cjs');

const app = 'io.github.gy8s.fitnessdex';
const adb = (...args) => execFileSync('adb', args, { encoding:'utf8', timeout:20000 }).trim();
const pid = () => {
  try { return adb('shell', 'pidof', app); } catch { return ''; }
};

async function evaluate(expression, port = '9222') {
  const response = await fetch('http://127.0.0.1:' + port + '/json');
  const target = (await response.json()).find(page => page.type === 'page' && page.url.startsWith('https://localhost/'));
  return target && inspect(target, expression, true);
}

async function waitFor(check, description, seconds = 25) {
  const until = Date.now() + seconds * 1000;
  let last;
  while (Date.now() < until) {
    try {
      const result = await check();
      if (result) return result;
    } catch (error) { last = error; }
    await delay(500);
  }
  throw Error(description + (last ? ': ' + last.message : ''));
}

const active = () => adb('shell', 'dumpsys', 'notification', '--noredact').split('  Notification List:')[1]?.split('  Snoozed notifications:')[0] || '';
const settings = () => adb('exec-out', 'run-as', app, 'cat', 'files/fitnessdex-reminders-v1.json');
const ledger = () => {
  try { return adb('exec-out', 'run-as', app, 'cat', 'shared_prefs/fitnessdex-reminders-delivered.xml'); }
  catch { return ''; }
};

function leaveApp() {
  adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
  adb('shell', 'am', 'kill', app);
}

async function main() {
  assert.equal(await evaluate(`(() => {
    fdReminderOpen();
    return fdReminderStatus().config.enabled;
  })()`), false, 'Android reminders must begin opted out');
  assert.equal(await evaluate("document.querySelector('.fd-reminders-page h1')?.textContent"), 'Reminders');
  await evaluate("document.querySelector('button[onclick=\"fdReminderEnable()\"]').click(); true");
  execFileSync('python3', ['android-shell/tests/tap-android-ui.py', 'Allow'], { stdio:'inherit', timeout:30000 });
  await waitFor(() => JSON.parse(settings()).enabled, 'Opting in did not persist settings');

  for (const background of [false,true]) {
    await evaluate("fdReminderOpen(); window.fdAndroidReminders.test(false)");
    const running = pid();
    if (background) adb('shell','input','keyevent','KEYCODE_HOME');
    adb('shell','cmd','statusbar','expand-notifications');
    execFileSync('python3',['android-shell/tests/tap-android-ui.py','You will only be reminded about the routines you enable\\.','10','notification'],
      {stdio:'inherit',timeout:30000});
    await waitFor(() => evaluate("document.querySelector('.fd-care-page h1')?.textContent === 'Hydration'"),
      'Water notification did not open Hydration with the app ' + (background ? 'in the background' : 'open'));
    assert.equal(pid(),running,'Warm reminder tap should reuse the app process');
  }
  console.log('PASS: Water reminder opens Hydration with FitnessDex open and in the background');

  const schedule = blocked => evaluate(`(() => {
    const due = new Date(Date.now() + 60000);
    const at = localTime(due);
    const date = stamp(due);
    const state = {
      water:{ baseGoal:2000, goals:[], entries:${blocked} ? [{id:'water-test',date,at:new Date().toISOString(),ml:250}] : [] },
      supplements:{
        items:[{ id:'supp-test',name:'Test supplement',note:'',time:at,days:[due.getDay()],
          createdAt:new Date().toISOString(),archivedAt:null }],
        taken:${blocked} ? [{ id:'taken-test',supplementId:'supp-test',date,at:new Date().toISOString(),onTime:true }] : []
      }
    };
    if (!validCareState(state)) throw Error('Invalid disposable reminder profile');
    S.v9 = state;
    if (!save()) throw Error('Could not save disposable reminder profile');
    fdReminderOpen();
    const first = due.getHours() * 60 + due.getMinutes();
    for (let index = 0; index < 3; index++) {
      const min = (first + index * 360) % 1440;
      document.querySelector('#fd-reminder-slot-' + index).value =
        String(Math.floor(min / 60)).padStart(2,'0') + ':' + String(min % 60).padStart(2,'0');
    }
    fdReminderSave();
    return at;
  })()`);
  await schedule(false);
  leaveApp();
  await waitFor(() => { if (pid()) adb('shell', 'am', 'kill', app); return !pid(); }, 'Android app process remained running');
  await waitFor(() => {
    const notices = active();
    return notices.includes('Time for a water check-in') && notices.includes('Supplement check-in');
  }, 'Water and supplement alarms did not notify with the app process closed', 145);
  console.log('PASS: Scheduled water and supplement notifications arrived after the Android app process exited');

  for (let attempt = 0; attempt < 3; attempt++) {
    adb('shell', 'cmd', 'statusbar', 'expand-notifications');
    execFileSync('python3', ['android-shell/tests/tap-android-ui.py', 'Your scheduled supplement is due\\.', '5', 'notification'],
      { stdio:'inherit', timeout:40000 });
    await delay(1500);
    if (!active().includes('Supplement check-in')) break;
  }
  assert(!active().includes('Supplement check-in'), 'Tapping the notification body did not dismiss the auto-cancel notification');
  let reopenedPid;
  let port;
  try {
    await waitFor(async () => {
      const reopened = pid();
      if (!reopened) return false;
      if (reopened !== reopenedPid) {
        if (port) adb('forward', '--remove', 'tcp:' + port);
        port = adb('forward', 'tcp:0', 'localabstract:webview_devtools_remote_' + reopened);
        reopenedPid = reopened;
      }
      return evaluate("document.querySelector('.fd-care-page h1')?.textContent === 'Supplements'", port);
    }, 'Supplement notification did not open its routine screen', 45);
    adb('forward', 'tcp:9222', 'localabstract:webview_devtools_remote_' + reopenedPid);
  } finally {
    if (port) adb('forward', '--remove', 'tcp:' + port);
  }
  console.log('PASS: Tapping the supplement notification opened the routine screen');

  assert.equal(await evaluate(`(async () => {
    await fdReminderDisable();
    return fdReminderStatus().config.enabled;
  })()`), false);
  await waitFor(() => !active().includes('Time for a water check-in'), 'Opt-out did not clear water notification');
  assert.equal(await evaluate(`(async () => {
    await fdReminderEnable();
    return fdReminderStatus().config.enabled;
  })()`), true);
  const blockedSlot = await schedule(true);
  leaveApp();
  await waitFor(() => ledger().includes('name="water-' + blockedSlot + '"') &&
    ledger().includes('name="supp-test-' + blockedSlot + '"'), 'Deduplication ledger did not register the second alarms', 145);
  const remaining = active();
  assert(!remaining.includes('Time for a water check-in'), 'Water reminder ignored a recent drink');
  assert(!remaining.includes('Supplement check-in'), 'Supplement reminder ignored a completed check-in');
  console.log('PASS: Background delivery skipped a recent drink and an already-taken supplement');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
