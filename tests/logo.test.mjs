// ==========================================================================
// Testes: a marca GT. A geometria existe em dois lugares — logoMark() em
// js/components/icons.js (usado dentro do app, para herdar a cor do CSS) e
// os arquivos em assets/icons/ (favicon, ícone do app, PNGs). Estes testes
// travam os dois juntos: se um mudar sem o outro, o teste quebra.
// ==========================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// --- DOM mínimo: só o suficiente para logoMark() montar a árvore SVG ---
function fakeElement(tag) {
  return {
    tag,
    attrs: {},
    children: [],
    style: {},
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k]; },
    appendChild(child) { this.children.push(child); return child; },
  };
}
globalThis.document = {
  createElementNS: (_ns, tag) => fakeElement(tag),
  createElement: (tag) => fakeElement(tag),
  createTextNode: (text) => ({ tag: '#text', text }),
};

const { logoMark } = await import('../js/components/icons.js');

/** Achata a árvore em uma lista de formas comparáveis. */
function shapesOf(node, out = [], insideMask = false) {
  for (const child of node.children) {
    const emMask = insideMask || child.tag === 'mask';
    if (child.tag === 'circle') {
      out.push({ em: emMask ? 'mask' : 'arte', tipo: 'circle', cx: +child.attrs.cx, cy: +child.attrs.cy, r: +child.attrs.r });
    } else if (child.tag === 'rect') {
      out.push({ em: emMask ? 'mask' : 'arte', tipo: 'rect', x: +child.attrs.x, y: +child.attrs.y, w: +child.attrs.width, h: +child.attrs.height });
    }
    shapesOf(child, out, emMask);
  }
  return out;
}

/** Mesma extração, mas a partir do arquivo SVG gravado no repo. */
function shapesOfSvg(path) {
  const svg = readFileSync(path, 'utf8');
  const maskBlock = (svg.match(/<mask[\s\S]*?<\/mask>/) || [''])[0];
  const out = [];
  for (const m of svg.matchAll(/<circle[^>]*cx="([\d.]+)"[^>]*cy="([\d.]+)"[^>]*r="([\d.]+)"[^>]*>/g)) {
    out.push({ em: maskBlock.includes(m[0]) ? 'mask' : 'arte', tipo: 'circle', cx: +m[1], cy: +m[2], r: +m[3] });
  }
  // x e y são opcionais no SVG e valem 0 quando ausentes
  for (const m of svg.matchAll(/<rect\b[^>]*>/g)) {
    const attr = (nome) => {
      const achado = m[0].match(new RegExp(`${nome}="([\\d.]+)"`));
      return achado ? +achado[1] : 0;
    };
    out.push({ em: maskBlock.includes(m[0]) ? 'mask' : 'arte', tipo: 'rect', x: attr('x'), y: attr('y'), w: attr('width'), h: attr('height') });
  }
  return out;
}

const chave = (s) => JSON.stringify(s, Object.keys(s).sort());
const conjunto = (lista) => new Set(lista.map(chave));

test('logoMark() monta o monograma: anel mascarado, língua do G, barra e haste do T', () => {
  const formas = shapesOf(logoMark());
  const arte = formas.filter((f) => f.em === 'arte');
  assert.equal(arte.filter((f) => f.tipo === 'circle').length, 1, 'um anel (o bojo do G)');
  assert.equal(arte.filter((f) => f.tipo === 'rect').length, 3, 'língua do G + barra e haste do T');

  const mask = formas.filter((f) => f.em === 'mask');
  assert.ok(mask.some((f) => f.tipo === 'circle'), 'a contraforma do G sai por máscara');
  assert.ok(mask.some((f) => f.tipo === 'rect' && f.w === 32 && f.h === 32), 'a máscara começa mantendo tudo');
});

test('a geometria do JS é idêntica à do logo-mark.svg gravado no repo', () => {
  assert.deepEqual(
    conjunto(shapesOf(logoMark())),
    conjunto(shapesOfSvg('assets/icons/logo-mark.svg')),
    'logoMark() e assets/icons/logo-mark.svg divergiram — altere os dois juntos'
  );
});

test('os dois colorways do ícone do app carregam o mesmo monograma', () => {
  const escuro = shapesOfSvg('assets/icons/app-icon.svg').filter((s) => !(s.tipo === 'rect' && s.w === 32 && s.h === 32 && s.em === 'arte'));
  const claro = shapesOfSvg('assets/icons/app-icon-light.svg').filter((s) => !(s.tipo === 'rect' && s.w === 32 && s.h === 32 && s.em === 'arte'));
  assert.deepEqual(conjunto(escuro), conjunto(claro));
});

test('o anel do G tem contraforma menor que o raio externo, senão vira um disco', () => {
  const arte = shapesOf(logoMark()).filter((f) => f.em === 'arte' && f.tipo === 'circle')[0];
  const contra = shapesOf(logoMark()).filter((f) => f.em === 'mask' && f.tipo === 'circle')[0];
  assert.ok(contra.r < arte.r, 'a contraforma precisa caber dentro do bojo');
  const peso = arte.r - contra.r;
  assert.ok(peso > 2 && peso < 4, `peso do traço fora da faixa legível a 16px: ${peso}`);
});

test('o G transborda a altura do T (overshoot óptico das formas redondas)', () => {
  const formas = shapesOf(logoMark());
  const bojo = formas.find((f) => f.em === 'arte' && f.tipo === 'circle');
  const haste = formas.filter((f) => f.em === 'arte' && f.tipo === 'rect').find((f) => f.h > 10);
  assert.ok(bojo.cy - bojo.r < haste.y, 'o topo do G deve passar do topo do T');
  assert.ok(bojo.cy + bojo.r > haste.y + haste.h, 'a base do G deve passar da base do T');
});

test('a marca cabe na viewBox com margem em todos os lados', () => {
  const formas = shapesOf(logoMark()).filter((f) => f.em === 'arte');
  const xs = formas.flatMap((f) => (f.tipo === 'circle' ? [f.cx - f.r, f.cx + f.r] : [f.x, f.x + f.w]));
  const ys = formas.flatMap((f) => (f.tipo === 'circle' ? [f.cy - f.r, f.cy + f.r] : [f.y, f.y + f.h]));
  assert.ok(Math.min(...xs) > 2.5 && Math.max(...xs) < 29.5, 'margem horizontal insuficiente');
  assert.ok(Math.min(...ys) > 2.5 && Math.max(...ys) < 29.5, 'margem vertical insuficiente');
});

test('duas marcas na mesma página não colidem no id da máscara', () => {
  const idDe = (svg) => svg.children.find((c) => c.tag === 'defs').children[0].attrs.id;
  assert.notEqual(idDe(logoMark()), idDe(logoMark()), 'ids repetidos fariam a segunda marca reusar a máscara da primeira');
});

test('o manifesto aponta para ícones que existem', () => {
  const manifest = JSON.parse(readFileSync('site.webmanifest', 'utf8'));
  assert.ok(manifest.icons.length >= 2);
  for (const ic of manifest.icons) {
    assert.doesNotThrow(() => readFileSync(ic.src), `ícone declarado no manifesto não existe: ${ic.src}`);
  }
});

test('o index.html referencia os arquivos da marca que existem', () => {
  const html = readFileSync('index.html', 'utf8');
  for (const m of html.matchAll(/(?:href|src)="(assets\/icons\/[^"]+|site\.webmanifest)"/g)) {
    assert.doesNotThrow(() => readFileSync(m[1]), `referência quebrada no index.html: ${m[1]}`);
  }
  assert.ok(!html.includes('font-family'), 'o favicon não pode voltar a depender de fonte do sistema');
});
