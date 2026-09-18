// ==========================================================================
// dashboard.js — geração de indicadores visuais (SVG puro, sem bibliotecas)
// ==========================================================================
const SVG_NS = 'http://www.w3.org/2000/svg';

export const PRIORITY_COLORS = { urgente: '#7A0C16', alta: '#B3261E', media: '#8A5A00', baixa: '#1E7A3E', 'não definido': '#B7C6D1' };
export const STATUS_COLORS = {
  urgente: '#B3261E', a_fazer: '#1E425F', em_andamento: '#1E425F', aguardando_retorno: '#8A5A00', a_confirmar: '#8A5A00',
  nao_iniciado: '#B7C6D1', nao_agendada: '#B7C6D1', agendado: '#1E425F', concluido: '#1E7A3E', cancelado: '#B7C6D1',
};
export const PALETTE = ['#122B40', '#1E425F', '#FFD400', '#8A5A00', '#1E7A3E', '#B3261E', '#5B4B8A', '#0E7C86'];

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

/** Gráfico de rosca (donut) sem dependências — usado para distribuição por status/prioridade. */
export function buildDonutChart(segments, { size = 120, thickness = 16 } = {}) {
  const total = segments.reduce((s, d) => s + d.value, 0);
  const svg = svgEl('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, role: 'img' });
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  svg.appendChild(svgEl('circle', { cx, cy, r, fill: 'none', stroke: '#EAF3F8', 'stroke-width': thickness }));

  if (total > 0) {
    let offset = 0;
    for (const seg of segments) {
      if (!seg.value) continue;
      const frac = seg.value / total;
      const circle = svgEl('circle', {
        cx, cy, r, fill: 'none', stroke: seg.color, 'stroke-width': thickness,
        'stroke-dasharray': `${frac * circumference} ${circumference}`,
        'stroke-dashoffset': String(-offset),
        transform: `rotate(-90 ${cx} ${cy})`,
        'stroke-linecap': segments.filter((s) => s.value).length > 1 ? 'butt' : 'round',
      });
      svg.appendChild(circle);
      offset += frac * circumference;
    }
  }
  const text = svgEl('text', { x: cx, y: cy, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 20, 'font-weight': 700, fill: '#122B40' });
  text.textContent = String(total);
  svg.appendChild(text);
  return svg;
}

/** Gráfico de barras horizontais — usado para FUPs por colaborador e itens atrasados por área. */
export function buildHorizontalBarChart(items, { width = 280, barHeight = 20, gap = 10, labelWidth = 96 } = {}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const chartWidth = width - labelWidth - 36;
  const height = items.length * (barHeight + gap) || barHeight;
  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', height, role: 'img' });

  items.forEach((item, idx) => {
    const y = idx * (barHeight + gap);
    const barW = Math.max(2, (item.value / max) * chartWidth);
    const label = svgEl('text', { x: 0, y: y + barHeight / 2 + 4, 'font-size': 11, fill: '#52697D' });
    label.textContent = item.label.length > 16 ? item.label.slice(0, 15) + '…' : item.label;
    svg.appendChild(label);

    svg.appendChild(svgEl('rect', { x: labelWidth, y, width: chartWidth, height: barHeight, rx: 4, fill: '#EAF3F8' }));
    svg.appendChild(svgEl('rect', { x: labelWidth, y, width: barW, height: barHeight, rx: 4, fill: item.color || '#1E425F' }));

    const value = svgEl('text', { x: labelWidth + chartWidth + 8, y: y + barHeight / 2 + 4, 'font-size': 11, 'font-weight': 700, fill: '#122B40' });
    value.textContent = String(item.value);
    svg.appendChild(value);
  });
  return svg;
}

/** Gráfico de barras verticais — usado para conclusões dos últimos 7 dias. */
export function buildVerticalBarChart(items, { width = 280, height = 100, barGap = 8 } = {}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const barWidth = (width - barGap * (items.length - 1)) / items.length;
  const chartHeight = height - 20;
  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', height, role: 'img' });

  items.forEach((item, idx) => {
    const x = idx * (barWidth + barGap);
    const barH = Math.max(2, (item.value / max) * chartHeight);
    const y = chartHeight - barH;
    svg.appendChild(svgEl('rect', { x, y, width: barWidth, height: barH, rx: 3, fill: item.color || '#1E425F' }));
    if (item.value) {
      const value = svgEl('text', { x: x + barWidth / 2, y: y - 4, 'font-size': 10, 'font-weight': 700, 'text-anchor': 'middle', fill: '#122B40' });
      value.textContent = String(item.value);
      svg.appendChild(value);
    }
    const label = svgEl('text', { x: x + barWidth / 2, y: height - 4, 'font-size': 9, 'text-anchor': 'middle', fill: '#52697D' });
    label.textContent = item.label;
    svg.appendChild(label);
  });
  return svg;
}

/** Constrói a legenda textual (lista de cor + rótulo + valor) que acompanha os gráficos. */
export function buildLegend(segments) {
  const wrap = document.createElement('div');
  wrap.className = 'chart-legend';
  for (const seg of segments) {
    const item = document.createElement('span');
    item.className = 'chart-legend__item';
    const swatch = document.createElement('span');
    swatch.className = 'chart-legend__swatch';
    swatch.style.background = seg.color;
    item.appendChild(swatch);
    item.appendChild(document.createTextNode(`${seg.label} (${seg.value})`));
    wrap.appendChild(item);
  }
  return wrap;
}
