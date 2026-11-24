/* Egyszerű SVG vonaldiagram trendvonallal (meccsenkénti értékekhez). */
(function (D) {
  'use strict';

  function lineChart(values, opts) {
    opts = Object.assign({ w: 340, h: 150, color: '#4aa3ff', fmt: v => v.toFixed(1), title: '' }, opts || {});
    const pts = values.map((v, i) => [i, v]).filter(p => p[1] !== null && p[1] !== undefined && !isNaN(p[1]));
    const W = opts.w, H = opts.h, pl = 34, pr = 8, pt = 10, pb = 18;
    if (pts.length < 2) {
      return `<svg viewBox="0 0 ${W} ${H}" role="img"><text x="${W / 2}" y="${H / 2}" fill="#93a0bf" font-size="12" text-anchor="middle">Legalább 2 meccs kell a trendhez</text></svg>`;
    }
    let min = Math.min.apply(null, pts.map(p => p[1])), max = Math.max.apply(null, pts.map(p => p[1]));
    if (opts.min !== undefined) min = Math.min(min, opts.min);
    if (max - min < 1e-9) { max += 1; min -= 1; }
    const pad = (max - min) * 0.1; min -= pad; max += pad;
    if (opts.min !== undefined) min = Math.max(min, opts.min);
    const n = values.length;
    const X = i => pl + (n <= 1 ? 0 : i / (n - 1)) * (W - pl - pr);
    const Y = v => pt + (1 - (v - min) / (max - min)) * (H - pt - pb);
    // rács
    let g = '';
    for (let k = 0; k <= 3; k++) {
      const v = min + (max - min) * k / 3, y = Y(v);
      g += `<line x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}" stroke="#2a3557" stroke-width="1"/>`;
      g += `<text x="${pl - 4}" y="${y + 3}" fill="#93a0bf" font-size="10" text-anchor="end">${opts.fmt(v)}</text>`;
    }
    const path = pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join(' ');
    const dots = pts.map(p => `<circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="3" fill="${opts.color}"><title>${opts.fmt(p[1])}</title></circle>`).join('');
    // trendvonal
    const sl = D.stats.slope(values);
    const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length, my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const t0 = my + sl * (pts[0][0] - mx), t1 = my + sl * (pts[pts.length - 1][0] - mx);
    const trend = `<line x1="${X(pts[0][0])}" y1="${Y(t0)}" x2="${X(pts[pts.length - 1][0])}" y2="${Y(t1)}" stroke="#ffd400" stroke-width="2" stroke-dasharray="5 4"/>`;
    const xl = `<text x="${pl}" y="${H - 4}" fill="#93a0bf" font-size="10">1.</text><text x="${W - pr}" y="${H - 4}" fill="#93a0bf" font-size="10" text-anchor="end">${n}. meccs</text>`;
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${opts.title}">${g}<path d="${path}" fill="none" stroke="${opts.color}" stroke-width="2"/>${dots}${trend}${xl}</svg>`;
  }

  D.charts = { lineChart };
})(globalThis.D = globalThis.D || {});
