# GTD Executivo — André Delamata

Painel pessoal de tarefas, FUPs (follow-ups), agenda e histórico. Front-end
em JavaScript puro (sem framework, sem build step), dados em
[Supabase](https://supabase.com) (Postgres + Auth + Realtime).

## Arquitetura

- **Front-end**: HTML/CSS/JS puro, ES modules. Hospedado como site estático
  (Vercel).
- **Dados**: Postgres no Supabase, isolado por usuário via Row Level
  Security (cada login só enxerga as próprias linhas).
- **Login**: e-mail/senha via Supabase Auth. Não há cadastro público na
  tela — as contas são criadas pelo painel do Supabase (ver abaixo).
- **Tempo real**: edições em um dispositivo aparecem automaticamente nos
  outros (celular, notebook, abas diferentes) via Supabase Realtime, sem
  precisar recarregar a página.
- **Sem modo offline**: é preciso estar conectado à internet para usar o
  app — os dados não vivem mais no navegador.

A camada `js/database.js` é uma fachada fina sobre um "adapter" trocável:
`js/adapters/indexeddb-adapter.js` (usado só pelos testes automatizados,
`npm test`) e `js/adapters/supabase-adapter.js` (usado pelo app de verdade,
em `js/app.js`). `js/store.js` — onde vive toda a regra de negócio — nunca
sabe qual dos dois está ativo.

## Configuração inicial (uma vez só)

1. **Schema do banco**: abra o [SQL Editor](https://supabase.com/dashboard/project/_/sql)
   do seu projeto Supabase, cole o conteúdo de
   [`supabase/schema.sql`](supabase/schema.sql) e rode. Cria as tabelas, a
   função de geração de ID e as políticas de segurança (RLS). É idempotente
   — pode rodar de novo sem duplicar nada.
2. **Sua conta**: no painel do Supabase, **Authentication → Users → Add
   user**, informe seu e-mail e uma senha. É essa conta que você vai usar
   para logar no app.
3. **Credenciais do front-end**: `js/supabaseClient.js` já aponta para o
   projeto Supabase configurado (Project URL + chave `anon`/pública — essa
   chave é segura de ficar no código, quem protege os dados é o RLS do
   passo 1). Se algum dia trocar de projeto Supabase, atualize os dois
   valores nesse arquivo.

## Rodando localmente (desenvolvimento)

```
npm start
```

Sobe um servidor estático em `http://localhost:8080` (ou use
`start.bat`/`start.ps1` no Windows). O app se conecta ao Supabase pela
internet normalmente — isso só serve os arquivos locais, não guarda dados
localmente.

## Deploy (acesso pelo celular / de qualquer lugar)

1. Repositório já conectado ao GitHub (`delamata/gtd`).
2. No [Vercel](https://vercel.com), "Add New… → Project", importe esse
   repositório.
3. Framework preset: **Other** (sem build command, output = raiz do repo) —
   é um site estático puro.
4. Deploy. Cada push na `main` publica uma nova versão automaticamente.
5. Acesse a URL gerada pelo celular, faça login com a conta criada no passo
   2 da configuração inicial.

## Migrando dados de uma instalação antiga (100% local/IndexedDB)

Se você já tinha dados na versão anterior (só no navegador, sem Supabase):

1. Na instalação **antiga**, vá em Configurações → **"Exportar backup
   completo"** → baixa um `.json`.
2. Abra o app **novo** (URL do Vercel), faça login.
3. Configurações → **"Importar backup"** → selecione o `.json` → modo
   "Substituir todos os dados".

## Testes

```
npm test
```

Roda toda a lógica de negócio (`js/store.js`, `js/backup.js`, `js/audit.js`,
validadores, etc.) contra um IndexedDB em memória
([tests/fake-indexeddb.mjs](tests/fake-indexeddb.mjs)) — sem rede, sem
depender do Supabase estar no ar.
