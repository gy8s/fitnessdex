'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const filename = path.join(__dirname, '../android/app/src/main/AndroidManifest.xml');
let manifest = fs.readFileSync(filename, 'utf8');
const closingActivity = '        </activity>';
assert.equal(manifest.split(closingActivity).length, 2, 'Expected one generated Android activity');
const callback = `            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="io.github.gy8s.fitnessdex" android:host="auth" android:path="/callback" />
            </intent-filter>

`;
assert(!manifest.includes('android:host="auth"'), 'Android callback already configured');
manifest = manifest.replace(closingActivity, callback + closingActivity);
manifest = manifest.replace('android:allowBackup="true"', 'android:allowBackup="false"');
manifest = manifest.replace('    </application>', `        <receiver android:name=".ReminderScheduler" android:exported="false">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
                <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />
                <action android:name="android.intent.action.TIMEZONE_CHANGED" />
                <action android:name="android.intent.action.TIME_SET" />
            </intent-filter>
        </receiver>
    </application>
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />`);
if (process.env.FITNESSDEX_TEST_SUPABASE_KEY) {
  const config = path.join(__dirname, '../android/app/src/main/assets/capacitor.config.json');
  const settings = JSON.parse(fs.readFileSync(config, 'utf8'));
  settings.android = { ...settings.android, allowMixedContent:true };
  fs.writeFileSync(config, JSON.stringify(settings));
  manifest = manifest.replace('<application', '<application android:networkSecurityConfig="@xml/fitnessdex_test_network"');
  const network = path.join(__dirname, '../android/app/src/main/res/xml/fitnessdex_test_network.xml');
  fs.writeFileSync(network, `<network-security-config>
    <domain-config cleartextTrafficPermitted="true"><domain>127.0.0.1</domain></domain-config>
</network-security-config>
`);
}
fs.writeFileSync(filename, manifest);
