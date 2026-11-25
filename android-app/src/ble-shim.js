// Fa sembrare il Bluetooth nativo di Android un «navigator.bluetooth» (Web Bluetooth),
// così la pagina NC3000 Monitor funziona senza cambiare una riga della sua logica.
// `Ble` è BleClient di @capacitor-community/bluetooth-le (nei test, un finto).

const norm = u => {
  u = String(u).toLowerCase();
  return /^[0-9a-f]{4}$/.test(u) ? '0000' + u + '-0000-1000-8000-00805f9b34fb' : u;
};
const copyDV = dv => {
  const u8 = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
  return new DataView(u8.slice().buffer);               // copia esatta: byteOffset 0, lunghezza giusta
};
const toDV = v => {
  if (v instanceof DataView) return copyDV(v);
  const u8 = v instanceof ArrayBuffer ? new Uint8Array(v) : new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  return new DataView(u8.slice().buffer);
};


const LAST_KEY = 'nc3000_ble_last';
const lastDevice = () => { try { return JSON.parse(localStorage.getItem(LAST_KEY) || 'null'); } catch (e) { return null; } };

// Messaggio ben visibile (la scritta in alto è troppo corta per leggere gli errori).
function showMsg(text) {
  try {
    const doc = document;
    const ov = doc.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;font-family:sans-serif';
    const box = doc.createElement('div');
    box.style.cssText = 'width:min(92vw,420px);background:#161a22;color:#e8eaed;border-radius:16px;padding:18px;box-sizing:border-box;font-size:15px;line-height:1.4';
    const t = doc.createElement('div'); t.textContent = String(text); t.style.cssText = 'word-break:break-word;white-space:pre-wrap';
    const b = doc.createElement('button'); b.textContent = 'OK';
    b.style.cssText = 'margin-top:14px;width:100%;padding:12px;border-radius:10px;border:0;background:#f5c542;color:#000;font-size:16px;font-weight:700';
    b.onclick = () => ov.remove();
    box.append(t, b); ov.append(box); doc.body.appendChild(ov);
  } catch (e) { /* ignora */ }
}

// Elenco dispositivi disegnato dalla pagina stessa (non dipende dalla finestra nativa del plugin).
function pickDevice(Ble, req) {
  return new Promise((resolve, reject) => {
    const doc = document;
    const ov = doc.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;font-family:sans-serif';
    const box = doc.createElement('div');
    box.style.cssText = 'width:min(92vw,420px);max-height:80vh;overflow:auto;background:#161a22;color:#e8eaed;border-radius:16px;padding:18px;box-sizing:border-box';
    const h = doc.createElement('div'); h.textContent = 'Scegli il caricabatterie'; h.style.cssText = 'font-size:18px;font-weight:700;margin-bottom:6px';
    const st = doc.createElement('div'); st.textContent = 'Ricerca in corso…'; st.style.cssText = 'font-size:14px;color:#9aa0a6;margin-bottom:10px';
    const list = doc.createElement('div');
    const cancel = doc.createElement('button'); cancel.textContent = 'Annulla';
    cancel.style.cssText = 'margin-top:12px;width:100%;padding:12px;border-radius:10px;border:0;background:#2a2f3a;color:#e8eaed;font-size:16px';
    box.append(h, st, list, cancel); ov.append(box); doc.body.appendChild(ov);
    const seen = new Map(), last = lastDevice();
    let done = false, timer = null;
    const finish = (fn, v) => {
      if (done) return; done = true; clearTimeout(timer);
      try { Promise.resolve(Ble.stopLEScan()).catch(() => { /* ignora */ }); } catch (e) { /* ignora */ }
      ov.remove(); fn(v);
    };
    const redraw = () => {
      list.textContent = '';
      const items = [...seen.values()].sort((a, b) => (!!b.name - !!a.name) || ((b.rssi || -999) - (a.rssi || -999)));
      for (const d of items) {
        const b = doc.createElement('button');
        b.textContent = (d.name || 'senza nome') + '  ·  ' + (d.rssi != null ? d.rssi + ' dBm' : '') + (last && last.id === d.id ? '  ·  ultimo usato' : '');
        b.style.cssText = 'display:block;width:100%;text-align:left;margin:6px 0;padding:12px;border-radius:10px;border:1px solid #333a47;background:#1d222c;color:#e8eaed;font-size:16px';
        b.onclick = () => finish(resolve, { deviceId: d.id, name: d.name });
        list.appendChild(b);
      }
      if (items.length) st.textContent = 'Tocca il tuo caricabatterie (NC3000 / Charger)';
    };
    cancel.onclick = () => finish(reject, new Error('cancel'));
    timer = setTimeout(() => { if (!seen.size) st.textContent = 'Nessun dispositivo trovato: accendi il caricabatterie, chiudi l\'app SkyRC e riprova.'; }, 10000);
    const scanReq = { allowDuplicates: false };
    if (req.services) scanReq.services = req.services;
    Promise.resolve(Ble.requestLEScan(scanReq, r => {
      const d = r && r.device; if (!d || !d.deviceId) return;
      seen.set(d.deviceId, { id: d.deviceId, name: d.name || r.localName || '', rssi: r.rssi });
      redraw();
    })).catch(e => { st.textContent = 'Errore ricerca: ' + ((e && e.message) || e); });
  });
}

export function createBluetooth(Ble, hooks = {}) {
  let initP = null;
  const init = () => initP || (initP = Promise.race([
    Ble.initialize({ androidNeverForLocation: true }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('Bluetooth non pronto: controlla i permessi «Dispositivi nelle vicinanze» e che il Bluetooth sia acceso')), 20000))
  ]).catch(e => { initP = null; throw e; }));
  const devices = new Map();

  class Characteristic extends EventTarget {
    constructor(dev, svcUuid, uuid, props) {
      super();
      this._dev = dev; this._svc = svcUuid; this.uuid = uuid; this.properties = props || {}; this.value = null; this._on = false;
    }
    async startNotifications() {
      if (this._on) return this;
      await Ble.startNotifications(this._dev.id, this._svc, this.uuid, dv => {
        this.value = copyDV(dv);
        this.dispatchEvent(new Event('characteristicvaluechanged'));
      });
      this._on = true;
      return this;
    }
    async stopNotifications() {
      if (!this._on) return this;
      this._on = false;
      try { await Ble.stopNotifications(this._dev.id, this._svc, this.uuid); } catch (e) { /* già chiusa */ }
      return this;
    }
    async writeValueWithResponse(v) { await Ble.write(this._dev.id, this._svc, this.uuid, toDV(v)); }
    async writeValueWithoutResponse(v) { await Ble.writeWithoutResponse(this._dev.id, this._svc, this.uuid, toDV(v)); }
    async writeValue(v) {
      if (this.properties.write || !this.properties.writeWithoutResponse) return this.writeValueWithResponse(v);
      return this.writeValueWithoutResponse(v);
    }
  }

  class Service {
    constructor(dev, raw) {
      this._dev = dev; this.uuid = norm(raw.uuid);
      this._chars = (raw.characteristics || []).map(c => new Characteristic(dev, raw.uuid, norm(c.uuid), c.properties));
    }
    async getCharacteristics() { return this._chars.slice(); }
    async getCharacteristic(uuid) {
      const c = this._chars.find(x => x.uuid === norm(uuid));
      if (!c) throw new Error('caratteristica non trovata (' + uuid + ')');
      return c;
    }
  }

  class Gatt {
    constructor(dev) { this._dev = dev; this.connected = false; this._services = []; this.device = dev; }
    async connect() {
      await init();
      try { await Ble.connect(this._dev.id, () => this._dropped(), { timeout: 15000 }); }
      catch (e) { try { await Ble.disconnect(this._dev.id); } catch (e2) { /* ignora */ } throw e; }
      let raw;
      try { raw = await Ble.getServices(this._dev.id); }
      catch (e) { try { await Ble.disconnect(this._dev.id); } catch (e2) { /* ignora */ } throw e; }
      this._services = raw.map(s => new Service(this._dev, s));
      this.connected = true;
      try { localStorage.setItem(LAST_KEY, JSON.stringify({ id: this._dev.id, name: this._dev.name })); } catch (e) { /* ignora */ }
      if (Ble.requestConnectionPriority) { try { await Ble.requestConnectionPriority(this._dev.id, 1); } catch (e) { /* non su tutti i telefoni */ } }
      if (hooks.onConnected) { try { hooks.onConnected(this._dev); } catch (e) { /* ignora */ } }
      return this;
    }
    _dropped() {
      if (!this.connected) return;
      this.connected = false;
      for (const s of this._services) for (const c of s._chars) c._on = false;
      if (hooks.onDisconnected) { try { hooks.onDisconnected(this._dev); } catch (e) { /* ignora */ } }
      this._dev.dispatchEvent(new Event('gattserverdisconnected'));
    }
    disconnect() {
      const was = this.connected;
      Promise.resolve().then(() => Ble.disconnect(this._dev.id)).catch(() => { /* già scollegato */ });
      if (was) this._dropped();
    }
    async getPrimaryServices() { return this._services.slice(); }
    async getPrimaryService(uuid) {
      const s = this._services.find(x => x.uuid === norm(uuid));
      if (!s) throw new Error('servizio non trovato (' + uuid + ')');
      return s;
    }
  }

  class Device extends EventTarget {
    constructor(id, name) { super(); this.id = id; this.name = name || ''; this.gatt = new Gatt(this); }
  }

  return {
    async getAvailability() { return true; },
    async getDevices() {
      const l = lastDevice();
      if (!l || !l.id) return [];
      let dev = devices.get(l.id);
      if (!dev) { dev = new Device(l.id, l.name); devices.set(l.id, dev); }
      return [dev];
    },
    disconnectAll() { for (const d of devices.values()) if (d.gatt.connected) d.gatt.disconnect(); },
    isConnected() { for (const d of devices.values()) if (d.gatt.connected) return true; return false; },
    async requestDevice(options = {}) {
      try { await init(); } catch (e) { showMsg('Bluetooth: ' + ((e && e.message) || JSON.stringify(e))); throw e; }
      const req = { optionalServices: (options.optionalServices || []).map(norm) };
      const f = options.filters && options.filters[0];
      if (f) {
        if (f.services) req.services = f.services.map(norm);
        if (f.name) req.name = f.name;
        if (f.namePrefix) req.namePrefix = f.namePrefix;
      }
      const d = (typeof Ble.requestLEScan === 'function' && typeof document !== 'undefined') ? await pickDevice(Ble, req) : await Ble.requestDevice(req);
      let dev = devices.get(d.deviceId);
      if (!dev) { dev = new Device(d.deviceId, d.name); devices.set(d.deviceId, dev); }
      else if (d.name) dev.name = d.name;
      return dev;
    }
  };
}
