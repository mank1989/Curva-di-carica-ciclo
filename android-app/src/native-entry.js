// Punto d'ingresso dell'app Android.
// - index.html (guscio): sceglie la pagina. Di norma apre app.html (la pagina inclusa nell'APK);
//   se è stata scaricata una versione più nuova del sito, la mostra al posto del guscio.
// - app.html: la pagina del sito con questo script in testa; installa il Bluetooth nativo prima che la pagina parta.
// Niente document.write: rompe il canale con cui Android risponde alla pagina.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { BleClient } from '@capacitor-community/bluetooth-le';
import { createBluetooth } from './ble-shim.js';

const SITE = 'https://mank1989.github.io/Curva-di-carica-ciclo/';
const K_HTML = 'nc3000_app_html', K_VER = 'nc3000_app_ver', K_TRIES = 'nc3000_boot_tries', K_BATT = 'nc3000_batt_asked', K_BAD = 'nc3000_app_bad';

const KeepAlive = registerPlugin('KeepAlive');
const ls = {
  get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignora */ } },
  del: k => { try { localStorage.removeItem(k); } catch (e) { /* ignora */ } }
};
const withTimeout = (p, ms) => Promise.race([Promise.resolve(p), new Promise((_, rej) => setTimeout(() => rej(new Error('nessuna risposta in ' + ms / 1000 + ' s')), ms))]);
const errTxt = e => String((e && e.message) || e);

// Dati per capire dove si ferma il Bluetooth (compaiono nel riquadro di errore).
async function diag() {
  const d = { plugin: String(Capacitor.isPluginAvailable('BluetoothLe')), pagina: window.__nc3000Page || '?' };
  try { await withTimeout(KeepAlive.stop(), 3000); d.ponte = 'ok'; } catch (e) { d.ponte = errTxt(e); }
  return d;
}

// ---------- Bluetooth + servizio in primo piano ----------
function installBluetooth() {
  const bt = createBluetooth(BleClient, {
    onConnected: () => {
      KeepAlive.start().catch(() => { /* senza servizio funziona comunque, ma in background può fermarsi */ });
      if (!ls.get(K_BATT)) { ls.set(K_BATT, '1'); KeepAlive.requestBatteryExemption().catch(() => { /* ignora */ }); }
    },
    onDisconnected: () => { KeepAlive.stop().catch(() => { /* ignora */ }); },
    diag
  });
  Object.defineProperty(navigator, 'bluetooth', { value: bt, configurable: true });
}

// ---------- Versioni e aggiornamenti ----------
const verOf = txt => { const m = /nc3000-v(\d+)/.exec(txt || ''); return m ? +m[1] : 0; };
const looksOk = html => typeof html === 'string' && html.length > 100000 && /<html/i.test(html) && /<\/html>\s*$/i.test(html) && html.includes('NC3000');
const bundledVer = () => fetch('version.json').then(r => r.json()).then(v => +v.v || 0).catch(() => 0);

async function checkUpdate(currentVer) {
  try {
    if (!navigator.onLine) return;
    const sw = await fetch(SITE + 'sw.js?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.text() : '');
    const rv = verOf(sw);
    if (!rv || rv <= currentVer || rv === +ls.get(K_BAD)) return;
    const html = await fetch(SITE + 'index.html?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.text() : '');
    if (!looksOk(html)) return;
    ls.set(K_HTML, html); ls.set(K_VER, String(rv)); ls.set(K_TRIES, '0');
    window.__nc3000UpdateReady = rv;                                   // si usa alla prossima apertura dell'app
  } catch (e) { /* senza internet: resta la versione attuale */ }
}

function afterStart(ver) {
  setTimeout(() => ls.set(K_TRIES, '0'), 8000);                        // la pagina è partita: niente ritorno alla versione dell'APK
  setTimeout(() => checkUpdate(ver), 4000);
}

// Mette la pagina scaricata al posto del guscio, senza document.write.
function swapDocument(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = document.importNode(doc.documentElement, true);
  document.replaceChild(root, document.documentElement);
  for (const old of Array.from(root.querySelectorAll('script'))) {     // gli script copiati così non partono: si ricreano, in ordine
    const s = document.createElement('script');
    for (const a of Array.from(old.attributes)) s.setAttribute(a.name, a.value);
    if (old.src) s.async = false;
    s.text = old.textContent;
    old.replaceWith(s);
  }
  window.dispatchEvent(new Event('load'));
}

async function bootShell() {
  const b = await bundledVer();
  const cached = ls.get(K_HTML), cv = +ls.get(K_VER) || 0, tries = +ls.get(K_TRIES) || 0;
  if (cached && cv > b && tries < 2 && looksOk(cached)) {
    ls.set(K_TRIES, String(tries + 1));                                // se non parte due volte di fila si torna a quella dell'APK
    window.__nc3000Page = 'scaricata v' + cv;
    installBluetooth();
    swapDocument(cached);
    afterStart(cv);
    return;
  }
  if (cached) {
    if (cv > b && tries >= 2) ls.set(K_BAD, String(cv));               // versione che non parte: non riscaricarla
    ls.del(K_HTML); ls.del(K_VER); ls.del(K_TRIES);
  }
  location.replace('app.html');
}

async function bootApp() {
  window.__nc3000Page = 'apk';
  installBluetooth();                                                  // subito: la pagina non è ancora partita
  afterStart(await bundledVer());
}

if (!Capacitor.isNativePlatform()) {
  if (window.__nc3000Shell) document.body.textContent = 'Questa è la versione Android: apri la pagina web da ' + SITE;
} else if (window.__nc3000Shell) {
  bootShell().catch(e => { document.body.textContent = 'Errore di avvio: ' + errTxt(e); });
} else {
  bootApp().catch(() => { /* ignora */ });
}
