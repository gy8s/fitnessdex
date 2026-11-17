(() => {
  'use strict';

  const steps = window.Capacitor?.Plugins?.Steps;
  const card = document.querySelector('#fd-native-steps');
  if (!steps || !card) return;

  const output = card.querySelector('output');
  const status = card.querySelector('#fd-step-status');
  const toggle = card.querySelector('#fd-toggle-steps');
  const breakdown = card.querySelector('#fd-step-breakdown');
  const resume = card.querySelector('#fd-cardio-resume');
  resume.addEventListener('click', () => window.fdCardioResume?.());
  let busy = false;
  let running = false;

  function showStatus(message) {
    status.textContent = message;
    status.hidden = !message;
  }

  function display(state) {
    const enabled = state.enabled;
    running = enabled && state.running;
    output.textContent = state.today.toLocaleString();
    breakdown.textContent = '';
    window.fdCardioHome?.(state, breakdown, resume);
    if (!breakdown.textContent) breakdown.textContent = state.available ? 'No steps yet' : 'No step sensor';
    showStatus(state.available ? '' : 'No step sensor');
    toggle.disabled = busy || !state.available;
    toggle.textContent = enabled && state.running ? 'Turn off' : enabled ? 'Resume' : 'Enable steps';
  }

  async function refresh() {
    card.hidden = document.querySelector('.nav button.active')?.dataset.tab !== 'home';
    if (document.hidden || card.hidden || busy) return;
    try {
      const state = await steps.status();
      if (!busy) display(state);
    } catch {
      showStatus('Steps unavailable');
    }
  }

  toggle.addEventListener('click', async () => {
    const stopping = running;
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
  setInterval(refresh, 2000);
  refresh();
})();
