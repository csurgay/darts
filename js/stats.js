/* Statisztika: a tömeg (scoring) és a kiszálló (checkout) dobások külön kezelve.
 *  - tömeg dobás: amikor a hátralévő pont az adott körben megmaradt nyilakkal NEM kiszállható
 *  - kiszálló dobás: amikor az adott nyíllal kezdve a körben még kiszállható
 *  - dupla nyíl (dart at double): egy nyíllal kiszállható állásból dobott nyíl */
(function (D) {
  'use strict';
  const E = D.engine, G = D.geo;

  function median(a) {
    if (!a.length) return 0;
    const b = a.slice().sort((x, y) => x - y), m = b.length >> 1;
    return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
  }

  /** Szórás (mm): a medián középponttól mért négyzetes közép távolság. */
  function spread(points) {
    const p = points.filter(d => d.x !== null && d.y !== null);
    if (p.length < 3) return null;
    const cx = median(p.map(d => d.x)), cy = median(p.map(d => d.y));
    return Math.sqrt(p.reduce((a, d) => a + (d.x - cx) ** 2 + (d.y - cy) ** 2, 0) / p.length);
  }

  /** Lineáris regresszió meredeksége (y / index). */
  function slope(ys) {
    const pts = ys.map((y, i) => [i, y]).filter(p => p[1] !== null && !isNaN(p[1]));
    const n = pts.length;
    if (n < 2) return 0;
    const mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
    let num = 0, den = 0;
    pts.forEach(p => { num += (p[0] - mx) * (p[1] - my); den += (p[0] - mx) ** 2; });
    return den ? num / den : 0;
  }

  function sumPts(ds) { return ds.reduce((a, d) => a + d.points, 0); }
  function avg3(ds) { return ds.length ? sumPts(ds) / ds.length * 3 : null; }

  /**
   * @param matches [{id, created, settings, throws, status}]
   * @param playerId
   */
  function forPlayer(matches, playerId, opts) {
    opts = opts || {};
    const sorted = matches.slice().sort((a, b) => (a.created || 0) - (b.created || 0));
    const all = [], perMatch = [], visits = [], legsInfo = [];
    let matchesPlayed = 0, matchesWon = 0;
    sorted.forEach((m, mi) => {
      const idx = (m.settings.players || []).findIndex(p => p.id === playerId);
      if (idx < 0) return;
      const st = E.compute(m.settings, m.throws || []);
      matchesPlayed++;
      if (st.finished && st.winner === idx) matchesWon++;
      const ds = st.darts.filter(d => d.player === idx).map(d => Object.assign({ matchId: m.id, matchIndex: perMatch.length, date: m.created }, d));
      ds.forEach(d => all.push(d));
      st.visits.filter(v => v.player === idx).forEach(v => visits.push(v));
      st.legs.forEach(l => legsInfo.push({ won: l.winner === idx, darts: st.darts.filter(d => d.leg === l.leg && d.player === idx).length, matchId: m.id }));
      const sc = ds.filter(d => d.phase === 'scoring');
      const atD = ds.filter(d => d.atDouble);
      perMatch.push({
        matchId: m.id, date: m.created, opponent: (m.settings.players || []).filter(p => p.id !== playerId).map(p => p.name).join(', '),
        won: st.finished && st.winner === idx,
        avg3: avg3(ds), scoringAvg: avg3(sc), first9: avg3(ds.filter(d => d.legDart <= 9)),
        dartsAtDouble: atD.length, checkouts: ds.filter(d => d.checkout).length,
        checkoutPct: atD.length ? ds.filter(d => d.checkout).length / atD.length * 100 : null,
        spread: spread(sc), darts: ds.length
      });
    });

    const scoring = all.filter(d => d.phase === 'scoring');
    const checkoutPhase = all.filter(d => d.phase === 'checkout');
    const atDouble = all.filter(d => d.atDouble);
    const checkoutDarts = all.filter(d => d.checkout);
    const fullVisits = visits.filter(v => !v.bust);

    // duplák célonként
    const doubles = {};
    atDouble.forEach(d => {
      const k = d.target || '?';
      doubles[k] = doubles[k] || { target: k, attempts: 0, hits: 0 };
      doubles[k].attempts++;
      if (d.checkout) doubles[k].hits++;
    });
    const doubleList = Object.values(doubles).sort((a, b) => b.attempts - a.attempts);

    // kiszálló körök (amikor a kör elején kiszállható volt)
    const coVisits = visits.filter(v => v.darts.length && v.darts[0].phase === 'checkout');
    const coWon = coVisits.filter(v => v.checkout);
    const checkoutValues = visits.filter(v => v.checkout).map(v => v.startRem);

    const wonLegs = legsInfo.filter(l => l.won);
    const res = {
      playerId, matchesPlayed, matchesWon,
      darts: all.length,
      avg3: avg3(all), first9: avg3(all.filter(d => d.legDart <= 9)),
      scoring: {
        darts: scoring.length, avg3: avg3(scoring),
        tons: fullVisits.filter(v => v.total >= 100).length,
        t140: fullVisits.filter(v => v.total >= 140).length,
        t180: fullVisits.filter(v => v.total === 180).length,
        t60: fullVisits.filter(v => v.total >= 60).length,
        busts: visits.filter(v => v.bust).length,
        spread: spread(scoring),
        trebleRate: rate(scoring.filter(d => d.x !== null), d => d.mult === 3),
        t20Rate: rate(scoring.filter(d => d.x !== null), d => d.seg === 20 && d.mult === 3)
      },
      checkout: {
        darts: checkoutPhase.length, dartsAtDouble: atDouble.length, checkouts: checkoutDarts.length,
        pct: atDouble.length ? checkoutDarts.length / atDouble.length * 100 : null,
        visits: coVisits.length, visitsWon: coWon.length,
        visitPct: coVisits.length ? coWon.length / coVisits.length * 100 : null,
        highest: checkoutValues.length ? Math.max.apply(null, checkoutValues) : null,
        avgCheckout: checkoutValues.length ? checkoutValues.reduce((a, b) => a + b, 0) / checkoutValues.length : null,
        doubles: doubleList,
        spread: spread(atDouble.filter(d => d.target).map(d => normDouble(d)))
      },
      legs: {
        played: legsInfo.length, won: wonLegs.length,
        best: wonLegs.length ? Math.min.apply(null, wonLegs.map(l => l.darts)) : null,
        avgDarts: wonLegs.length ? wonLegs.reduce((a, l) => a + l.darts, 0) / wonLegs.length : null
      },
      perMatch,
      trend: {
        avg3: slope(perMatch.map(m => m.avg3)),
        scoringAvg: slope(perMatch.map(m => m.scoringAvg)),
        checkoutPct: slope(perMatch.map(m => m.checkoutPct)),
        spread: slope(perMatch.map(m => m.spread))
      },
      cloud: {
        scoring: scoring.filter(d => d.x !== null).map(pick),
        checkout: checkoutPhase.filter(d => d.x !== null).map(pick),
        doubles: atDouble.filter(d => d.x !== null && d.target).map(d => Object.assign(pick(d), normDouble(d), { target: d.target }))
      }
    };
    return res;
  }

  function pick(d) { return { x: d.x, y: d.y, seg: d.seg, mult: d.mult, m: d.matchIndex, date: d.date, hit: d.checkout }; }
  function rate(ds, fn) { return ds.length ? ds.filter(fn).length / ds.length * 100 : null; }

  /** Dupla-dobás normalizálása: a célzott duplát a tábla tetejére forgatja. */
  function normDouble(d) {
    if (d.target === 'DB') return { x: d.x, y: d.y, nx: d.x, ny: d.y };
    const seg = parseInt(String(d.target).slice(1), 10);
    const r = G.normalizeToTop(d.x, d.y, seg);
    return { x: r.x, y: r.y, nx: r.x, ny: r.y };
  }

  /** Trend szöveggé: javul / romlik / stabil (a "jobb" irány megadható). */
  function trendLabel(sl, higherIsBetter, eps) {
    eps = eps === undefined ? 0.05 : eps;
    if (Math.abs(sl) < eps) return 'stabil';
    return (sl > 0) === higherIsBetter ? 'javul' : 'romlik';
  }

  D.stats = { forPlayer, spread, slope, median, trendLabel, avg3 };
})(globalThis.D = globalThis.D || {});
