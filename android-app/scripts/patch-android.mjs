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
  '<uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />',
  '<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />',
  '<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />',
  '<uses-permission android:name="android.permission.BLUETOOTH_SCAN" android:usesPermissionFlags="neverForLocation" tools:targetApi="s" />',
  '<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" android:maxSdkVersion="30" />',
  '<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" android:maxSdkVersion="30" />',
  '<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />',
  '<uses-permission android:name="android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE" />',
  '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
  '<uses-permission android:name="android.permission.WAKE_LOCK" />',
  '<uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />'
];
const add = perms.map(p => '    ' + p).join('\n');
if (!/xmlns:tools=/.test(x)) x = x.replace(/<manifest\b/, '<manifest xmlns:tools="http://schemas.android.com/tools"');
if (!/<\/application>/.test(x)) throw new Error('AndroidManifest.xml inatteso');
x = x.replace(/<\/application>/, '    <service android:name=".KeepAliveService" android:exported="false" android:foregroundServiceType="connectedDevice" />\n    </application>\n' +
  '    <uses-feature android:name="android.hardware.bluetooth_le" android:required="false" />\n' + add + '\n');
fs.writeFileSync(mf, x);

// Icona e schermata d'avvio col logo (file in res-icon/)
const res = path.join(app, 'res');
const BG = '#FF050505';
for (const d of fs.readdirSync(res)) {                                 // via la schermata bianca predefinita
  if (!d.startsWith('drawable')) continue;
  for (const f of fs.readdirSync(path.join(res, d))) if (f.startsWith('splash.')) fs.rmSync(path.join(res, d, f));
}
fs.cpSync(path.resolve('res-icon'), res, { recursive: true, force: true });
let colorSet = false;                                                  // colore di fondo dell'icona: dove c'è già, altrimenti file nuovo
const vals = path.join(res, 'values');
for (const f of fs.readdirSync(vals)) {
  const fp = path.join(vals, f), t = fs.readFileSync(fp, 'utf8');
  const t2 = t.replace(/(<color\s+name="ic_launcher_background"\s*>)[^<]*(<\/color>)/, '$1' + BG + '$2');
  if (t2 !== t) { fs.writeFileSync(fp, t2); colorSet = true; }
}
if (!colorSet) fs.writeFileSync(path.join(vals, 'ic_launcher_background.xml'), '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">' + BG + '</color>\n</resources>\n');

const gradle = path.resolve('android/app/build.gradle');
let g = fs.readFileSync(gradle, 'utf8');
const run = process.env.GITHUB_RUN_NUMBER || '1';
const g2 = g.replace(/versionCode\s+\d+/, 'versionCode ' + run).replace(/versionName\s+"[^"]*"/, 'versionName "1.' + run + '"');
if (g2 === g) console.warn('ATTENZIONE: versionCode non trovato in build.gradle, gli aggiornamenti potrebbero non installarsi sopra');
fs.writeFileSync(gradle, g2);
console.log('android pronto, versionCode', run);
