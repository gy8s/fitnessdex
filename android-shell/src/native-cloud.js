'use strict';

// Keep the PKCE verifier and authenticated session across Android restarts.
window.fdAndroidCloud = Object.freeze({
  redirect: 'io.github.gy8s.fitnessdex://auth/callback',
  fingerprint(state) {
    // PostgreSQL jsonb can reorder object keys. Array order is user data.
    return JSON.stringify(state, (_, value) => {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
      return Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]));
    });
  },
  auth: {
    flowType: 'pkce',
    detectSessionInUrl: false,
    storageKey: 'fitnessdex-android-auth',
    storage: {
      getItem(key) {
        const stored = window.fdProfileStorage.getItem(key);
        return stored === 'null' ? null : stored;
      },
      setItem(key, value) {
        window.fdProfileStorage.setItem(key, value);
      },
      removeItem(key) {
        window.fdProfileStorage.setItem(key, 'null');
      }
    }
  },
  listen(client, status) {
    let exchanging = false;
    const plugin = window.Capacitor?.Plugins?.EmailSignIn;
    if (!plugin) return;
    plugin.addListener('callback', async ({ code }) => {
      if (exchanging) return;
      if (!code) {
        status('Sign-in link expired or invalid. Request a new email.');
        return;
      }
      exchanging = true;
      try {
        if (!await this.auth.storage.getItem(this.auth.storageKey + '-code-verifier')) {
          status('Request the sign-in email on this device and open its link here.');
          return;
        }
        const { error } = await client.auth.exchangeCodeForSession(code);
        if (error) status('Sign-in could not be completed. Request a new email.');
      } catch {
        status('Sign-in could not be completed. Request a new email.');
      } finally {
        exchanging = false;
      }
    });
  }
});
