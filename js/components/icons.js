// ==========================================================================
// icons.js — ícones SVG locais (sem fontes de ícone externas), estilo
// stroke 24x24 semelhante ao usado em painéis executivos.
// ==========================================================================
import { el } from '../utils.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Cada ícone é definido como uma lista de primitivas SVG (tag + atributos).
const ICONS = {
  dashboard: [
    { tag: 'rect', attrs: { x: 3, y: 3, width: 7, height: 9, rx: 1.5 } },
    { tag: 'rect', attrs: { x: 14, y: 3, width: 7, height: 5, rx: 1.5 } },
    { tag: 'rect', attrs: { x: 14, y: 12, width: 7, height: 9, rx: 1.5 } },
    { tag: 'rect', attrs: { x: 3, y: 16, width: 7, height: 5, rx: 1.5 } },
  ],
  today: [
    { tag: 'rect', attrs: { x: 3, y: 4, width: 18, height: 17, rx: 2 } },
    { tag: 'line', attrs: { x1: 3, y1: 9, x2: 21, y2: 9 } },
    { tag: 'path', attrs: { d: 'M8 13l2.5 2.5L16 10' } },
  ],
  tasks: [
    { tag: 'rect', attrs: { x: 3, y: 3, width: 18, height: 18, rx: 2 } },
    { tag: 'path', attrs: { d: 'M8 12l2.5 2.5L16 9' } },
  ],
  fups: [
    { tag: 'path', attrs: { d: 'M21 12a9 9 0 1 1-3-6.7' } },
    { tag: 'path', attrs: { d: 'M21 3v6h-6' } },
  ],
  agenda: [
    { tag: 'rect', attrs: { x: 3, y: 4, width: 18, height: 17, rx: 2 } },
    { tag: 'line', attrs: { x1: 3, y1: 9, x2: 21, y2: 9 } },
    { tag: 'line', attrs: { x1: 8, y1: 2, x2: 8, y2: 6 } },
    { tag: 'line', attrs: { x1: 16, y1: 2, x2: 16, y2: 6 } },
  ],
  collaborators: [
    { tag: 'circle', attrs: { cx: 9, cy: 8, r: 3.2 } },
    { tag: 'path', attrs: { d: 'M3.5 20c0-3.3 2.9-5.5 5.5-5.5s5.5 2.2 5.5 5.5' } },
    { tag: 'circle', attrs: { cx: 17.5, cy: 8.5, r: 2.5 } },
    { tag: 'path', attrs: { d: 'M15.5 14.3c2.6.4 4.7 2.3 4.7 5.7' } },
  ],
  completed: [
    { tag: 'circle', attrs: { cx: 12, cy: 12, r: 9 } },
    { tag: 'path', attrs: { d: 'M8 12.5l2.5 2.5L16 9' } },
  ],
  email: [
    { tag: 'rect', attrs: { x: 3, y: 5, width: 18, height: 14, rx: 2 } },
    { tag: 'path', attrs: { d: 'M4 6.5l8 6.5 8-6.5' } },
  ],
  settings: [
    { tag: 'circle', attrs: { cx: 12, cy: 12, r: 3 } },
    { tag: 'path', attrs: { d: 'M19.4 13a7.7 7.7 0 0 0 0-2l2-1.5-2-3.5-2.4.6a7.6 7.6 0 0 0-1.7-1L14.9 3h-4l-.4 2.6a7.6 7.6 0 0 0-1.7 1l-2.4-.6-2 3.5L6.4 11a7.7 7.7 0 0 0 0 2l-2 1.5 2 3.5 2.4-.6c.5.4 1.1.8 1.7 1l.4 2.6h4l.4-2.6c.6-.2 1.2-.6 1.7-1l2.4.6 2-3.5-2-1.5z' } },
  ],
  search: [
    { tag: 'circle', attrs: { cx: 11, cy: 11, r: 7 } },
    { tag: 'line', attrs: { x1: 21, y1: 21, x2: 16.2, y2: 16.2 } },
  ],
  plus: [
    { tag: 'line', attrs: { x1: 12, y1: 5, x2: 12, y2: 19 } },
    { tag: 'line', attrs: { x1: 5, y1: 12, x2: 19, y2: 12 } },
  ],
  bell: [
    { tag: 'path', attrs: { d: 'M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6' } },
    { tag: 'path', attrs: { d: 'M10 20a2 2 0 0 0 4 0' } },
  ],
  download: [
    { tag: 'path', attrs: { d: 'M12 3v12' } },
    { tag: 'path', attrs: { d: 'M7 10l5 5 5-5' } },
    { tag: 'path', attrs: { d: 'M4 19h16' } },
  ],
  upload: [
    { tag: 'path', attrs: { d: 'M12 21V9' } },
    { tag: 'path', attrs: { d: 'M7 14l5-5 5 5' } },
    { tag: 'path', attrs: { d: 'M4 19h16' } },
  ],
  close: [
    { tag: 'line', attrs: { x1: 6, y1: 6, x2: 18, y2: 18 } },
    { tag: 'line', attrs: { x1: 18, y1: 6, x2: 6, y2: 18 } },
  ],
  edit: [
    { tag: 'path', attrs: { d: 'M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z' } },
    { tag: 'line', attrs: { x1: 14, y1: 6.5, x2: 17.5, y2: 10 } },
  ],
  trash: [
    { tag: 'path', attrs: { d: 'M4 7h16' } },
    { tag: 'path', attrs: { d: 'M9 7V4h6v3' } },
    { tag: 'path', attrs: { d: 'M6 7l1 13h10l1-13' } },
  ],
  archive: [
    { tag: 'rect', attrs: { x: 3, y: 4, width: 18, height: 4, rx: 1 } },
    { tag: 'path', attrs: { d: 'M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8' } },
    { tag: 'line', attrs: { x1: 10, y1: 12, x2: 14, y2: 12 } },
  ],
  'chevron-down': [{ tag: 'path', attrs: { d: 'M6 9l6 6 6-6' } }],
  'chevron-right': [{ tag: 'path', attrs: { d: 'M9 6l6 6-6 6' } }],
  clock: [
    { tag: 'circle', attrs: { cx: 12, cy: 12, r: 9 } },
    { tag: 'path', attrs: { d: 'M12 7v5l3.5 2' } },
  ],
  alert: [
    { tag: 'path', attrs: { d: 'M12 3l10 18H2z' } },
    { tag: 'line', attrs: { x1: 12, y1: 9.5, x2: 12, y2: 14 } },
    { tag: 'circle', attrs: { cx: 12, cy: 17, r: 0.6, fill: 'currentColor' } },
  ],
  filter: [{ tag: 'path', attrs: { d: 'M4 5h16l-6 8v6l-4-2v-4z' } }],
  undo: [
    { tag: 'path', attrs: { d: 'M4 10h11a5 5 0 0 1 0 10h-2' } },
    { tag: 'path', attrs: { d: 'M9 5L4 10l5 5' } },
  ],
  refresh: [
    { tag: 'path', attrs: { d: 'M21 12a9 9 0 1 1-3-6.7' } },
    { tag: 'path', attrs: { d: 'M21 3v6h-6' } },
  ],
  menu: [
    { tag: 'line', attrs: { x1: 3, y1: 6, x2: 21, y2: 6 } },
    { tag: 'line', attrs: { x1: 3, y1: 12, x2: 21, y2: 12 } },
    { tag: 'line', attrs: { x1: 3, y1: 18, x2: 21, y2: 18 } },
  ],
  link: [{ tag: 'path', attrs: { d: 'M7 17L17 7' } }, { tag: 'path', attrs: { d: 'M9 3H3v6' } }, { tag: 'path', attrs: { d: 'M15 21h6v-6' } }],
  inbox: [
    { tag: 'path', attrs: { d: 'M3 12h5l2 3h4l2-3h5' } },
    { tag: 'path', attrs: { d: 'M5.5 5h13l2.5 7v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7z' } },
  ],
  info: [
    { tag: 'circle', attrs: { cx: 12, cy: 12, r: 9 } },
    { tag: 'line', attrs: { x1: 12, y1: 11, x2: 12, y2: 16 } },
    { tag: 'circle', attrs: { cx: 12, cy: 8, r: 0.6, fill: 'currentColor' } },
  ],
  'arrow-right': [{ tag: 'path', attrs: { d: 'M5 12h14' } }, { tag: 'path', attrs: { d: 'M13 6l6 6-6 6' } }],
  send: [{ tag: 'path', attrs: { d: 'M22 2L11 13' } }, { tag: 'path', attrs: { d: 'M22 2l-7 20-4-9-9-4z' } }],
  copy: [
    { tag: 'rect', attrs: { x: 9, y: 9, width: 12, height: 12, rx: 2 } },
    { tag: 'path', attrs: { d: 'M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1' } },
  ],
};

/** Cria (e retorna) um elemento <svg> local para o ícone informado. */
export function icon(name, { size = 18, className = '', strokeWidth = 2 } = {}) {
  const def = ICONS[name] || ICONS.info;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', strokeWidth);
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  if (className) svg.setAttribute('class', className);
  for (const part of def) {
    const node = document.createElementNS(SVG_NS, part.tag);
    for (const [k, v] of Object.entries(part.attrs)) node.setAttribute(k, v);
    svg.appendChild(node);
  }
  return svg;
}

/**
 * Botão compacto só com ícone — o padrão das colunas de ação das tabelas.
 * Estava duplicado (idêntico) em cinco views.
 */
export function iconButton(name, label, onClick) {
  return el('button', { class: 'btn btn--icon btn--sm btn--ghost', type: 'button', 'aria-label': label, title: label, onClick }, [icon(name, { size: 15 })]);
}

// ---------------------------------------------------------------------
// Marca GT
//
// Monograma desenhado como GEOMETRIA (círculo + retângulos), não como
// texto: o ícone antigo usava <text font-family="Arial">, que renderiza
// diferente em cada sistema operacional e some se a fonte não existir.
//
// O G é um anel com a contraforma e a abertura recortadas por <mask> —
// assim a marca fica correta sobre qualquer fundo, inclusive transparente,
// em vez de depender de pintar o fundo por cima. A abertura tem corte
// vertical (e não radial) e é generosa de propósito: a 16px, um vão
// estreito fecha na antialiasing e o G vira um "O".
//
// Os mesmos números estão em assets/icons/*.svg (favicon, ícone do app e
// PNGs de home screen), gerados juntos — ver assets/icons/README.md.
// ---------------------------------------------------------------------
const LOGO = {
  cx: 9.7, cy: 16, rOut: 6.38, rIn: 3.48,   // anel do G (peso 2.90)
  cutX: 12.1,                                // corte vertical da abertura
  tongue: [9.7, 14.55, 6.08, 2.9],           // x, y, largura, altura
  tBar: [17.3, 9.8, 11, 2.9],
  tStem: [21.35, 9.8, 2.9, 12.4],
};

let logoMaskSeq = 0;

/**
 * Monograma "GT" na cor herdada do CSS (currentColor), sem contêiner —
 * quem desenha o quadrado arredondado é a classe que o envolve
 * (.sidebar__brand-mark, .login-screen__brand-mark).
 */
export function logoMark({ size = 32, title = 'GT' } = {}) {
  const maskId = `gt-counter-${++logoMaskSeq}`; // único por instância: a mesma marca pode aparecer duas vezes na página
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', title);
  svg.style.display = 'block';

  const rect = (parent, [x, y, w, h], fill) => {
    const r = document.createElementNS(SVG_NS, 'rect');
    r.setAttribute('x', x); r.setAttribute('y', y);
    r.setAttribute('width', w); r.setAttribute('height', h);
    if (fill) r.setAttribute('fill', fill);
    parent.appendChild(r);
    return r;
  };
  const circle = (parent, cx, cy, r, fill) => {
    const c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', r);
    if (fill) c.setAttribute('fill', fill);
    parent.appendChild(c);
    return c;
  };

  const defs = document.createElementNS(SVG_NS, 'defs');
  const mask = document.createElementNS(SVG_NS, 'mask');
  mask.setAttribute('id', maskId);
  rect(mask, [0, 0, 32, 32], '#fff');                              // mantém tudo
  circle(mask, LOGO.cx, LOGO.cy, LOGO.rIn, '#000');                // recorta a contraforma
  rect(mask, [LOGO.cutX, 0, 32 - LOGO.cutX, LOGO.tongue[1]], '#000'); // recorta a abertura
  defs.appendChild(mask);
  svg.appendChild(defs);

  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('fill', 'currentColor');
  circle(g, LOGO.cx, LOGO.cy, LOGO.rOut).setAttribute('mask', `url(#${maskId})`);
  rect(g, LOGO.tongue);
  rect(g, LOGO.tBar);
  rect(g, LOGO.tStem);
  svg.appendChild(g);
  return svg;
}
