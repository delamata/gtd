# Ícones e marca

## Ícones de interface

Os ícones de navegação e ação são gerados localmente em SVG por
[`js/components/icons.js`](../../js/components/icons.js) — nenhuma fonte de
ícone externa, nenhum sprite de CDN.

## A marca — "trajetória ascendente"

Uma linha que sobe, recua e volta a subir, terminando em seta: progresso e
retomada, que é do que o painel trata. Conversa com os gráficos de linha do
dashboard.

O "GT" saiu do ícone porque o nome da marca sempre aparece em texto ao lado
dele (sidebar e login), e porque duas letras em 16px competem por espaço com
qualquer símbolo.

Decisões que vieram de testar nos tamanhos reais de uso, não no papel:

- **O vale no meio do percurso é proposital.** Uma diagonal reta vira seta
  genérica de sistema; o recuo dá leitura de trajetória real.
- **Traço 3,2 e ponta 7,4.** Mais fino perde corpo a 16px; mais grosso
  fecha o vale e o símbolo vira um borrão.
- **Ângulo reto da ponta no canto para onde a seta aponta.** Na primeira
  versão ele estava no canto oposto e a seta parecia apontar para baixo.
- **Alternativas descartadas:** anel que vira seta (lê-se "recarregar"),
  chevrons ascendentes (lê-se "voltar ao topo"), estrela de quatro pontas
  (virou clichê de "sparkle de IA") e o monograma GT anterior (chapado).

### Cores

| | |
|---|---|
| Fundo | `#0A1C2B` → `#1E425F`, diagonal |
| Símbolo | `#FFD400` → `#FFE77A`, da base para o topo |

## Arquivos

| Arquivo | Uso |
|---|---|
| `logo-mark.svg` | Símbolo puro, `currentColor`, sem fundo |
| `app-icon.svg` | Favicon e ícone do app (gradientes) |
| `app-icon-light.svg` | Colorway invertido (fundo amarelo) |
| `apple-touch-icon.png` | 180×180, sem cantos — o iOS aplica a própria máscara |
| `icon-192.png`, `icon-512.png` | Home screen Android, via `site.webmanifest` |

Dentro do app as marcas vêm de `logoMark()` em `js/components/icons.js`, não
destes arquivos:

- **Sidebar** (fundo escuro): `logoMark()` — só o símbolo, herdando o amarelo
  do CSS. Sem caixa, porque um fundo navy sobre a barra navy sumiria.
- **Login** (cartão branco): `logoMark({ boxed: true })` — o ícone completo,
  idêntico ao favicon.

A geometria está nos dois lugares (`icons.js` e os SVGs) e precisa ser
alterada junto. [`tests/logo.test.mjs`](../../tests/logo.test.mjs) compara os
dois ponto a ponto e quebra se divergirem.
