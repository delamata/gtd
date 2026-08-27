// ==========================================================================
// supabaseClient.js — client único do Supabase (Postgres + Auth + Realtime).
// Importado via CDN ESM (esm.sh), sem bundler — mesmo estilo "zero build
// step" do resto do projeto. Só é importado no navegador (js/app.js e
// js/adapters/supabase-adapter.js), nunca pelos testes automatizados.
//
// A "anon key" abaixo é uma chave PÚBLICA por design do Supabase: ela não
// dá acesso a nada sozinha — quem protege os dados é o Row Level Security
// configurado em supabase/schema.sql (cada usuário só vê/edita as próprias
// linhas). Por isso é seguro ela estar aqui, em código servido ao navegador.
// ==========================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://gpslignexvadturgpxjx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdwc2xpZ25leHZhZHR1cmdweGp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4MzY0ODEsImV4cCI6MjEwMzQxMjQ4MX0.Qj2h8Jo8CfzHTiHmIlyBVc3Lhvorf0KVcEFYqzS5U6c';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
