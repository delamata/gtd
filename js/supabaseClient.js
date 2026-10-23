// ==========================================================================
// supabaseClient.js — client único do Supabase (Postgres + Auth + Realtime).
// Importado via CDN ESM (esm.sh), sem bundler — mesmo estilo "zero build
// step" do resto do projeto. Só é importado no navegador (js/app.js,
// js/views/login.js e js/adapters/supabase-adapter.js), nunca pelos testes
// automatizados: por isso o endereço do projeto mora em supabase-config.js
// e o diagnóstico de erros em backend-errors.js, ambos sem dependências.
// ==========================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
