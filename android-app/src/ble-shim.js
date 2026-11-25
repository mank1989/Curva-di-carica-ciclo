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

export function createBluetooth(Ble, hooks = {}) {
  let initP = null;
  const init = () => initP || (initP = Ble.initialize({ androidNeverForLocation: true }).catch(e => { initP = null; throw e; }));
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
      await Ble.connect(this._dev.id, () => this._dropped(), { timeout: 15000 });
      let raw;
      try { raw = await Ble.getServices(this._dev.id); }
      catch (e) { try { await Ble.disconnect(this._dev.id); } catch (e2) { /* ignora */ } throw e; }
      this._services = raw.map(s => new Service(this._dev, s));
      this.connected = true;
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
    async requestDevice(options = {}) {
      await init();
      const req = { optionalServices: (options.optionalServices || []).map(norm) };
      const f = options.filters && options.filters[0];
      if (f) {
        if (f.services) req.services = f.services.map(norm);
        if (f.name) req.name = f.name;
        if (f.namePrefix) req.namePrefix = f.namePrefix;
      }
      const d = await Ble.requestDevice(req);
      let dev = devices.get(d.deviceId);
      if (!dev) { dev = new Device(d.deviceId, d.name); devices.set(d.deviceId, dev); }
      else if (d.name) dev.name = d.name;
      return dev;
    }
  };
}
