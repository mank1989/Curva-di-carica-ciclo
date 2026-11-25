// Punto d'ingresso dell'app Android.
// - index.html (guscio): sceglie la pagina. Di norma apre app.html (la pagina inclusa nell'APK);
//   se è stata scaricata una versione più nuova del sito, la mostra al posto del guscio.
// - app.html: la pagina del sito con questo script in testa; installa il Bluetooth nativo prima che la pagina parta.
// Niente document.write: rompe il canale con cui Android risponde alla pagina.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { BleClient } from '@capacitor-community/bluetooth-le';
import { createBluetooth } from './ble-shim.js';

const SITE = 'https://mank1989.github.io/Curva-di-carica-ciclo/';
const K_HTML = 'nc3000_app_html', K_VER = 'nc3000_app_ver', K_TRIES = 'nc3000_boot_tries', K_PERMS = 'nc3000_perms_asked_v2', K_BAD = 'nc3000_app_bad';

const KeepAlive = registerPlugin('KeepAlive');
const ls = {
  get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignora */ } },
  del: k => { try { localStorage.removeItem(k); } catch (e) { /* ignora */ } }
};
const errTxt = e => String((e && e.message) || e);

// ---------- Bluetooth + servizio in primo piano ----------
let bt = null;
function installBluetooth() {
  bt = createBluetooth(BleClient, {
    onConnected: () => {
      KeepAlive.start().catch(() => { /* senza servizio funziona comunque, ma in background può fermarsi */ });
      if (!ls.get(K_PERMS)) {                                          // la prima volta: notifiche, poi niente risparmio batteria
        ls.set(K_PERMS, '1');
        KeepAlive.requestNotifications().catch(() => { /* ignora */ })
          .then(() => KeepAlive.requestBatteryExemption()).catch(() => { /* ignora */ });
      }
    }
    // a collegamento perso il servizio resta acceso: la pagina riprova da sola e lo ferma lei (release)
  });
  Object.defineProperty(navigator, 'bluetooth', { value: bt, configurable: true });
  // ponte usato dalla pagina per notifiche e servizio
  window.NC3000Native = {
    alert: (title, text, id, always) => { KeepAlive.alert({ title: String(title), text: String(text), id: id || 200, always: !!always }).catch(() => { /* ignora */ }); },
    status: (title, text) => { KeepAlive.status({ title: String(title), text: String(text) }).catch(() => { /* ignora */ }); },
    release: () => { KeepAlive.stop().catch(() => { /* ignora */ }); }
  };
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
    showUpdateBanner(rv);                                              // si usa alla prossima apertura dell'app
  } catch (e) { /* senza internet: resta la versione attuale */ }
}

// Avviso in basso: nuova versione pronta. Se il caricabatterie è collegato non si riavvia nulla.
function showUpdateBanner(v) {
  try {
    const old = document.getElementById('nc3000-upd'); if (old) old.remove();
    const box = document.createElement('div');
    box.id = 'nc3000-upd';
    box.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:2147483646;background:#161a22;color:#e8eaed;' +
      'border:1px solid #f5c542;border-radius:14px;padding:12px 14px;font:15px/1.35 sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.5);display:flex;gap:10px;align-items:center;flex-wrap:wrap';
    const t = document.createElement('div'); t.style.cssText = 'flex:1 1 180px';
    const linked = bt && bt.isConnected();
    t.textContent = 'Nuova versione dell\'app pronta (v' + v + '). ' + (linked ? 'Si attiverà alla prossima apertura.' : 'Riavvia per usarla.');
    const btn = (label, primary, fn) => {
      const b = document.createElement('button'); b.textContent = label; b.onclick = fn;
      b.style.cssText = 'border:0;border-radius:10px;padding:10px 14px;font:600 15px sans-serif;' + (primary ? 'background:#f5c542;color:#000' : 'background:#2a2f3a;color:#e8eaed');
      return b;
    };
    box.append(t);
    if (!linked) box.append(btn('Riavvia ora', true, () => { if (bt) bt.disconnectAll(); KeepAlive.stop().catch(() => { /* ignora */ }); location.replace('index.html'); }));
    box.append(btn(linked ? 'OK' : 'Dopo', false, () => box.remove()));
    document.body.appendChild(box);
  } catch (e) { /* ignora */ }
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
