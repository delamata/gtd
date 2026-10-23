// ==========================================================================
// supabase-config.js — endereço e chave pública do projeto Supabase.
//
// Separado do supabaseClient.js de propósito: aquele importa o SDK via CDN
// (esm.sh), o que torna qualquer módulo que o importe impossível de rodar
// fora do navegador. Este aqui não tem dependência nenhuma, então a lógica
// de diagnóstico (js/backend-errors.js) pode ser testada em Node.
//
// A "anon key" é uma chave PÚBLICA por design do Supabase: ela não dá
// acesso a nada sozinha — quem protege os dados é o Row Level Security
// configurado em supabase/schema.sql (cada usuário só vê/edita as próprias
// linhas). Por isso é seguro ela estar aqui, em código servido ao navegador.
//
// Trocou de projeto Supabase? Atualize os dois valores abaixo.
// ==========================================================================

export const SUPABASE_URL = 'https://gpslignexvadturgpxjx.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdwc2xpZ25leHZhZHR1cmdweGp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4MzY0ODEsImV4cCI6MjEwMzQxMjQ4MX0.Qj2h8Jo8CfzHTiHmIlyBVc3Lhvorf0KVcEFYqzS5U6c';

/** Referência do projeto (o subdomínio), usada para montar o link do painel. */
export const SUPABASE_PROJECT_REF = SUPABASE_URL.replace('https://', '').split('.')[0];

export const SUPABASE_DASHBOARD_URL = `https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}`;
