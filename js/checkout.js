/* Kiszálló számítás: legkevesebb nyíl, javasolt útvonal. */
(function (D) {
  'use strict';
  const G = D.geo;

  // Minden lehetséges találat
  const ALL = [];
  for (let n = 1; n <= 20; n++) for (let m = 1; m <= 3; m++) ALL.push(G.mk(n, m));
  ALL.push(G.mk(25, 1), G.mk(25, 2));

  function isFinisher(d, outMode) {
    if (outMode === 'single') return d.mult > 0;
    if (outMode === 'master') return d.mult === 2 || d.mult === 3;
    return d.mult === 2; // double out (DB is mult 2)
  }

  // Preferált duplák (kisebb = jobb)
  const DOUBLE_PREF = { 20: 0, 16: 0.4, 8: 1.2, 10: 1, 18: 1.8, 12: 1.8, 4: 2.4, 6: 2.8, 14: 2.8, 2: 3.5, 25: 6 };
  function finalCost(d) {
    if (d.mult === 2) return DOUBLE_PREF[d.seg] !== undefined ? DOUBLE_PREF[d.seg] : 4.5;
    if (d.mult === 3) return 3 + (20 - d.seg) * 0.05;
    return 2 + (20 - Math.min(d.seg, 20)) * 0.05; // single out
  }
  const TRIPLE_PREF = { 20: 0, 19: 0.6, 18: 1.5, 17: 1.8 };
  function setupCost(d) {
    if (d.seg === 25) return d.mult === 2 ? 9 : 6;
    if (d.mult === 3) return TRIPLE_PREF[d.seg] !== undefined ? TRIPLE_PREF[d.seg] : 2.5 + (20 - d.seg) * 0.05;
    if (d.mult === 1) return 1.2 + (20 - d.seg) * 0.03;
    return 7; // dupla mint előkészítő
  }

  const minCache = {};
  /** Legkevesebb nyíl, amivel a rem kiszállható (Infinity ha 3 nyílból sem). */
  function minDarts(rem, outMode) {
    outMode = outMode || 'double';
    const key = outMode;
    if (!minCache[key]) minCache[key] = buildMin(outMode);
    if (rem <= 0 || rem > 180) return Infinity;
    return minCache[key][rem];
  }

  function buildMin(outMode) {
    const res = new Array(181).fill(Infinity);
    const fin = ALL.filter(d => isFinisher(d, outMode));
    const finScores = new Set(fin.map(d => d.score));
    const anyScores = new Set(ALL.map(d => d.score));
    for (let r = 1; r <= 180; r++) {
      if (finScores.has(r)) { res[r] = 1; continue; }
      let ok2 = false;
      for (const a of anyScores) if (finScores.has(r - a)) { ok2 = true; break; }
      if (ok2) { res[r] = 2; continue; }
      let ok3 = false;
      outer: for (const a of anyScores) for (const b of anyScores) if (finScores.has(r - a - b)) { ok3 = true; break outer; }
      if (ok3) res[r] = 3;
    }
    return res;
  }

  function isFinishable(rem, darts, outMode) { return minDarts(rem, outMode) <= darts; }

  const routeCache = {};
  /** Javasolt útvonal: pl. ['T20','T20','DB'] vagy null. */
  function suggest(rem, darts, outMode) {
    outMode = outMode || 'double';
    darts = darts === undefined ? 3 : darts;
    const key = outMode + ':' + rem + ':' + darts;
    if (key in routeCache) return routeCache[key];
    let best = null, bestCost = Infinity;
    if (minDarts(rem, outMode) > darts) return (routeCache[key] = null);
    const fin = ALL.filter(d => isFinisher(d, outMode));
    const consider = (route, cost) => { if (cost < bestCost) { bestCost = cost; best = route; } };
    // Előkészítő nyíl költsége: ha tripla és csak szimplát talál, kiszállható marad-e?
    const setup = (d, remBefore, dartsAfter) => {
      let c = setupCost(d);
      if (d.mult === 3 && !isFinishable(remBefore - d.seg, dartsAfter, outMode)) c += 1.6;
      return c;
    };
    for (const f of fin) {
      if (f.score === rem) consider([f], 100 + finalCost(f));
      if (darts < 2) continue;
      for (const a of ALL) {
        if (a.score + f.score === rem) consider([a, f], 200 + finalCost(f) + setup(a, rem, 1));
        if (darts < 3) continue;
        for (const b of ALL) {
          if (a.score + b.score + f.score === rem) {
            consider([a, b, f], 300 + finalCost(f) + setup(a, rem, 2) + setup(b, rem - a.score, 1) * 0.8);
          }
        }
      }
    }
    return (routeCache[key] = best ? best.map(d => d.label) : null);
  }

  D.checkout = { minDarts, isFinishable, suggest, isFinisher, ALL };
})(globalThis.D = globalThis.D || {});
