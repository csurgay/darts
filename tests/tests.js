/* Az összes autoteszt. Futtatás: Beállítások → Autotesztek, vagy: node tests/run-node.js [API_URL] */
(function (D) {
  'use strict';
  const T = D.testing, G = D.geo, C = D.checkout, E = D.engine, S = D.stats;
  const add = T.add;

  // ---------- segédek ----------
  const P2 = [{ id: 'p-a', name: 'Anna' }, { id: 'p-b', name: 'Béla' }];
  const P3 = P2.concat([{ id: 'p-c', name: 'Cili' }]);
  function th(labels, opts) {
    // "T20 S5 D16 MISS" -> dobások a mező közepére (koordinátával), vagy manual
    return labels.split(/\s+/).filter(Boolean).map(l => {
      const h = G.parseLabel(l);
      if (!h) throw new Error('rossz címke: ' + l);
      if (opts && opts.manual) return E.makeThrow({ seg: h.seg, mult: h.mult, manual: true });
      const c = G.centerOf(h.seg, h.mult);
      if (!c) return E.makeThrow({ seg: 0, mult: 0, x: null, y: null });
      return E.makeThrow({ x: c.x, y: c.y });
    });
  }
  function settings(o) { return E.normSettings(Object.assign({ startScore: 501, legsToWin: 1, players: P2 }, o || {})); }
  // pszeudo-véletlen (ismételhető)
  function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  // ================= Geometria =================
  add('Tábla geometria', 'Minden mező közepe a saját mezőjét adja (62 mező)', A => {
    C.ALL.forEach(d => {
      const c = G.centerOf(d.seg, d.mult);
      const h = G.scoreAt(c.x, c.y);
      A.eq(h.label, d.label, d.label);
    });
  });
  add('Tábla geometria', 'Bull határok', A => {
    A.eq(G.scoreAt(0, 0).label, 'DB');
    A.eq(G.scoreAt(0, 6.35).label, 'DB');
    A.eq(G.scoreAt(0, 6.4).label, 'SB');
    A.eq(G.scoreAt(15.9, 0).label, 'SB');
    A.eq(G.scoreAt(0, 16).label, 'S20');
  });
  add('Tábla geometria', 'Gyűrű határok (tripla, dupla, mellé)', A => {
    A.eq(G.scoreAt(0, 98.9).label, 'S20');
    A.eq(G.scoreAt(0, 99).label, 'T20');
    A.eq(G.scoreAt(0, 107).label, 'T20');
    A.eq(G.scoreAt(0, 107.1).label, 'S20');
    A.eq(G.scoreAt(0, 161.9).label, 'S20');
    A.eq(G.scoreAt(0, 162).label, 'D20');
    A.eq(G.scoreAt(0, 170).label, 'D20');
    A.eq(G.scoreAt(0, 170.1).label, 'MISS');
    A.eq(G.scoreAt(0, -170.1).score, 0);
  });
  add('Tábla geometria', 'Szektor határok és irányok', A => {
    const at = (deg, r) => { const a = deg * Math.PI / 180; return G.scoreAt(r * Math.sin(a), r * Math.cos(a)).seg; };
    A.eq(at(8.9, 50), 20); A.eq(at(9.1, 50), 1); A.eq(at(-8.9, 50), 20); A.eq(at(-9.1, 50), 5);
    A.eq(at(90, 50), 6); A.eq(at(180, 50), 3); A.eq(at(270, 50), 11);
    A.eq(G.scoreAt(50, 0).seg, 6, 'jobbra a 6');
    A.eq(G.scoreAt(-50, 0).seg, 11, 'balra a 11');
    A.eq(G.scoreAt(0, -50).seg, 3, 'lent a 3');
  });
  add('Tábla geometria', 'Címke értelmezés', A => {
    A.deepEq(G.parseLabel('t20'), G.mk(20, 3));
    A.deepEq(G.parseLabel('D16'), G.mk(16, 2));
    A.deepEq(G.parseLabel('7'), G.mk(7, 1));
    A.deepEq(G.parseLabel('DB'), G.mk(25, 2));
    A.deepEq(G.parseLabel('SB'), G.mk(25, 1));
    A.eq(G.parseLabel('T21'), null);
    A.eq(G.parseLabel('X5'), null);
    A.eq(G.parseLabel('MISS').score, 0);
  });
  add('Tábla geometria', 'Forgatás: bármely dupla a 20 helyére kerül', A => {
    for (const n of G.NUMBERS) {
      const c = G.centerOf(n, 2), r = G.normalizeToTop(c.x, c.y, n), t = G.centerOf(20, 2);
      A.near(r.x, t.x, 1e-6, 'x D' + n); A.near(r.y, t.y, 1e-6, 'y D' + n);
    }
  });

  // ================= Kiszálló =================
  add('Kiszálló', 'Ismert értékek (dupla ki)', A => {
    A.eq(C.minDarts(170), 3); A.eq(C.minDarts(50), 1); A.eq(C.minDarts(40), 1); A.eq(C.minDarts(2), 1);
    A.eq(C.minDarts(41), 2); A.eq(C.minDarts(100), 2); A.eq(C.minDarts(110), 2); A.eq(C.minDarts(101), 2); A.eq(C.minDarts(99), 3);
    A.eq(C.minDarts(1), Infinity); A.eq(C.minDarts(171), Infinity); A.eq(C.minDarts(0), Infinity);
  });
  add('Kiszálló', 'Bogey számok: 159 162 163 165 166 168 169 nem kiszállható', A => {
    const bogey = [];
    for (let r = 2; r <= 170; r++) if (C.minDarts(r) === Infinity) bogey.push(r);
    A.deepEq(bogey, [159, 162, 163, 165, 166, 168, 169]);
  });
  add('Kiszálló', 'Minden javaslat helyes (2–170, 1–3 nyíl, dupla ki)', A => {
    let n = 0;
    for (let r = 2; r <= 170; r++) for (let d = 1; d <= 3; d++) {
      const s = C.suggest(r, d, 'double');
      if (C.minDarts(r) > d) { A.eq(s, null, `${r}/${d}`); continue; }
      A.ok(s && s.length <= d, `${r}/${d}: ${s}`);
      A.eq(s.length, C.minDarts(r), `${r}: legkevesebb nyíl`);
      const hits = s.map(G.parseLabel);
      A.eq(hits.reduce((a, h) => a + h.score, 0), r, `${r} összeg`);
      A.eq(hits[hits.length - 1].mult, 2, `${r} duplával végződik`);
      n++;
    }
    return n + ' útvonal';
  });
  add('Kiszálló', 'Klasszikus útvonalak', A => {
    A.deepEq(C.suggest(170, 3), ['T20', 'T20', 'DB']);
    A.deepEq(C.suggest(160, 3), ['T20', 'T20', 'D20']);
    A.deepEq(C.suggest(100, 3), ['T20', 'D20']);
    A.deepEq(C.suggest(40, 3), ['D20']);
    A.deepEq(C.suggest(32, 1), ['D16']);
    A.deepEq(C.suggest(50, 1), ['DB']);
  });
  add('Kiszálló', 'Szimpla és master kiszálló', A => {
    A.eq(C.minDarts(1, 'single'), 1); A.eq(C.minDarts(180, 'single'), 3); A.eq(C.minDarts(179, 'single'), Infinity);
    A.eq(C.minDarts(3, 'master'), 1); A.eq(C.minDarts(57, 'master'), 1); A.eq(C.minDarts(1, 'master'), Infinity);
    A.eq(C.minDarts(180, 'master'), 3);
    const s = C.suggest(57, 1, 'master'); A.deepEq(s, ['T19']);
  });

  // ================= Játékmotor =================
  add('Játékmotor', 'Kilencnyilas (501, dupla ki)', A => {
    const t = th('T20 T20 T20  S1 S1 S1  T20 T20 T20  S1 S1 S1  T20 T19 D12');
    const st = E.compute(settings(), t);
    A.ok(st.finished, 'vége'); A.eq(st.winner, 0); A.eq(st.players[0].remaining, 0);
    A.near(st.players[0].matchAvg, 167, 1e-9); A.eq(st.darts[14].checkout, true);
    A.eq(st.visits.filter(v => v.player === 0 && v.total === 180).length, 2);
  });
  add('Játékmotor', 'Besokallás: túldobás, 1 marad, nem duplával 0', A => {
    const s = settings({ startScore: 40 });
    let st = E.compute(s, th('T20'));
    A.eq(st.players[0].remaining, 40, 'túldobás visszaáll'); A.eq(st.current, 1); A.eq(st.visits[0].bust, true);
    st = E.compute(s, th('S19 S20'));
    A.eq(st.players[0].remaining, 40, '1 marad -> bust'); A.eq(st.darts[0].points, 0, 'a kör korábbi nyila is 0');
    st = E.compute(s, th('S20 S20'));
    A.eq(st.players[0].remaining, 40, 'szimplával 0 -> bust');
    st = E.compute(s, th('S20 D10'));
    A.ok(st.finished, 'D10 kiszáll');
  });
  add('Játékmotor', 'Szimpla kiszálló', A => {
    const s = settings({ startScore: 21, outMode: 'single' });
    let st = E.compute(s, th('S20 S1'));
    A.ok(st.finished); A.eq(st.winner, 0);
    st = E.compute(s, th('S20'));
    A.eq(st.players[0].remaining, 1, 'szimplánál 1 nem bust');
  });
  add('Játékmotor', 'Master kiszálló (tripla is jó)', A => {
    const s = settings({ startScore: 60, outMode: 'master' });
    A.ok(E.compute(s, th('T20')).finished);
    A.ok(!E.compute(s, th('S20 S20 S20')).finished, 'szimplával nem');
  });
  add('Játékmotor', 'Dupla be: a dupla előtti nyilak nem számítanak', A => {
    const s = settings({ inMode: 'double' });
    let st = E.compute(s, th('T20 S5 D10'));
    A.eq(st.players[0].remaining, 481); A.eq(st.darts[0].points, 0); A.eq(st.darts[2].points, 20);
    st = E.compute(s, th('T20 T20 T20'));
    A.eq(st.players[0].remaining, 501);
    A.eq(st.suggestion, null);
  });
  add('Játékmotor', 'Kezdő játékos váltakozik legenként', A => {
    const s = settings({ startScore: 40, legsToWin: 3 });
    let st = E.compute(s, th('D20'));
    A.eq(st.legStarter, 1); A.eq(st.current, 1); A.eq(st.players[0].legs, 1);
    st = E.compute(s, th('D20  D20'));
    A.eq(st.players[1].legs, 1); A.eq(st.legStarter, 0); A.eq(st.current, 0);
  });
  add('Játékmotor', 'Szettek: szett kezdő váltás, leg számláló nullázás', A => {
    const s = settings({ startScore: 40, legsToWin: 2, setsToWin: 2 });
    // A nyeri az 1. leget, B (kezd) a 2-at kihagyja, A nyeri -> A 1 szett
    let st = E.compute(s, th('D20  MISS MISS MISS  D20'));
    A.eq(st.players[0].sets, 1, 'A szett'); A.eq(st.players[0].legs, 0, 'leg nullázva');
    A.eq(st.set, 2); A.eq(st.setStarter, 1); A.eq(st.current, 1, 'B kezdi a 2. szettet');
    st = E.compute(s, th('D20  MISS MISS MISS  D20  MISS MISS MISS  D20  D20'));
    A.ok(st.finished, 'A 2–0 szettre nyer'); A.eq(st.winner, 0); A.eq(E.summary(st), '2–0 (szett)');
  });
  add('Játékmotor', 'Három játékos sorrend', A => {
    const st = E.compute(settings({ players: P3 }), th('S1 S1 S1  S2 S2 S2  S3 S3 S3  S4'));
    A.eq(st.players[0].remaining, 494, 'A: 3 + 4'); A.eq(st.players[1].remaining, 495); A.eq(st.players[2].remaining, 492);
    A.eq(st.current, 0); A.eq(st.dartsInVisit, 1);
  });
  add('Játékmotor', 'Kör vége gomb: hiányzó nyilak MISS-ként', A => {
    const s = settings();
    let t = E.fillVisit(s, th('T20'));
    A.eq(t.length, 3); A.ok(t[1].filler && t[2].filler);
    A.eq(E.compute(s, t).current, 1);
    t = E.fillVisit(s, []);
    A.eq(t.length, 3, 'üres kör: 3 MISS');
  });
  add('Játékmotor', 'Visszavonás: kitöltő nyilak együtt, különben egy nyíl', A => {
    const s = settings();
    let t = E.fillVisit(s, th('T20'));
    t = E.undo(t); A.eq(t.length, 1, 'kitöltők le');
    t = E.undo(t); A.eq(t.length, 0);
    A.eq(E.undo([]).length, 0);
  });
  add('Játékmotor', 'Meccs vége után nem számol tovább', A => {
    const st = E.compute(settings({ startScore: 40 }), th('D20 T20 T20'));
    A.ok(st.finished); A.eq(st.darts.length, 1);
  });
  add('Játékmotor', 'Tömeg / kiszálló fázis és dupla nyíl', A => {
    const st = E.compute(settings({ startScore: 132 }), th('S20 S20 S20  MISS MISS MISS  S20 S20 S20'));
    // A: 132 (3 nyíllal kiszállható: T20 T20 D6) -> checkout; 112 két nyílból nem (2 nyíl max 110) -> scoring
    A.eq(st.darts[0].phase, 'checkout', '132/3');
    A.eq(st.darts[1].phase, 'scoring', '112/2');
    A.eq(st.darts[2].phase, 'scoring', '92/1');
    A.eq(st.darts[6].remBefore, 72); A.eq(st.darts[6].phase, 'checkout', '72/3');
    A.eq(st.darts[8].remBefore, 32); A.ok(st.darts[8].atDouble, '32 dupla nyíl'); A.eq(st.darts[8].target, 'D16');
    A.ok(!st.darts[7].atDouble, '52 nem dupla nyíl');
  });
  add('Játékmotor', 'Szimulált meccsek invariánsai (200 meccs)', A => {
    const R = rng(42);
    for (let g = 0; g < 200; g++) {
      const s = settings({ startScore: [301, 501, 101][g % 3], legsToWin: 1 + (g % 3), setsToWin: g % 4 === 0 ? 2 : 0, players: g % 5 === 0 ? P3 : P2, outMode: g % 7 === 0 ? 'single' : 'double', inMode: g % 11 === 0 ? 'double' : 'straight' });
      // szimulált játékos: a javasolt mezőre (vagy T20-ra) céloz, ~18 mm szórással
      const t = [];
      let cur = E.compute(s, t);
      const gauss = () => Math.sqrt(-2 * Math.log(R() + 1e-12)) * Math.cos(2 * Math.PI * R());
      for (let i = 0; i < 3000 && !cur.finished; i++) {
        const aim = cur.suggestion ? G.parseLabel(cur.suggestion[0]) : (cur.players[cur.current].opened ? G.mk(20, 3) : G.mk(20, 2));
        const c = G.centerOf(aim.seg, aim.mult);
        t.push(E.makeThrow({ x: c.x + gauss() * 18, y: c.y + gauss() * 18 }));
        cur = E.compute(s, t);
      }
      A.ok(cur.finished, 'a meccs véget ér');
      const st = E.compute(s, t);
      st.darts.forEach(d => {
        A.ok(d.remAfter >= 0, 'nem negatív');
        if (s.outMode !== 'single') A.ok(d.remAfter !== 1, 'nem marad 1');
        A.ok(d.dart >= 1 && d.dart <= 3, 'körben max 3 nyíl');
      });
      // minden nyert legben a győztes pontjainak összege = kezdő pont
      st.legs.forEach(l => {
        const sum = st.darts.filter(d => d.leg === l.leg && d.player === l.winner).reduce((a, d) => a + d.points, 0);
        A.eq(sum, s.startScore, 'leg ' + l.leg + ' összeg');
      });
      A.eq(st.players.reduce((a, p) => a + p.totalLegs, 0), st.legs.length, 'leg darab');
    }
    return '200 meccs';
  });
  add('Játékmotor', 'Visszajátszás konzisztens: minden előtag ugyanazt az állást adja', A => {
    const R = rng(7);
    const s = settings({ startScore: 301, legsToWin: 2 });
    const t = [];
    for (let i = 0; i < 300; i++) { const a = R() * 6.283, r = R() * 120; t.push(E.makeThrow({ x: r * Math.sin(a), y: r * Math.cos(a) })); }
    const full = E.compute(s, t);
    for (let k = 1; k <= full.darts.length; k++) {
      const pre = E.compute(s, t.slice(0, k));
      const d = full.darts[k - 1], pd = pre.darts[k - 1];
      A.eq(pd.remBefore, d.remBefore, 'remBefore #' + k);
      A.eq(pd.leg, d.leg, 'leg #' + k); A.eq(pd.player, d.player, 'player #' + k);
      // visszavonás = előtag
      A.eq(JSON.stringify(E.compute(s, E.undo(t.slice(0, k))).players.map(p => p.remaining)), JSON.stringify(E.compute(s, t.slice(0, k - 1)).players.map(p => p.remaining)));
    }
  });

  // ================= Statisztika =================
  add('Statisztika', 'Kiszálló %: 2 mellé + 1 talált a duplára = 33,3%', A => {
    // tiszta eset: 40-ről D20 mellé (S20? az 20-at hagy), inkább: 40 -> MISS MISS D20
    const m3 = { id: 'm3', created: 3, status: 'finished', settings: settings({ startScore: 40 }), throws: th('MISS MISS D20') };
    const r3 = S.forPlayer([m3], 'p-a');
    A.eq(r3.checkout.dartsAtDouble, 3); A.eq(r3.checkout.checkouts, 1); A.near(r3.checkout.pct, 100 / 3, 1e-9);
    A.eq(r3.checkout.highest, 40); A.eq(r3.legs.best, 3);
    A.eq(r3.checkout.doubles[0].target, 'D20'); A.eq(r3.checkout.doubles[0].attempts, 3); A.eq(r3.checkout.doubles[0].hits, 1);
  });
  add('Statisztika', 'Tömeg és kiszálló dobások külön számolva', A => {
    const m = { id: 'm', created: 1, status: 'finished', settings: settings({ startScore: 301 }), throws: th('T20 T20 T20  S1 S1 S1  T20 S1 S20  S1 S1 S1  D20') };
    // A: 301 -> 121. 2. kör: 121/3 és 61/2 kiszálló, 60/1 nem (tömeg). 3. kör: 40 -> D20
    const r = S.forPlayer([m], 'p-a');
    A.eq(r.scoring.darts, 4, 'tömeg nyilak'); A.near(r.scoring.avg3, 150, 1e-9);
    A.eq(r.checkout.darts, 3, 'kiszálló nyilak');
    A.eq(r.checkout.dartsAtDouble, 1); A.eq(r.checkout.pct, 100);
    A.eq(r.scoring.t180, 1); A.eq(r.checkout.highest, 40);
    A.eq(r.checkout.visits, 2, 'kiszálló körök'); A.eq(r.checkout.visitsWon, 1);
    A.eq(r.darts, 7);
  });
  add('Statisztika', 'Szórás, medián, meredekség, trend', A => {
    A.eq(S.spread([{ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 1 }]), 0);
    A.near(S.spread([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 3, y: 4 }]), Math.sqrt(25 / 3), 1e-9);
    A.eq(S.spread([{ x: 1, y: 1 }]), null);
    A.eq(S.median([3, 1, 2]), 2); A.eq(S.median([4, 1, 2, 3]), 2.5);
    A.near(S.slope([1, 2, 3, 4]), 1, 1e-9); A.near(S.slope([5, null, 5]), 0, 1e-9);
    A.eq(S.trendLabel(1, true), 'javul'); A.eq(S.trendLabel(1, false), 'romlik'); A.eq(S.trendLabel(0.01, true), 'stabil');
  });
  add('Statisztika', 'Fejlődés kimutatható: javuló játékos pozitív trendet kap', A => {
    const ms = [];
    for (let i = 0; i < 6; i++) {
      // egyre több T20
      const labels = Array.from({ length: 9 }, (_, j) => j < i + 1 ? 'T20' : 'S20').join(' ');
      ms.push({ id: 'g' + i, created: 1000 + i, status: 'abandoned', settings: settings({ players: [P2[0]] }), throws: th(labels) });
    }
    const r = S.forPlayer(ms, 'p-a');
    A.eq(r.perMatch.length, 6); A.ok(r.trend.avg3 > 0, 'pozitív meredekség');
    A.eq(S.trendLabel(r.trend.avg3, true, 0.1), 'javul');
  });
  add('Statisztika', 'Dupla-dobásfelhő normalizálása', A => {
    const c = G.centerOf(8, 2);
    const m = { id: 'm', created: 1, status: 'finished', settings: settings({ startScore: 16 }), throws: [E.makeThrow({ x: c.x, y: c.y })] };
    const r = S.forPlayer([m], 'p-a');
    A.eq(r.cloud.doubles.length, 1);
    const t = G.centerOf(20, 2);
    A.near(r.cloud.doubles[0].nx, t.x, 0.2); A.near(r.cloud.doubles[0].ny, t.y, 0.2); A.ok(r.cloud.doubles[0].hit);
  });
  add('Statisztika', 'Billentyűzetes (koordináta nélküli) nyilak nem kerülnek a felhőbe', A => {
    const m = { id: 'm', created: 1, status: 'active', settings: settings(), throws: th('T20 T20', { manual: true }).concat(th('T20')) };
    const r = S.forPlayer([m], 'p-a');
    A.eq(r.darts, 3); A.eq(r.cloud.scoring.length, 1);
  });

  // ================= Helyi tár =================
  add('Tárolás (helyi)', 'Játékos és meccs mentés, lekérdezés, törlés', async A => {
    const s = new D.store.LocalStore('darts.selftest.' + Date.now() + '.');
    const p = await s.savePlayer({ name: 'Teszt Elek' });
    A.ok(p.id);
    A.eq((await s.listPlayers()).length, 1);
    await s.savePlayer({ id: p.id, name: 'Teszt Elek 2' });
    A.eq((await s.listPlayers())[0].name, 'Teszt Elek 2');
    const m = { id: D.store.uuid(), created: Date.now(), status: 'active', settings: settings({ players: [{ id: p.id, name: p.name }] }), throws: th('T20 S1') };
    await s.saveMatch(m);
    A.eq((await s.listMatches({ playerId: p.id })).length, 1);
    A.eq((await s.listMatches({ playerId: 'nincs' })).length, 0);
    A.eq((await s.getMatch(m.id)).throws.length, 2);
    A.eq((await s.deletePlayer(p.id)).archived, true, 'meccses játékos archiválódik');
    A.eq((await s.listPlayers()).length, 0);
    await s.deleteMatch(m.id);
    A.eq(await s.getMatch(m.id), null);
    await s.deletePlayer(p.id);
    A.eq((await s.allPlayers()).length, 0, 'meccs nélkül végleg törlődik');
    ['players', 'matches'].forEach(k => D.store.LS.del(s.p + k));
  });
  add('Tárolás (helyi)', 'Offline sor: szerver nélkül helyben ment, később feltölt', async A => {
    // ál-szerver, ami először nem elérhető
    const mock = { up: false, data: {}, async saveMatch(m) { if (!this.up) throw new Error('offline'); this.data[m.id] = JSON.parse(JSON.stringify(m)); },
      async listMatches() { if (!this.up) throw new Error('offline'); return Object.values(this.data); }, async ping() { return {}; } };
    const pre = 'darts.selftest.sync.' + Date.now() + '.';
    const s = new D.store.SyncStore(mock, pre);
    const m = { id: D.store.uuid(), created: Date.now(), status: 'active', settings: settings(), throws: th('T20') };
    await s.saveMatch(m);
    A.eq(s.pending(), 1, 'vár a sorban'); A.eq(s.online, false);
    A.eq((await s.listMatches({})).length, 1, 'helyből listáz');
    m.throws = m.throws.concat(th('T20')); m.status = 'finished';
    await s.saveMatch(m);
    A.eq(s.pending(), 1, 'ugyanaz a meccs egyszer van a sorban');
    mock.up = true;
    const n = await s.flush();
    A.eq(n, 1); A.eq(s.pending(), 0);
    A.eq(mock.data[m.id].throws.length, 2, 'a legfrissebb állapot ment fel');
    A.eq(await s.local.getMatch(m.id), null, 'befejezett meccs kikerül a helyi tárból');
    ['players', 'matches', 'queue'].forEach(k => D.store.LS.del(pre + k));
  });

  // ================= Szerver API =================
  add('Szerver API', 'Kapcsolat (ping)', async (A, ctx) => {
    const r = await ctx.server.ping();
    A.eq(r.db, 'ok');
    return `API ${r.version} · ${r.driver} · PHP ${r.php}`;
  }, { needs: 'server' });
  add('Szerver API', 'Játékos + meccs teljes kör (mentés, olvasás, szűrés, felülírás, törlés)', async (A, ctx) => {
    const s = ctx.server;
    const pid = D.store.uuid(), mid = D.store.uuid();
    try {
      const p = await s.savePlayer({ id: pid, name: '__teszt__ Árvíztűrő' });
      A.eq(p.name, '__teszt__ Árvíztűrő');
      A.ok((await s.allPlayers()).some(x => x.id === pid), 'listában');
      const st = settings({ startScore: 40, players: [{ id: pid, name: p.name }] });
      const m = { id: mid, created: Date.now(), status: 'active', settings: st, throws: th('S20 S10').concat(th('S5', { manual: true })) };
      await s.saveMatch(m);
      const g = await s.getMatch(mid);
      A.eq(g.throws.length, 3);
      A.eq(g.throws[0].seg, 20); A.eq(g.throws[0].mult, 1); A.near(g.throws[0].y, m.throws[0].y, 0.06);
      A.eq(g.throws[2].manual, true); A.eq(g.throws[2].x, null);
      A.deepEq(g.settings.players, st.players);
      A.eq((await s.listMatches({ playerId: pid })).length, 1, 'szűrés játékosra');
      A.eq((await s.getMatches({ playerId: pid }))[0].throws.length, 3, 'teljes lekérés');
      m.throws = th('D20'); m.status = 'finished'; m.winnerId = pid;
      await s.saveMatch(m);
      const g2 = await s.getMatch(mid);
      A.eq(g2.throws.length, 1, 'felülírás'); A.eq(g2.status, 'finished'); A.eq(g2.winnerId, pid);
      A.eq((await s.deletePlayer(pid)).archived, true, 'archiválás');
    } finally {
      await s.deleteMatch(mid);
      await s.deletePlayer(pid);
    }
    await A.rejects(s.getMatch(mid), 'törölt meccs nem kérhető le');
    A.ok(!(await s.allPlayers()).some(x => x.id === pid), 'játékos végleg törölve');
  }, { needs: 'server' });
  add('Szerver API', 'Hibás adatok elutasítása', async (A, ctx) => {
    await A.rejects(ctx.server.savePlayer({ id: 'x', name: '' }), 'üres név');
    await A.rejects(ctx.server.savePlayer({ id: "x'; DROP TABLE darts;--", name: 'x' }), 'rossz azonosító');
    await A.rejects(ctx.server.saveMatch({ id: D.store.uuid(), settings: { players: [] }, throws: [] }), 'játékos nélküli meccs');
    await A.rejects(ctx.server.req('nincs.ilyen', {}), 'ismeretlen művelet');
  }, { needs: 'server' });
  add('Adatbázis (szerver önteszt)', 'Szerver oldali öntesztek', async (A, ctx) => {
    const r = await ctx.server.selftest();
    return { sub: r };
  }, { needs: 'server' });

  // ================= Felület =================
  add('Felület', 'Tábla: mm ↔ képpont átváltás', A => {
    const c = document.createElement('canvas');
    c.style.cssText = 'position:absolute;left:-9999px;width:300px;height:300px';
    document.body.appendChild(c);
    try {
      const b = new D.Board(c, {});
      [[0, 0], [100, -50], [-170, 170]].forEach(([x, y]) => { const p = b.toPx(x, y), q = b.toMm(p.x, p.y); A.near(q.x, x, 1e-9); A.near(q.y, y, 1e-9); });
      const top = b.toPx(0, 170);
      A.ok(top.y < 150, 'felfelé a 20');
    } finally { c.remove(); }
  }, { needs: 'dom' });
  add('Felület', 'Eredményjelző: aktív játékos, hátralévő, kiszálló javaslat', A => {
    const st = E.compute(settings({ startScore: 170 }), []);
    const div = document.createElement('div');
    div.innerHTML = D.app.scoreboardHtml(st);
    A.eq(div.querySelectorAll('.sb-row').length, 2);
    A.ok(div.querySelector('.sb-row.active .name').textContent.includes('Anna'));
    A.eq(div.querySelector('.sb-row .score').textContent, '170');
    A.ok(div.querySelector('.route').textContent.includes('T20  T20  DB'));
  }, { needs: 'dom' });
  add('Felület', 'Grafikon rajzolás', A => {
    const svg = D.charts.lineChart([1, 2, null, 4]);
    A.ok(svg.indexOf('<svg') === 0 && svg.includes('<path'));
    A.ok(D.charts.lineChart([5]).includes('Legalább 2'));
  });
})(globalThis.D = globalThis.D || {});
