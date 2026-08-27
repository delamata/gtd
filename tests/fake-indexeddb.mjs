// ==========================================================================
// fake-indexeddb.mjs — implementação mínima de IndexedDB em memória, usada
// SOMENTE nos testes automatizados (Node não possui IndexedDB nativo).
// Reproduz o suficiente da API para exercitar js/database.js sem alterações.
// ==========================================================================

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

class FakeRequest {
  constructor() {
    this.result = undefined;
    this.error = null;
    this.onsuccess = null;
    this.onerror = null;
  }
  _succeed(result) {
    this.result = result;
    queueMicrotask(() => { if (this.onsuccess) this.onsuccess({ target: this }); });
  }
  _fail(error) {
    this.error = error;
    queueMicrotask(() => { if (this.onerror) this.onerror({ target: this }); });
  }
}

class FakeIndex {
  constructor(store, keyPath) {
    this.store = store;
    this.keyPath = keyPath;
  }
  getAll(query) {
    const req = new FakeRequest();
    const all = [...this.store._data.values()].map(clone);
    const result = query === undefined ? all : all.filter((r) => r[this.keyPath] === query);
    req._succeed(result);
    return req;
  }
}

class FakeObjectStore {
  constructor(name, keyPath) {
    this.name = name;
    this.keyPath = keyPath;
    this._data = new Map();
    this._indexes = new Map();
  }
  createIndex(name, keyPath) {
    this._indexes.set(name, new FakeIndex(this, keyPath));
  }
  index(name) {
    const idx = this._indexes.get(name);
    if (!idx) throw new Error(`Índice "${name}" não existe em "${this.name}".`);
    return idx;
  }
  get(key) {
    const req = new FakeRequest();
    req._succeed(clone(this._data.get(key)));
    return req;
  }
  getAll() {
    const req = new FakeRequest();
    req._succeed([...this._data.values()].map(clone));
    return req;
  }
  put(value) {
    const req = new FakeRequest();
    const key = value[this.keyPath];
    this._data.set(key, clone(value));
    req._succeed(key);
    return req;
  }
  add(value) {
    return this.put(value);
  }
  delete(key) {
    const req = new FakeRequest();
    this._data.delete(key);
    req._succeed(undefined);
    return req;
  }
  clear() {
    const req = new FakeRequest();
    this._data.clear();
    req._succeed(undefined);
    return req;
  }
}

class FakeTransaction {
  constructor(db, storeNames, mode) {
    this.db = db;
    this.storeNames = storeNames;
    this.mode = mode;
    this.oncomplete = null;
    this.onerror = null;
    this.onabort = null;
    this._active = true;
    // A transação "fecha" no próximo tick de macrotask, após todas as
    // microtasks (awaits encadeados em requests) já terem sido resolvidas —
    // aproxima o comportamento real do IndexedDB nos navegadores alvo.
    setTimeout(() => {
      if (this._active) {
        this._active = false;
        if (this.oncomplete) this.oncomplete({ target: this });
      }
    }, 0);
  }
  objectStore(name) {
    if (!this.storeNames.includes(name)) throw new Error(`Store "${name}" não incluída na transação.`);
    return this.db._stores.get(name);
  }
  abort() {
    if (!this._active) return;
    this._active = false;
    queueMicrotask(() => { if (this.onabort) this.onabort({ target: this }); });
  }
}

class FakeIDBDatabase {
  constructor(name, version) {
    this.name = name;
    this.version = version;
    this._stores = new Map();
    this.onversionchange = null;
  }
  createObjectStore(name, { keyPath } = {}) {
    const store = new FakeObjectStore(name, keyPath);
    this._stores.set(name, store);
    return store;
  }
  transaction(storeNames, mode) {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    return new FakeTransaction(this, names, mode);
  }
  close() {}
}

export function createFakeIndexedDB() {
  const databases = new Map();
  return {
    open(name, version) {
      const req = new FakeRequest();
      queueMicrotask(() => {
        let dbEntry = databases.get(name);
        const oldVersion = dbEntry ? dbEntry.version : 0;
        const isNew = !dbEntry;
        if (!dbEntry) {
          dbEntry = new FakeIDBDatabase(name, version);
          databases.set(name, dbEntry);
        } else {
          dbEntry.version = version;
        }
        req.result = dbEntry;
        if (isNew || oldVersion < version) {
          if (req.onupgradeneeded) req.onupgradeneeded({ oldVersion, newVersion: version, target: req });
        }
        req._succeed(dbEntry);
      });
      return req;
    },
    deleteDatabase(name) {
      const req = new FakeRequest();
      databases.delete(name);
      req._succeed(undefined);
      return req;
    },
    _reset() { databases.clear(); },
  };
}

/** Instala uma instância nova e isolada de IndexedDB fake no `globalThis`. */
export function installFakeIndexedDB() {
  const fake = createFakeIndexedDB();
  globalThis.indexedDB = fake;
  return fake;
}
