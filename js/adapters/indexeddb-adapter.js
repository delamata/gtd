// ==========================================================================
// adapters/indexeddb-adapter.js — acesso ao IndexedDB (abertura, esquema,
// migração). Adapter padrão de js/database.js — usado sempre que
// useSupabase() não é chamado (inclusive por todos os testes automatizados).
// ==========================================================================
// Toda a persistência principal do sistema vive aqui. Nenhuma chamada de
// rede é feita nesta camada — apenas IndexedDB local do navegador.

export const DB_NAME = 'gtd_delamata_db';
// Versão ESTRUTURAL do IndexedDB (object stores / índices). Incrementar
// sempre que uma store ou índice precisar mudar de formato.
export const DB_VERSION = 1;
// Versão LÓGICA do esquema de dados (formato dos registros). Permite migrar
// o *conteúdo* dos registros mesmo sem alterar a estrutura de stores/índices.
export const SCHEMA_VERSION = 1;

export const STORE_NAMES = ['tasks', 'fups', 'agenda', 'collaborators', 'history', 'auditLog', 'meta'];

let dbPromise = null;

function promisifyRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Migrações ESTRUTURAIS do IndexedDB. Cada bloco `if (oldVersion < N)` cria
 * ou ajusta object stores/índices ao subir para a versão N. Nunca remover
 * blocos antigos — eles garantem que bancos criados em versões anteriores
 * cheguem à versão atual corretamente.
 */
function runStructuralMigrations(db, oldVersion) {
  if (oldVersion < 1) {
    const tasks = db.createObjectStore('tasks', { keyPath: 'id' });
    tasks.createIndex('status', 'status');
    tasks.createIndex('prazo', 'prazo');
    tasks.createIndex('responsavel', 'responsavel');
    tasks.createIndex('area', 'area');
    tasks.createIndex('deletedFlag', 'deletedFlag');

    const fups = db.createObjectStore('fups', { keyPath: 'id' });
    fups.createIndex('status', 'status');
    fups.createIndex('colaboradorId', 'colaboradorId');
    fups.createIndex('proximoFupEm', 'proximoFupEm');
    fups.createIndex('area', 'area');
    fups.createIndex('deletedFlag', 'deletedFlag');

    const agenda = db.createObjectStore('agenda', { keyPath: 'id' });
    agenda.createIndex('data', 'data');
    agenda.createIndex('status', 'status');
    agenda.createIndex('deletedFlag', 'deletedFlag');

    const collaborators = db.createObjectStore('collaborators', { keyPath: 'id' });
    collaborators.createIndex('ativo', 'ativo');

    const history = db.createObjectStore('history', { keyPath: 'id' });
    history.createIndex('categoria', 'categoria');
    history.createIndex('dataHora', 'dataHora');
    history.createIndex('responsavel', 'responsavel');
    history.createIndex('area', 'area');

    db.createObjectStore('auditLog', { keyPath: 'id' });
    db.createObjectStore('meta', { keyPath: 'key' });
  }
  // if (oldVersion < 2) { /* futuras alterações estruturais aqui */ }
}

/** Abre (ou reaproveita) a conexão com o IndexedDB. */
export function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('IndexedDB não está disponível neste navegador.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      runStructuralMigrations(req.result, event.oldVersion);
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => console.warn('[database] Abertura bloqueada: feche outras abas do sistema para concluir a atualização.');
  });
  return dbPromise;
}

/**
 * Executa uma transação em uma ou mais stores. O callback recebe o objeto
 * `tx` e deve retornar (ou resolver) o valor desejado. A transação só é
 * considerada concluída no `oncomplete`, garantindo atomicidade real.
 */
export async function withStores(storeNames, mode, callback) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    let result;
    let callbackError = null;
    Promise.resolve()
      .then(() => callback(tx))
      .then((r) => { result = r; })
      .catch((err) => {
        callbackError = err;
        try { tx.abort(); } catch { /* já pode estar finalizada */ }
      });
    tx.oncomplete = () => (callbackError ? reject(callbackError) : resolve(result));
    tx.onerror = () => reject(callbackError || tx.error);
    tx.onabort = () => reject(callbackError || tx.error || new Error('Transação abortada.'));
  });
}

export async function getAll(storeName) {
  return withStores([storeName], 'readonly', (tx) => promisifyRequest(tx.objectStore(storeName).getAll()));
}

export async function getAllByIndex(storeName, indexName, query) {
  return withStores([storeName], 'readonly', (tx) =>
    promisifyRequest(tx.objectStore(storeName).index(indexName).getAll(query))
  );
}

export async function getOne(storeName, key) {
  return withStores([storeName], 'readonly', (tx) => promisifyRequest(tx.objectStore(storeName).get(key)));
}

export async function putOne(storeName, value) {
  return withStores([storeName], 'readwrite', (tx) => promisifyRequest(tx.objectStore(storeName).put(value)));
}

export async function putMany(storeName, values) {
  return withStores([storeName], 'readwrite', async (tx) => {
    const store = tx.objectStore(storeName);
    for (const v of values) store.put(v);
  });
}

export async function clearStore(storeName) {
  return withStores([storeName], 'readwrite', (tx) => promisifyRequest(tx.objectStore(storeName).clear()));
}

export async function clearAllStores() {
  return withStores(STORE_NAMES, 'readwrite', async (tx) => {
    for (const name of STORE_NAMES) tx.objectStore(name).clear();
  });
}

/** Lê o documento único de metadados (contadores de ID, versão do esquema...). */
export async function getMeta() {
  const meta = await getOne('meta', 'app');
  return meta || null;
}

export async function saveMeta(meta) {
  return putOne('meta', { ...meta, key: 'app' });
}

/**
 * Gera o próximo ID sequencial e nunca reutilizado para um prefixo
 * (T = tarefa, F = FUP, A = agenda, C = conclusão, P = colaborador).
 * A leitura+incremento ocorre na MESMA transação readwrite, evitando
 * colisão de IDs mesmo em cliques rápidos sucessivos.
 */
export async function getNextId(prefixLetter) {
  return withStores(['meta'], 'readwrite', async (tx) => {
    const store = tx.objectStore('meta');
    let meta = await promisifyRequest(store.get('app'));
    if (!meta) {
      meta = { key: 'app', schemaVersion: SCHEMA_VERSION, counters: {}, seeded: false, lastBackupAt: '' };
    }
    if (!meta.counters) meta.counters = {};
    const next = (meta.counters[prefixLetter] || 0) + 1;
    meta.counters[prefixLetter] = next;
    store.put(meta);
    return `${prefixLetter}${String(next).padStart(3, '0')}`;
  });
}

/**
 * Migrações LÓGICAS de dados: transformam o *conteúdo* dos registros de uma
 * versão de esquema para outra. Mantidas separadas das migrações estruturais
 * do IndexedDB para permitir evoluir o formato dos dados sem exigir troca de
 * DB_VERSION. Cada função recebe todos os registros de todas as stores e
 * retorna as coleções já migradas.
 */
export const DATA_MIGRATIONS = {
  // Exemplo de uso futuro:
  // 2: (data) => { data.tasks.forEach(t => { if (!t.tags) t.tags = []; }); return data; },
};

/** Aplica migrações lógicas pendentes com base em meta.schemaVersion. */
export async function runDataMigrations() {
  let meta = await getMeta();
  if (!meta) {
    meta = { key: 'app', schemaVersion: SCHEMA_VERSION, counters: {}, seeded: false, lastBackupAt: '' };
    await saveMeta(meta);
    return meta;
  }
  let version = meta.schemaVersion || 1;
  if (version >= SCHEMA_VERSION) return meta;

  const data = {
    tasks: await getAll('tasks'),
    fups: await getAll('fups'),
    agenda: await getAll('agenda'),
    collaborators: await getAll('collaborators'),
    history: await getAll('history'),
  };

  while (version < SCHEMA_VERSION) {
    version += 1;
    const migrate = DATA_MIGRATIONS[version];
    if (migrate) migrate(data);
  }

  await withStores(['tasks', 'fups', 'agenda', 'collaborators', 'history', 'meta'], 'readwrite', async (tx) => {
    for (const t of data.tasks) tx.objectStore('tasks').put(t);
    for (const f of data.fups) tx.objectStore('fups').put(f);
    for (const a of data.agenda) tx.objectStore('agenda').put(a);
    for (const c of data.collaborators) tx.objectStore('collaborators').put(c);
    for (const h of data.history) tx.objectStore('history').put(h);
    meta.schemaVersion = SCHEMA_VERSION;
    tx.objectStore('meta').put(meta);
  });
  return meta;
}

/**
 * Sem equivalente local: o IndexedDB só existe nesta aba/navegador, não há
 * "mudança remota" para escutar. Mantido por simetria com o adapter
 * Supabase (js/adapters/supabase-adapter.js), que usa isso para Realtime.
 */
export function onRemoteChange() {
  return () => {};
}
