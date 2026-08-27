// ==========================================================================
// seed-data.js — carga inicial de dados (usada apenas na primeira execução,
// quando o banco local está vazio, ou ao restaurar os dados de exemplo em
// Configurações).
//
// Observação sobre IDs: os números usados aqui refletem apenas a ORDEM de
// criação. Os IDs reais (T001, F001, A001...) são gerados pelo sistema no
// momento da semeadura, de forma sequencial e nunca reaproveitada.
// ==========================================================================

export const SEED_COLLABORATORS = [
  { nome: 'André', time: 'Growth & Analytics', cargo: 'Head de Growth e Analytics', cor: '#122B40', observacoes: 'Responsável geral pela área.' },
  { nome: 'Renan', time: 'Analytics', cargo: 'Analytics', cor: '#1E425F' },
  { nome: 'Fábio', time: 'Growth', cargo: 'Growth', cor: '#8A5A00' },
  { nome: 'David', time: 'Produto', cargo: 'Produto', cor: '#1E7A3E' },
  { nome: 'Time do Perez', time: 'Metabuscadores', cargo: 'Squad parceira', cor: '#B3261E' },
  { nome: 'A definir', time: '', cargo: '', cor: '#52697D', observacoes: 'Usar quando o responsável pelo retorno ainda não foi definido.' },
];

// Tarefas abertas ------------------------------------------------------
export const SEED_TASKS = [
  {
    titulo: 'Finalizar e encaminhar os dados do SendGrid para Amanda',
    area: 'Martech / SendGrid',
    responsavel: 'André',
    prioridade: 'alta',
    status: 'em_andamento',
    proximaAcao: 'Consolidar os dados, enviar para Amanda e encerrar a demanda.',
  },
  {
    titulo: 'Validar os dados dos KPIs do Aéreo',
    area: 'Analytics / Aéreo',
    responsavel: 'André',
    prioridade: 'alta',
    status: 'a_fazer',
    proximaAcao: 'Checar consistência, divergências e pontos que exigem correção.',
  },
  {
    titulo: 'Preparar pauta e pendências para a reunião com a Primelis',
    area: 'Primelis',
    responsavel: 'André',
    prioridade: 'media',
    status: 'a_fazer',
    proximaAcao: 'Organizar pauta, pendências e decisões necessárias.',
  },
  {
    titulo: 'Criar um modelo de feedback 1:1 para o time',
    area: 'Gestão de Pessoas',
    responsavel: 'André',
    prioridade: 'media',
    status: 'a_fazer',
    proximaAcao: 'Definir estrutura, perguntas e registro de próximos passos.',
  },
  {
    titulo: 'Negociar Pacotes no Skyscanner',
    area: 'Metabuscadores',
    responsavel: 'André',
    prioridade: 'alta',
    status: 'a_fazer',
    prazo: '2026-09-30',
    proximaAcao: 'Identificar e agendar reunião com o responsável da Skyscanner por Pacotes.',
  },
];

// FUPs abertos -----------------------------------------------------------
export const SEED_FUPS = [
  {
    colaboradorNome: 'Time do Perez',
    area: 'Metabuscadores',
    assunto: 'Correção do Amadeus para Metabuscadores',
    prioridade: 'alta',
    status: 'a_fazer',
    proximaAcao: 'Cobrar status, bloqueios, responsável e prazo.',
  },
  {
    colaboradorNome: 'David',
    area: 'Produto',
    assunto: 'Implementação do Push do Melhores Destinos',
    prioridade: 'alta',
    status: 'a_fazer',
    proximaAcao: 'Confirmar andamento e previsão de conclusão.',
  },
  {
    colaboradorNome: 'A definir',
    area: 'Metabuscadores',
    assunto: 'Implementação do Trivago',
    prioridade: 'alta',
    proximoFupEm: '2026-08-28',
    proximaAcao: 'Validar status contratual, financeiro e técnico.',
  },
  {
    colaboradorNome: 'A definir',
    area: 'Metabuscadores',
    assunto: 'Implementação do Google Flights',
    prioridade: 'alta',
    proximoFupEm: '2026-08-28',
    proximaAcao: 'Verificar etapa, pendências e cronograma.',
  },
  {
    colaboradorNome: 'Renan',
    area: 'Analytics / Aéreo',
    assunto: 'Novo modelo de KPI exclusivo para o Aéreo',
    prioridade: 'alta',
    status: 'em_andamento',
    proximaAcao: 'Validar versão com os últimos dois meses.',
  },
  {
    colaboradorNome: 'Renan',
    area: 'Analytics',
    assunto: 'Warnings de busca vazia',
    prioridade: 'alta',
    status: 'a_confirmar',
    proximaAcao: 'Documentar causa, impacto e correção.',
  },
  {
    colaboradorNome: 'Renan',
    area: 'Metabuscadores / Skyscanner',
    assunto: 'Pre-conversion do Skyscanner fora do padrão',
    prioridade: 'alta',
    status: 'a_confirmar',
    proximaAcao: 'Abrir chamado no Skyscanner e identificar possíveis causas.',
  },
  {
    colaboradorNome: 'Renan',
    area: 'Martech / Vitrio',
    assunto: 'Documentação encaminhada para a Vitrio',
    prioridade: 'media',
    status: 'aguardando_retorno',
    proximaAcao: 'Confirmar recebimento e cobrar retorno.',
  },
  {
    colaboradorNome: 'Renan',
    area: 'Analytics / Real Time',
    assunto: 'Criar gráfico da companhia aérea no painel Real Time',
    prioridade: 'media',
    status: 'em_andamento',
    observacao: 'Inclusão da companhia aérea já implementada.',
  },
  {
    colaboradorNome: 'Renan',
    area: 'Analytics / Real Time',
    assunto: 'Corrigir o fuso horário GMT do Real Time',
    prioridade: 'media',
    status: 'nao_iniciado',
    proximaAcao: 'Diagnosticar a divergência e ajustar o fuso.',
  },
  {
    colaboradorNome: 'Fábio',
    area: 'Growth',
    assunto: 'Novos testes A/B',
    prioridade: 'alta',
    status: 'a_confirmar',
    proximaAcao: 'Solicitar hipóteses, métricas e cronograma.',
  },
  {
    colaboradorNome: 'Fábio',
    area: 'Martech / CMS',
    assunto: 'Novo payload do CMS',
    prioridade: 'alta',
    status: 'a_confirmar',
    proximaAcao: 'Verificar andamento, bloqueios e prazo.',
  },
  {
    colaboradorNome: 'Fábio',
    area: 'Gestão de Pessoas',
    assunto: 'Marcar reunião 1:1',
    prioridade: 'media',
    status: 'nao_agendada',
    proximaAcao: 'Alinhar disponibilidade e agendar.',
  },
];

// Histórico inicial de concluídas -----------------------------------------
export const SEED_HISTORY = [
  { dataHora: '2026-08-19T10:00:00', categoria: 'tarefa', area: 'Martech / Bing', atividade: 'Tagueamento do Bing', responsavel: 'André', resultado: 'Implementado e validado.' },
  { dataHora: '2026-08-20T11:30:00', categoria: 'fup', area: 'Martech / Datalive', atividade: 'Cobrança da implementação do Datalive', responsavel: 'André', resultado: 'Retorno recebido; implementação confirmada pelo fornecedor.' },
  { dataHora: '2026-08-21T09:15:00', categoria: 'tarefa', area: 'Analytics / GA4', atividade: 'Correção do evento view_item_list', responsavel: 'André', resultado: 'O modelo de disparo foi alterado. O evento estava sendo acionado em duplicidade e agora é disparado apenas uma vez por sessão.' },
  { dataHora: '2026-08-18T14:00:00', categoria: 'tarefa', area: 'Growth / Mídia', atividade: 'Validação do incremento de verba de Growth', responsavel: 'André', resultado: 'Pacing ajustado para R$ 30 mil por dia.' },
  { dataHora: '2026-08-25T09:00:00', categoria: 'agenda', area: 'Rituais', atividade: 'Daily Site', responsavel: 'André', resultado: 'Alinhamento realizado, sem bloqueios.' },
  { dataHora: '2026-08-25T09:30:00', categoria: 'agenda', area: 'Rituais', atividade: 'Daily JBQ', responsavel: 'André', resultado: 'Alinhamento realizado.' },
  { dataHora: '2026-08-26T09:00:00', categoria: 'agenda', area: 'Rituais', atividade: 'Daily Growth', responsavel: 'André', resultado: 'Prioridades da semana revisadas.' },
  { dataHora: '2026-08-24T15:00:00', categoria: 'agenda', area: 'Metabuscadores', atividade: 'CVC & Skyscanner', responsavel: 'André', resultado: 'Reunião realizada; pauta de pacotes em andamento.' },
  { dataHora: '2026-08-25T18:00:00', categoria: 'tarefa', area: 'Metabuscadores', atividade: 'Acompanhamento das vendas dos metabuscadores em 25/08', responsavel: 'André', resultado: 'Volume dentro do esperado.' },
  { dataHora: '2026-08-26T18:00:00', categoria: 'tarefa', area: 'Metabuscadores', atividade: 'Acompanhamento das vendas dos metabuscadores em 26/08', responsavel: 'André', resultado: 'Volume dentro do esperado, sem desvios relevantes.' },
  { dataHora: '2026-08-22T16:00:00', categoria: 'tarefa', area: 'Ads / Aéreo', atividade: 'Relatório de Ads com desempenho por rota', responsavel: 'André', resultado: 'Relatório concluído e compartilhado com o time.' },
];
