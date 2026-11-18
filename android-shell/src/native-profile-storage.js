'use strict';

// Only the Android build uses this adapter. These are the app's profile and
// recovery snapshots. Browser state such as notification opt-in stays separate.
{
  const cache = new Map();
  window.fdProfileStorage = Object.freeze({
    getItem(key) {
      if (cache.has(key)) return cache.get(key);
      const result = window.prompt('FitnessDexStorage:read:' + key, '');
      if (result?.startsWith('+')) {
        const value = result.slice(1);
        cache.set(key, value);
        return value;
      }
      if (result !== '') throw Error('Could not read the Android profile');
      // Import a previous Android shell's localStorage once, only when the
      // corresponding native file has never existed.
      const legacy = localStorage.getItem(key);
      if (legacy !== null) this.setItem(key, legacy);
      return legacy;
    },
    setItem(key, value, refreshReminders = true) {
      const command = key === 'fitnessdex-v01' && refreshReminders ? 'write-and-refresh:' : 'write:';
      if (window.prompt('FitnessDexStorage:' + command + key, value) !== 'saved') {
        throw Error('Could not write the Android profile');
      }
      cache.set(key, value);
    }
  });
}
