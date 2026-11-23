'use strict';

const fs = require('node:fs');
const path = require('node:path');

if (process.env.FITNESSDEX_TEST_SUPABASE_KEY) {
  const config = path.join(__dirname, '../android/app/src/main/assets/capacitor.config.json');
  const settings = JSON.parse(fs.readFileSync(config, 'utf8'));
  settings.android = { ...settings.android, allowMixedContent:true };
  fs.writeFileSync(config, JSON.stringify(settings));
  const network = path.join(__dirname, '../android/app/src/debug/res/xml/fitnessdex_test_network.xml');
  fs.mkdirSync(path.dirname(network), { recursive:true });
  fs.writeFileSync(network, `<network-security-config>
    <domain-config cleartextTrafficPermitted="true"><domain>127.0.0.1</domain></domain-config>
</network-security-config>
`);

  const output = path.join(__dirname, '../android/app/src/debug/AndroidManifest.xml');
  fs.mkdirSync(path.dirname(output), { recursive:true });
  fs.writeFileSync(output, '<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n' +
    '    <application android:networkSecurityConfig="@xml/fitnessdex_test_network" />\n</manifest>\n');
}
