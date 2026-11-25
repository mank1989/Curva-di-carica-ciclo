// Dopo «npx cap add android»: copia le classi Java, aggiunge permessi e servizio al manifest, imposta la versione.
import fs from 'node:fs';
import path from 'node:path';
const app = path.resolve('android/app/src/main');
const javaDir = path.join(app, 'java/com/banned/nc3000');
fs.mkdirSync(javaDir, { recursive: true });
for (const f of ['MainActivity.java', 'KeepAliveService.java', 'KeepAlivePlugin.java']) fs.copyFileSync(path.join('native', f), path.join(javaDir, f));

const mf = path.join(app, 'AndroidManifest.xml');
let x = fs.readFileSync(mf, 'utf8');
const perms = [
  'android.permission.BLUETOOTH', 'android.permission.BLUETOOTH_ADMIN', 'android.permission.BLUETOOTH_CONNECT', 'android.permission.BLUETOOTH_SCAN',
  'android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.FOREGROUND_SERVICE', 'android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE',
  'android.permission.POST_NOTIFICATIONS', 'android.permission.WAKE_LOCK', 'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS'
];
const add = perms.filter(p => !x.includes('"' + p + '"')).map(p => '    <uses-permission android:name="' + p + '" />').join('\n');
if (!/<\/application>/.test(x)) throw new Error('AndroidManifest.xml inatteso');
x = x.replace(/<\/application>/, '    <service android:name=".KeepAliveService" android:exported="false" android:foregroundServiceType="connectedDevice" />\n    </application>\n' +
  '    <uses-feature android:name="android.hardware.bluetooth_le" android:required="false" />\n' + add + '\n');
fs.writeFileSync(mf, x);

const gradle = path.resolve('android/app/build.gradle');
let g = fs.readFileSync(gradle, 'utf8');
const run = process.env.GITHUB_RUN_NUMBER || '1';
const g2 = g.replace(/versionCode\s+\d+/, 'versionCode ' + run).replace(/versionName\s+"[^"]*"/, 'versionName "1.' + run + '"');
if (g2 === g) console.warn('ATTENZIONE: versionCode non trovato in build.gradle, gli aggiornamenti potrebbero non installarsi sopra');
fs.writeFileSync(gradle, g2);
console.log('android pronto, versionCode', run);
