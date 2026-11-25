// Punto d'ingresso dell'app Android: installa il Bluetooth nativo, poi avvia la pagina
// (la versione scaricata più recente, oppure quella inclusa nell'APK) e cerca aggiornamenti.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { BleClient } from '@capacitor-community/bluetooth-le';
import { createBluetooth } from './ble-shim.js';

const SITE = 'https://mank1989.github.io/Curva-di-carica-ciclo/';
const K_HTML = 'nc3000_app_html', K_VER = 'nc3000_app_ver', K_TRIES = 'nc3000_boot_tries', K_BATT = 'nc3000_batt_asked';

const KeepAlive = registerPlugin('KeepAlive');
const ls = {
  get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignora */ } },
  del: k => { try { localStorage.removeItem(k); } catch (e) { /* ignora */ } }
};

// ---------- Bluetooth + servizio in primo piano ----------
function installBluetooth() {
  const bt = createBluetooth(BleClient, {
    onConnected: () => {
      KeepAlive.start().catch(() => { /* senza servizio funziona comunque, ma in background può fermarsi */ });
      if (!ls.get(K_BATT)) { ls.set(K_BATT, '1'); KeepAlive.requestBatteryExemption().catch(() => { /* ignora */ }); }
    },
    onDisconnected: () => { KeepAlive.stop().catch(() => { /* ignora */ }); }
  });
  Object.defineProperty(navigator, 'bluetooth', { value: bt, configurable: true });
}

// ---------- Avvio della pagina e aggiornamenti ----------
const verOf = txt => { const m = /nc3000-v(\d+)/.exec(txt || ''); return m ? +m[1] : 0; };
const looksOk = html => typeof html === 'string' && html.length > 100000 && /<html/i.test(html) && /<\/html>\s*$/i.test(html) && html.includes('NC3000');

async function bundled() {
  const [h, v] = await Promise.all([fetch('app.html').then(r => r.text()), fetch('version.json').then(r => r.json()).catch(() => ({ v: 0 }))]);
  return { html: h, ver: v.v || 0 };
}

async function pickPage() {
  const b = await bundled();
  const cached = ls.get(K_HTML), cv = +ls.get(K_VER) || 0, tries = +ls.get(K_TRIES) || 0;
  if (cached && cv > b.ver && tries < 2 && looksOk(cached)) {      // versione scaricata, se più nuova di quella nell'APK
    ls.set(K_TRIES, String(tries + 1));                             // se non parte due volte di fila si torna a quella dell'APK
    return { html: cached, ver: cv };
  }
  if (cached) { ls.del(K_HTML); ls.del(K_VER); ls.del(K_TRIES); }
  return b;
}

async function checkUpdate(currentVer) {
  try {
    if (!navigator.onLine) return;
    const sw = await fetch(SITE + 'sw.js?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.text() : '');
    const rv = verOf(sw);
    if (!rv || rv <= currentVer) return;
    const html = await fetch(SITE + 'index.html?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.text() : '');
    if (!looksOk(html)) return;
    ls.set(K_HTML, html); ls.set(K_VER, String(rv)); ls.set(K_TRIES, '0');
    window.__nc3000UpdateReady = rv;
  } catch (e) { /* senza internet: resta la versione attuale */ }
}

async function start() {
  installBluetooth();
  const page = await pickPage();
  const ok = '<script>setTimeout(function(){try{localStorage.setItem("' + K_TRIES + '","0")}catch(e){}},8000)</script>';
  const html = /<\/body>/i.test(page.html) ? page.html.replace(/<\/body>/i, () => ok + '</body>') : page.html + ok;
  document.open(); document.write(html); document.close();
  setTimeout(() => checkUpdate(page.ver), 4000);
}

if (Capacitor.isNativePlatform()) {
  start().catch(e => { document.body.textContent = 'Errore di avvio: ' + (e && e.message); });
} else {
  document.body.textContent = 'Questa è la versione Android: apri la pagina web da ' + SITE;
}
