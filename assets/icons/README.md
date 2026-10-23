# Ícones e marca

## Ícones de interface

Os ícones de navegação e ação são gerados localmente em SVG por
[`js/components/icons.js`](../../js/components/icons.js) — nenhuma fonte de
ícone externa, nenhum sprite de CDN.

## A marca GT

O monograma é **geometria**, não texto: um círculo e três retângulos. A versão
anterior usava `<text font-family="Arial">`, que renderiza diferente em cada
sistema operacional e desaparece se a fonte não existir.

Construção (viewBox `0 0 32 32`):

- **G** — anel de peso 2,90 (raio externo 6,38, contraforma 3,48) com a
  contraforma e a abertura recortadas por `<mask>`. A máscara é o que mantém a
  marca correta sobre **qualquer** fundo, inclusive transparente — pintar o
  fundo por cima só funcionaria sobre cor sólida conhecida.
- **Abertura** — corte **vertical** em x = 12,1, não radial: o corte radial
  deixa o G com aspecto de "mordido". A abertura é generosa de propósito —
  testada a 16px, um vão estreito fecha na antialiasing e o G vira um "O".
- **T** — barra e haste de mesmo peso do anel, alinhadas à altura do G.

O G transborda ~0,18 acima e abaixo da altura do T: é o *overshoot* óptico que
formas redondas precisam para parecerem do mesmo tamanho que formas retas.

## Arquivos

| Arquivo | Uso |
|---|---|
| `logo-mark.svg` | Monograma puro, `currentColor`, sem contêiner |
| `app-icon.svg` | Favicon e ícone do app (navy + amarelo) |
| `app-icon-light.svg` | Colorway invertido (fundo amarelo) |
| `apple-touch-icon.png` | 180×180, sem cantos — o iOS aplica a própria máscara |
| `icon-192.png`, `icon-512.png` | Home screen Android, via `site.webmanifest` |

Dentro do app, as marcas da sidebar e do login **não** usam esses arquivos: são
desenhadas por `logoMark()` em `js/components/icons.js`, para herdarem a cor do
CSS. Os números da geometria estão nos dois lugares e precisam ser alterados
juntos — a tabela de constantes em `icons.js` (`LOGO`) é a referência.
