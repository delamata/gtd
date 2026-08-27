// ==========================================================================
// adapters/supabase-adapter.js — mesma API de js/database.js, falando com
// Postgres via Supabase em vez de IndexedDB local. Só é carregado (import
// dinâmico) quando js/database.js#useSupabase(client) é chamado — nunca
// pelos testes automatizados.
//
// Convenção do esquema (ver supabase/schema.sql): as tabelas usam os MESMOS
// nomes de campo em camelCase que js/models.js já usa (ex.: "criadoEm",
// "proximaAcao"), então os registros trafegam quase sem tradução — este
// adapter só soma/filtra por user_id (isolamento por usuário via RLS).
// ==========================================================================
import { STORE_NAMES } from './indexeddb-adapter.js';

let client = null;

export function configure(supabaseClient) {
  client = supabaseClient;
}

async function uid() {
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  const session = data && data.session;
  if (!session) throw new Error('Sessão do Supabase ausente — faça login antes de acessar os dados.');
  return session.user.id;
}

function check(result) {
  if (result.error) throw result.error;
  return result.data;
}

/** Não há "abertura" no Supabase — client já é uma conexão HTTP/WebSocket pronta. */
export async function openDatabase() {
  if (!client) throw new Error('[supabase-adapter] configure(client) não foi chamado.');
  return client;
}

export async function getAll(table) {
  const id = await uid();
  return check(await client.from(table).select('*').eq('user_id', id));
}

export async function getOne(table, key) {
  const id = await uid();
  return check(await client.from(table).select('*').eq('user_id', id).eq('id', key).maybeSingle());
}

export async function putOne(table, value) {
  const id = await uid();
  return check(await client.from(table).upsert({ ...value, user_id: id }).select().maybeSingle());
}

export async function putMany(table, values) {
  const id = await uid();
  if (!values || !values.length) return [];
  return check(await client.from(table).upsert(values.map((v) => ({ ...v, user_id: id }))));
}

export async function clearStore(table) {
  const id = await uid();
  return check(await client.from(table).delete().eq('user_id', id));
}

export async function clearAllStores() {
  const id = await uid();
  for (const table of STORE_NAMES) {
    if (table === 'meta') continue; // meta tem tratamento próprio (getMeta/saveMeta)
    await check(await client.from(table).delete().eq('user_id', id));
  }
}

/**
 * Lê o documento único de metadados (uma linha por usuário na tabela
 * "meta"), incluindo os contadores de ID atuais (lidos de id_counters).
 * `backup.js#recomputeCounters()` depende de `counters` vir preenchido
 * aqui para não reaproveitar IDs ao importar um backup — por isso não dá
 * para simplesmente devolver `{}` como um adapter "burro" faria.
 */
export async function getMeta() {
  const id = await uid();
  const [metaRow, counterRows] = await Promise.all([
    client.from('meta').select('*').eq('user_id', id).maybeSingle().then(check),
    client.from('id_counters').select('prefix, value').eq('user_id', id).then(check),
  ]);
  if (!metaRow) return null;
  const counters = {};
  for (const c of counterRows || []) counters[c.prefix] = c.value;
  return {
    key: 'app',
    schemaVersion: metaRow.schemaVersion,
    seeded: metaRow.seeded,
    lastBackupAt: metaRow.lastBackupAt || '',
    counters,
  };
}

export async function saveMeta(meta) {
  const id = await uid();
  check(await client.from('meta').upsert({
    user_id: id,
    schemaVersion: meta.schemaVersion,
    seeded: !!meta.seeded,
    lastBackupAt: meta.lastBackupAt || '',
  }));
  // Sincroniza id_counters com os contadores recomputados (ex.: depois de
  // importar um backup) para que getNextId() nunca reaproveite um ID já
  // usado nos dados importados.
  const entries = Object.entries(meta.counters || {});
  if (entries.length) {
    check(await client.from('id_counters').upsert(
      entries.map(([prefix, value]) => ({ user_id: id, prefix, value }))
    ));
  }
}

/**
 * Gera o próximo ID sequencial e nunca reutilizado para um prefixo, via a
 * função Postgres next_id() (supabase/schema.sql) — o incremento atômico
 * roda no servidor (lock de linha), equivalente à transação readwrite do
 * IndexedDB usada pelo adapter local.
 */
export async function getNextId(prefixLetter) {
  const { data, error } = await client.rpc('next_id', { p_prefix: prefixLetter });
  if (error) throw error;
  return data;
}

/** Hoje SCHEMA_VERSION = 1 e não há migração de dados pendente; garante que a linha de meta exista. */
export async function runDataMigrations() {
  const meta = await getMeta();
  if (!meta) {
    const fresh = { schemaVersion: 1, seeded: false, lastBackupAt: '' };
    await saveMeta(fresh);
    return { key: 'app', ...fresh, counters: {} };
  }
  return meta;
}

/**
 * Assina, via Supabase Realtime, mudanças feitas por OUTRO dispositivo/aba
 * nas tabelas de negócio do usuário logado, chamando `callback()` a cada
 * evento (INSERT/UPDATE/DELETE). Quem decide o que fazer com isso é
 * js/store.js — normalmente apenas re-consultar e re-renderizar.
 */
export function onRemoteChange(callback) {
  let channel = null;
  uid().then((id) => {
    channel = client.channel(`gtd-changes-${id}`);
    const tables = STORE_NAMES.filter((t) => t !== 'meta' && t !== 'auditLog');
    for (const table of tables) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `user_id=eq.${id}` },
        () => callback()
      );
    }
    channel.subscribe();
  }).catch((err) => console.error('[supabase-adapter] falha ao assinar Realtime', err));
  return () => { if (channel) client.removeChannel(channel); };
}
