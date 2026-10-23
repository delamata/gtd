// ==========================================================================
// Testes: a marca "trajetória ascendente". A geometria existe em dois
// lugares — logoMark() em js/components/icons.js (usado dentro do app) e os
// arquivos em assets/icons/ (favicon, ícone do app, PNGs). Estes testes
// travam os dois juntos: se um mudar sem o outro, quebram.
// ==========================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// --- DOM mínimo: só o que logoMark() precisa para montar a árvore SVG ---
function fakeElement(tag) {
  return {
    tag, attrs: {}, children: [], style: {},
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

const descendants = (node, out = []) => {
  for (const c of node.children) { out.push(c); descendants(c, out); }
  return out;
};
/** Extrai os "d" dos <path> na ordem em que aparecem. */
const pathsOf = (node) => descendants(node).filter((c) => c.tag === 'path').map((c) => c.attrs.d);
const pathsOfSvg = (file) =>
  [...readFileSync(file, 'utf8').matchAll(/<path[^>]*\bd="([^"]+)"/g)].map((m) => m[1]);
/** Números de um "d", para medir a geometria. */
const coords = (d) => {
  const n = d.match(/-?[\d.]+/g).map(Number);
  return n.reduce((acc, _, i) => (i % 2 ? acc : [...acc, [n[i], n[i + 1]]]), []);
};

test('logoMark() monta o símbolo: a trajetória e a ponta da seta', () => {
  const ds = pathsOf(logoMark());
  assert.equal(ds.length, 2, 'uma linha (trajetória) e um triângulo (seta)');
  assert.ok(ds[1].trim().endsWith('Z'), 'a ponta é fechada');
  const linha = descendants(logoMark()).find((c) => c.tag === 'path');
  assert.equal(linha.attrs.fill, 'none', 'a trajetória é traço, não preenchimento');
  assert.equal(linha.attrs['stroke-linecap'], 'round');
  assert.equal(linha.attrs['stroke-linejoin'], 'round');
});

test('sem boxed: herda a cor do CSS, para a sidebar escura', () => {
  const svg = logoMark();
  const [linha, ponta] = descendants(svg).filter((c) => c.tag === 'path');
  assert.equal(linha.attrs.stroke, 'currentColor');
  assert.equal(ponta.attrs.fill, 'currentColor');
  assert.ok(!descendants(svg).some((c) => c.tag === 'rect'), 'sem caixa de fundo');
});

test('com boxed: traz o fundo e os gradientes, igual ao favicon', () => {
  const svg = logoMark({ boxed: true });
  const rect = descendants(svg).find((c) => c.tag === 'rect');
  assert.ok(rect, 'o ícone completo tem fundo');
  assert.equal(rect.attrs.rx, '7');
  assert.equal(descendants(svg).filter((c) => c.tag === 'linearGradient').length, 2);
  assert.equal(descendants(svg).filter((c) => c.tag === 'stop').length, 4);
});

// Compara a GEOMETRIA, não o texto: "17" e "17.0" são o mesmo ponto, e o
// gerador dos SVGs formata os números diferente do JS.
const geometria = (ds) => ds.map(coords);

test('a geometria do JS é idêntica à do logo-mark.svg gravado no repo', () => {
  assert.deepEqual(geometria(pathsOf(logoMark())), geometria(pathsOfSvg('assets/icons/logo-mark.svg')),
    'logoMark() e assets/icons/logo-mark.svg divergiram — altere os dois juntos');
});

test('os dois colorways do ícone do app carregam o mesmo símbolo', () => {
  assert.deepEqual(geometria(pathsOfSvg('assets/icons/app-icon.svg')),
                   geometria(pathsOfSvg('assets/icons/app-icon-light.svg')));
});

test('a trajetória tem um vale: sobe, cai e volta a subir', () => {
  const pts = coords(pathsOf(logoMark())[0]);
  assert.equal(pts.length, 4);
  const sobe = (a, b) => b[1] < a[1]; // y menor = mais alto
  assert.ok(sobe(pts[0], pts[1]), 'primeiro trecho sobe');
  assert.ok(!sobe(pts[1], pts[2]), 'o segundo recua — é o vale que dá leitura de trajetória');
  assert.ok(sobe(pts[2], pts[3]), 'o último sobe');
  assert.ok(pts[3][1] < pts[0][1], 'termina acima de onde começou');
});

test('a seta aponta para cima e para a direita', () => {
  const [[hx, hy], [ax], [, by]] = coords(pathsOf(logoMark())[1]);
  assert.ok(ax < hx, 'um cateto corre para a esquerda');
  assert.ok(by > hy, 'o outro desce — o ângulo reto fica no canto para onde a seta aponta');
  const fim = coords(pathsOf(logoMark())[0]).at(-1);
  assert.ok(fim[0] < hx && fim[1] > hy, 'a linha chega por dentro da ponta');
});

test('a marca cabe na viewBox com margem em todos os lados', () => {
  const pts = pathsOf(logoMark()).flatMap(coords);
  const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1]);
  assert.ok(Math.min(...xs) > 3 && Math.max(...xs) < 29, 'margem horizontal insuficiente');
  assert.ok(Math.min(...ys) > 3 && Math.max(...ys) < 29, 'margem vertical insuficiente');
});

test('duas marcas na mesma página não colidem no id do gradiente', () => {
  const ids = (svg) => descendants(svg).filter((c) => c.tag === 'linearGradient').map((c) => c.attrs.id);
  const a = ids(logoMark({ boxed: true })); const b = ids(logoMark({ boxed: true }));
  assert.equal(a.length, 2);
  assert.ok(a.every((id) => !b.includes(id)), 'ids repetidos fariam a segunda marca reusar o gradiente da primeira');
});

test('o manifesto aponta para ícones que existem', () => {
  const manifest = JSON.parse(readFileSync('site.webmanifest', 'utf8'));
  assert.ok(manifest.icons.length >= 2);
  for (const ic of manifest.icons) {
    assert.doesNotThrow(() => readFileSync(ic.src), `ícone declarado no manifesto não existe: ${ic.src}`);
  }
});

test('o index.html referencia arquivos da marca que existem', () => {
  const html = readFileSync('index.html', 'utf8');
  for (const m of html.matchAll(/(?:href|src)="(assets\/icons\/[^"]+|site\.webmanifest)"/g)) {
    assert.doesNotThrow(() => readFileSync(m[1]), `referência quebrada no index.html: ${m[1]}`);
  }
  assert.ok(!html.includes('font-family'), 'o favicon não pode voltar a depender de fonte do sistema');
});
