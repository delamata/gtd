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

## Anotações de reunião (captura)

A etapa de **captura** do GTD: anotar agora, decidir depois. A tela
**Anotações** abre com um campo só e foco automático — escreva durante a
reunião e salve com `Ctrl+Enter`. Data, participantes, área e tags são
opcionais, escondidos atrás de "Detalhes", para a captura não virar
formulário.

Depois, ao processar:

- **Cada linha da anotação pode virar uma tarefa por conta própria.** Passe o
  mouse sobre a linha e clique no `+` — abre o formulário normal de tarefa,
  já com aquela linha no título e a anotação inteira na observação.
- A tarefa criada fica **vinculada** à anotação, então você sabe de qual
  reunião ela nasceu. Uma anotação pode gerar várias tarefas.
- Quem não gera ação nenhuma é marcada como **processada** e sai da caixa de
  entrada, sem virar tarefa.
- A tela abre filtrada em **"A processar"**: é uma caixa de entrada, e o
  objetivo é esvaziá-la.

O Dashboard mostra quantas anotações faltam processar, e a busca global
(`Ctrl+K`) procura dentro do texto delas.

> **Ao atualizar para esta versão, rode de novo o
> [`supabase/schema.sql`](supabase/schema.sql) no SQL Editor** — ele cria a
> tabela `notes`. Sem ela o app não carrega, porque o Dashboard também
> consulta as anotações. É idempotente, pode rodar quantas vezes quiser.

## Quando o app não conecta

Se o login falhar com uma mensagem sobre o servidor não responder, o app
mostra um painel com o diagnóstico e o que fazer. A causa mais comum é o
**projeto Supabase pausado**: no plano gratuito ele hiberna após alguns
dias sem uso, e aí nenhuma requisição chega. Abra o
[painel do projeto](https://supabase.com/dashboard/project/gpslignexvadturgpxjx)
e clique em **Restore project** (leva 1-2 minutos).

A lógica desse diagnóstico fica em
[`js/backend-errors.js`](js/backend-errors.js), separada do
`supabaseClient.js` porque este importa o SDK por CDN — o que impediria os
testes de rodarem. `probeBackend()` sonda o endpoint público de health para
distinguir três coisas que o navegador reporta igual ("Failed to fetch"):
projeto fora do ar, navegador offline e credenciais incorretas.

## Arquivamento e status

- **Arquivar tarefas e FUPs**: o botão de arquivar (ícone de caixa) na
  listagem tira o item de circulação — ele some das telas de Tarefas/FUPs,
  do Dashboard, do Hoje, do foco do dia, da busca global e do e-mail
  executivo. Nada é apagado: o registro continua no banco e o chip
  **"Arquivadas" / "Arquivados"** na barra de filtros mostra só os
  arquivados, com a ação de desarquivar. Também funciona em lote, pela
  barra de seleção múltipla.
- **"Urgente"** existe em dois eixos independentes, ambos em tarefas e
  FUPs:
  - como **status** (o item está pegando fogo agora) — selo vermelho na
    listagem;
  - como **prioridade** (é o mais importante da fila) — acima de "Alta",
    com ponto vermelho-escuro e halo.

  Qualquer um dos dois faz o item contar no card "Urgentes" do Dashboard,
  subir ao topo do "Foco do dia" e entrar na seção "Riscos e bloqueios"
  do e-mail executivo (inclusive com o filtro "Somente urgente / alta
  prioridade" ligado).

> Se o seu banco Supabase foi criado antes desta versão, rode de novo o
> [`supabase/schema.sql`](supabase/schema.sql) no SQL Editor — ele cria a
> coluna `arquivada` que faltava na tabela `fups` (é idempotente, pode
> rodar quantas vezes quiser).

## Configuração inicial (uma vez só)

1. **Schema do banco**: abra o [SQL Editor](https://supabase.com/dashboard/project/_/sql)
   do seu projeto Supabase, cole o conteúdo de
   [`supabase/schema.sql`](supabase/schema.sql) e rode. Cria as tabelas, a
   função de geração de ID e as políticas de segurança (RLS). É idempotente
   — pode rodar de novo sem duplicar nada.
2. **Sua conta**: no painel do Supabase, **Authentication → Users → Add
   user**, informe seu e-mail e uma senha. É essa conta que você vai usar
   para logar no app.
3. **Credenciais do front-end**: [`js/supabase-config.js`](js/supabase-config.js)
   já aponta para o projeto Supabase configurado (Project URL + chave
   `anon`/pública — essa chave é segura de ficar no código, quem protege os
   dados é o RLS do passo 1). Se algum dia trocar de projeto Supabase,
   atualize os dois valores nesse arquivo — é o único lugar onde eles
   aparecem.

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
