(() => {
  'use strict';

  const steps = window.Capacitor?.Plugins?.Steps;
  const card = document.querySelector('#fd-native-steps');
  if (!steps || !card) return;

  const output = card.querySelector('output');
  const status = card.querySelector('#fd-step-status');
  const toggle = card.querySelector('#fd-toggle-steps');
  const details = card.querySelector('.fd-step-details');
  const breakdown = card.querySelector('#fd-step-breakdown');
  const resume = card.querySelector('#fd-cardio-resume');
  resume.addEventListener('click', () => window.fdCardioResume?.());
  let busy = false;
  let running = false;
  let pending = false;
  let generation = 0;

  function setText(node, value) {
    if (node.textContent !== value) node.textContent = value;
  }

  function showStatus(message) {
    setText(status, message);
    if (status.hidden !== !message) status.hidden = !message;
  }

  function display(state) {
    const enabled = state.enabled;
    running = enabled && state.running;
    setText(output, state.today.toLocaleString());
    const message = window.fdCardioHome?.(state, resume, details.open);
    if (details.open) setText(breakdown, message || (state.available ? 'No steps yet' : 'No step sensor'));
    showStatus(state.available ? '' : 'No step sensor');
    const disabled = busy || !state.available;
    if (toggle.disabled !== disabled) toggle.disabled = disabled;
    setText(toggle, running ? 'Turn off' : enabled ? 'Resume' : 'Enable steps');
  }

  async function refresh() {
    const hidden = document.querySelector('.nav button.active')?.dataset.tab !== 'home';
    if (card.hidden !== hidden) card.hidden = hidden;
    if (document.hidden || hidden || busy || pending) return;
    const requested = generation;
    pending = true;
    try {
      const state = await steps.status();
      if (requested === generation && !document.hidden && !card.hidden) display(state);
    } catch {
      if (requested === generation && !document.hidden && !card.hidden) showStatus('Steps unavailable');
    } finally {
      pending = false;
    }
  }

  toggle.addEventListener('click', async () => {
    const stopping = running;
    generation++;
    busy = true;
    toggle.disabled = true;
    try {
      const state = await (stopping ? steps.disable() : steps.enable());
      busy = false;
      display(state);
    } catch (error) {
      toggle.disabled = false;
      window.toast?.(error.message || 'Could not change step tracking.');
    } finally {
      busy = false;
    }
  });

  new MutationObserver(refresh).observe(document.querySelector('#app'), { childList: true });
  document.addEventListener('visibilitychange', refresh);
  details.addEventListener('toggle', refresh);
  setInterval(refresh, 2000);
  refresh();
})();
