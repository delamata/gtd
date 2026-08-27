// ==========================================================================
// database.js — fachada fina sobre o "adapter" de persistência ativo.
//
// Por padrão usa o IndexedDB local (js/adapters/indexeddb-adapter.js) — é o
// que os testes automatizados sempre exercitam, sem rede. Em produção,
// js/app.js chama useSupabase(client) antes de store.init() para trocar o
// adapter ativo para o Supabase (js/adapters/supabase-adapter.js), fazendo
// todo o app passar a ler/gravar no Postgres do Supabase em vez do
// navegador local.
//
// O import do adapter Supabase é DINÂMICO (import() dentro de useSupabase)
// de propósito: esse módulo carrega @supabase/supabase-js de uma URL
// https:// (sem bundler), e o Node (usado pelos testes) não sabe resolver
// esse specifier. Como useSupabase() nunca é chamado nos testes, o import
// dinâmico nunca é avaliado lá — os testes continuam 100% offline.
// ==========================================================================
import * as indexeddbAdapter from './adapters/indexeddb-adapter.js';

export const DB_NAME = indexeddbAdapter.DB_NAME;
export const DB_VERSION = indexeddbAdapter.DB_VERSION;
export const SCHEMA_VERSION = indexeddbAdapter.SCHEMA_VERSION;
export const STORE_NAMES = indexeddbAdapter.STORE_NAMES;

let active = indexeddbAdapter;

/** Troca o adapter ativo para o Supabase. Chamado só por js/app.js, com o client já autenticado. */
export async function useSupabase(client) {
  const mod = await import('./adapters/supabase-adapter.js');
  mod.configure(client);
  active = mod;
  return mod;
}

export const openDatabase = (...args) => active.openDatabase(...args);
export const getAll = (...args) => active.getAll(...args);
export const getOne = (...args) => active.getOne(...args);
export const putOne = (...args) => active.putOne(...args);
export const putMany = (...args) => active.putMany(...args);
export const clearStore = (...args) => active.clearStore(...args);
export const clearAllStores = (...args) => active.clearAllStores(...args);
export const getMeta = (...args) => active.getMeta(...args);
export const saveMeta = (...args) => active.saveMeta(...args);
export const getNextId = (...args) => active.getNextId(...args);
export const claimSeed = (...args) => active.claimSeed(...args);
export const runDataMigrations = (...args) => active.runDataMigrations(...args);

/** Assina mudanças feitas por OUTRO dispositivo/aba (Realtime). No-op no adapter local. */
export const onRemoteChange = (...args) => active.onRemoteChange(...args);
