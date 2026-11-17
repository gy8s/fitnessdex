(() => {
  'use strict';

  const steps = window.Capacitor?.Plugins?.Steps;
  if (!steps) return;

  const storageKey = 'fitnessdex-cardio-recorder-v1';
  let session;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    session = saved && isFootCardio(saved.exercise) && typeof saved.id === 'string' ? saved : null;
  } catch {
    session = null;
  }
  let busy = false;

  function store(next) {
    try {
      if (next) localStorage.setItem(storageKey, JSON.stringify(next));
      else localStorage.removeItem(storageKey);
      session = next;
      return true;
    } catch {
      toast('Could not save the session timer. Try again.');
      return false;
    }
  }

  function elapsedMs(record, now = Date.now()) {
    const runningMs = record.started == null ? 0 : Math.max(0, now - record.started);
    return record.elapsedMs + runningMs;
  }

  function clock(elapsed) {
    const minutes = Math.floor(elapsed / 60);
    return (minutes >= 60 ? Math.floor(minutes / 60) + ':' : '')
      + String(minutes % 60).padStart(2, '0') + ':' + String(elapsed % 60).padStart(2, '0');
  }

  async function readSteps() {
    try {
      return await steps.status();
    } catch {
      return null;
    }
  }

  function counts(record, snapshot) {
    const start = record.baseline;
    const compatible = start && snapshot?.source === start.source;
    const delta = compatible ? Math.max(0, snapshot.tracked - start.tracked) : 0;
    const day = snapshot?.day ?? record.day;
    const dayDelta = compatible ? Math.min(delta, Math.max(0,
      snapshot.today - (start.day === day ? start.today : 0))) : 0;
    return {
      total: (record.total ?? 0) + delta,
      today: (record.day === day ? record.today : 0) + dayDelta,
      day,
      measured: record.total !== null || !!compatible,
      source: record.source ?? (compatible ? snapshot.source : null)
    };
  }

  function controls() {
    if (!session) return '<button type="button" onclick="fdCardioAction(\'start\')">Start timer</button>';
    const elapsed = Math.floor(elapsedMs(session) / 1000);
    let buttons = '';
    if (!session.finished) {
      const active = session.started !== null;
      buttons = active
        ? '<button type="button" onclick="fdCardioAction(\'pause\')">Pause</button>'
        : '<button type="button" onclick="fdCardioAction(\'resume\')">Resume</button>';
      buttons += '<button type="button" onclick="fdCardioAction(\'finish\')">Finish</button>';
    }
    return '<output id="fd-cardio-clock" class="metric" aria-label="Active time">' + clock(elapsed) + '</output>'
      + '<p class="hint" id="fd-cardio-steps"></p><div class="row">' + buttons + '</div>';
  }

  function restoreFields() {
    if (!session?.finished || session.exercise !== chosen) return;
    const minutes = $('extra');
    if (minutes && minutes.value === '') minutes.value = String(Math.round(session.elapsedMs / 60) / 1000);
  }

  function refreshControls() {
    const area = $('fd-cardio-recorder');
    if (!area) return;
    area.innerHTML = controls();
    $('fd-cardio-save').disabled = !!session && !session.finished;
    $('extra').readOnly = !!session && !session.finished;
    restoreFields();
    refresh();
  }

  function recover() {
    if (session && S.logs.some(log => log.at === session.id)) {
      session = null;
      try { localStorage.removeItem(storageKey); } catch {}
    }
  }

  async function refresh() {
    const time = $('fd-cardio-clock');
    if (!time || !session || document.hidden) return;
    const current = session;
    if (current.started !== null) time.value = clock(Math.floor(elapsedMs(current) / 1000));
    const output = $('fd-cardio-steps');
    const snapshot = current.started === null ? null : await readSteps();
    if (current !== session || !output?.isConnected) return;
    const value = counts(current, snapshot);
    output.textContent = value.measured ? value.total.toLocaleString() + ' session steps'
      : 'Session steps unavailable';
  }

  window.fdCardioAction = async action => {
    if (busy || !$('fd-cardio-recorder')) return;
    const current = session;
    const form = $('fd-cardio-recorder');
    busy = true;
    for (const button of $('fd-cardio-recorder').querySelectorAll('button')) button.disabled = true;
    try {
      const now = Date.now();
      const snapshot = await readSteps();
      // Back or another navigation can discard the form during the native read.
      if (session !== current || $('fd-cardio-recorder') !== form) return;
      if (!snapshot && current?.baseline && (action === 'pause' || action === 'finish')) {
        toast('Could not read the step counter. Try again.');
        return;
      }
      const baseline = snapshot?.running && snapshot.enabled ? snapshot : null;
      let next;
      if (action === 'start' && !current) {
        next = { id: new Date(now).toISOString() + '-' + uid(), exercise: chosen, started: now,
          elapsedMs: 0, baseline, total: null, day: null, today: 0, source: null, finished: false };
      } else if (action === 'resume' && current?.started === null && !current.finished) {
        next = { ...current, started: now, baseline };
      } else if (current && !current.finished && (action === 'pause' || action === 'finish')) {
        const value = counts(current, current.started === null ? null : snapshot);
        next = { ...current, started: null, baseline: null, elapsedMs: elapsedMs(current, now),
          total: value.measured ? value.total : null, day: value.day, today: value.today, source: value.source,
          finished: action === 'finish' };
        if (next.finished) {
          next.finishedAt = now;
          $('date').value = stamp(new Date(now));
          $('clock').value = localTime(new Date(now));
        }
      }
      if (next) store(next);
    } finally {
      busy = false;
      refreshControls();
    }
  };

  window.fdCardioRecorder = exercise => {
    recover();
    if (!isFootCardio(exercise.id) || (session && session.exercise !== exercise.id)) return '';
    return '<div id="fd-cardio-recorder" class="fd-hold-timer">' + controls() + '</div>';
  };

  window.fdCardioForSave = exercise => {
    if (!session || session.exercise !== exercise.id) return null;
    return session;
  };
  window.fdCardioDiscard = exercise => {
    return session?.exercise !== exercise || store(null);
  };
  window.fdCardioResume = () => {
    if (session && choose(session.exercise)) refreshControls();
  };

  window.fdCardioHome = (snapshot, output, resume) => {
    recover();
    resume.hidden = !session;
    if (!snapshot.available) {
      output.textContent = '';
      return;
    }
    const saved = S.logs.reduce((sum, log) => sum + (log.cardioSteps?.day === snapshot.day
      && log.cardioSteps.source === snapshot.source ? log.cardioSteps.today : 0), 0);
    const current = session ? counts(session, snapshot) : null;
    const inSessions = Math.min(snapshot.today, saved
      + (current?.source === snapshot.source ? current.today : 0));
    output.textContent = snapshot.today > 0 || current?.measured
      ? inSessions.toLocaleString() + ' in sessions · ' + (snapshot.today - inSessions).toLocaleString() + ' other steps'
      : '';
  };

  document.addEventListener('visibilitychange', refresh);
  setInterval(refresh, 1000);
})();
