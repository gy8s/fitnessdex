'use strict';

{
  const reminders = window.Capacitor?.Plugins?.Reminders;
  let permission = 'default';
  const update = result => {
    permission = result.permission;
    if (tab === 'notifications') render();
    return permission;
  };
  if (reminders) {
    const refresh = () => reminders.refresh().then(update).catch(() => {});
    void refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
    reminders.addListener('open', ({ section }) => {
      if (section === 'water') window.fdCareWater?.();
      if (section === 'supplements') window.fdCareSupplements?.();
    });
  }
  window.fdAndroidReminders = Object.freeze({
    available: Boolean(reminders),
    get permission() { return permission; },
    ask: () => reminders.ask().then(update),
    test: background => reminders.test({ background }),
    backgroundTest: async () => {
      try {
        await reminders.test({ background:true });
        toast('Test reminder queued. Leave FitnessDex to try it.');
      } catch {
        toast('Could not queue the test. Check Android notification settings.');
      }
    }
  });
}
