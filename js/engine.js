/* X01 játékmotor. A meccs állapota mindig a dobások listájából számolódik
 * (event sourcing) – így a visszavonás, a visszajátszás és a statisztika
 * ugyanazt a kódot használja. */
(function (D) {
  'use strict';
  const G = D.geo, C = D.checkout;

  const DEFAULTS = {
    startScore: 501,
    inMode: 'straight',   // 'straight' | 'double'
    outMode: 'double',    // 'double' | 'single' | 'master'
    legsToWin: 3,         // first to N leg (szettenként, ha van szett)
    setsToWin: 0,         // 0 = nincs szett
    startingPlayer: 0,
    players: []           // [{id, name}]
  };

  function normSettings(s) {
    const o = Object.assign({}, DEFAULTS, s || {});
    o.startScore = parseInt(o.startScore, 10) || 501;
    o.legsToWin = Math.max(1, parseInt(o.legsToWin, 10) || 1);
    o.setsToWin = Math.max(0, parseInt(o.setsToWin, 10) || 0);
    o.startingPlayer = parseInt(o.startingPlayer, 10) || 0;
    return o;
  }

  /** Egy nyíl adatai a bevitelből (x,y mm vagy seg/mult). */
  function makeThrow(input) {
    const t = { t: input.t || Date.now() };
    if (input.x !== undefined && input.x !== null && !input.manual) {
      const h = G.scoreAt(input.x, input.y);
      t.x = Math.round(input.x * 10) / 10; t.y = Math.round(input.y * 10) / 10;
      t.seg = h.seg; t.mult = h.mult;
    } else {
      t.x = null; t.y = null;
      t.seg = input.seg || 0; t.mult = input.mult || 0;
      if (input.manual) t.manual = true;
    }
    if (input.filler) t.filler = true;
    return t;
  }

  function isFinishDart(t, outMode) {
    if (outMode === 'single') return t.mult > 0;
    if (outMode === 'master') return t.mult === 2 || t.mult === 3;
    return t.mult === 2;
  }

  /**
   * A teljes állapot kiszámítása.
   * Visszaad: { settings, darts (dúsított), players[], current, set, leg, finished, winner, ... }
   */
  function compute(settingsIn, throws) {
    const s = normSettings(settingsIn);
    const n = s.players.length;
    const P = s.players.map((p, i) => ({
      index: i, id: p.id, name: p.name,
      remaining: s.startScore, legs: 0, sets: 0, opened: s.inMode !== 'double',
      totalLegs: 0
    }));
    const st = {
      settings: s, players: P, darts: [], visits: [], legs: [],
      set: 1, leg: 1, legInSet: 1, legGlobal: 1,
      current: 0, legStarter: 0, setStarter: 0,
      visitDarts: [], visitStartRem: s.startScore, visitNoByPlayer: new Array(n).fill(0),
      finished: false, winner: null, lastEvent: null
    };
    if (!n) return st;
    st.setStarter = s.startingPlayer % n;
    st.legStarter = st.setStarter;
    st.current = st.legStarter;
    st.visitStartRem = P[st.current].remaining;
    let legDarts = []; // aktuális leg nyilai
    const legDartCount = new Array(n).fill(0);

    const endVisit = (busted, checkout) => {
      const p = P[st.current];
      const vd = st.visitDarts;
      const v = {
        player: st.current, set: st.set, leg: st.legGlobal, visitNo: st.visitNoByPlayer[st.current],
        darts: vd.slice(), startRem: st.visitStartRem,
        total: busted ? 0 : vd.reduce((a, d) => a + d.points, 0),
        bust: !!busted, checkout: !!checkout
      };
      if (busted) {
        p.remaining = st.visitStartRem;
        vd.forEach(d => { d.points = 0; d.bust = true; d.remAfter = st.visitStartRem; });
        if (p.openedThisVisit) { p.opened = false; }
      }
      p.openedThisVisit = false;
      v.endRem = p.remaining;
      vd.forEach(d => { d.visitTotal = v.total; });
      st.visits.push(v);
      st.visitDarts = [];
      st.lastEvent = busted ? 'bust' : checkout ? 'checkout' : 'visit';
      return v;
    };

    const nextPlayer = () => {
      st.current = (st.current + 1) % n;
      st.visitStartRem = P[st.current].remaining;
    };

    const legWon = (winnerIdx) => {
      const w = P[winnerIdx];
      w.legs++; w.totalLegs++;
      st.legs.push({ set: st.set, leg: st.legGlobal, legInSet: st.legInSet, winner: winnerIdx, starter: st.legStarter, darts: legDarts.length });
      legDarts = [];
      legDartCount.fill(0);
      let setDone = false;
      if (s.setsToWin > 0) {
        if (w.legs >= s.legsToWin) {
          w.sets++; setDone = true;
          if (w.sets >= s.setsToWin) { st.finished = true; st.winner = winnerIdx; }
        }
      } else if (w.legs >= s.legsToWin) { st.finished = true; st.winner = winnerIdx; }
      if (st.finished) { st.lastEvent = 'match'; return; }
      st.legGlobal++;
      if (setDone) {
        P.forEach(p => { p.legs = 0; });
        st.set++; st.legInSet = 1;
        st.setStarter = (st.setStarter + 1) % n;
        st.legStarter = st.setStarter;
        st.lastEvent = 'set';
      } else {
        st.legInSet++;
        st.legStarter = (st.legStarter + 1) % n;
        st.lastEvent = 'leg';
      }
      st.leg = st.legInSet;
      P.forEach(p => { p.remaining = s.startScore; p.opened = s.inMode !== 'double'; p.openedThisVisit = false; });
      st.visitNoByPlayer.fill(0);
      st.current = st.legStarter;
      st.visitStartRem = P[st.current].remaining;
    };

    for (let i = 0; i < throws.length; i++) {
      if (st.finished) break;
      const t = throws[i];
      const p = P[st.current];
      if (st.visitDarts.length === 0) st.visitNoByPlayer[st.current]++;
      const dartNo = st.visitDarts.length + 1;
      const dartsLeft = 4 - dartNo; // ezzel együtt
      const remBefore = p.remaining;
      const score = (t.seg || 0) * (t.mult || 0);
      const finishable = p.opened && C.isFinishable(remBefore, dartsLeft, s.outMode);
      const d = {
        seq: i, player: st.current, playerId: p.id, set: st.set, leg: st.legGlobal, legInSet: st.legInSet,
        visit: st.visitNoByPlayer[st.current], dart: dartNo,
        seg: t.seg || 0, mult: t.mult || 0, score: score, points: 0,
        x: t.x === undefined ? null : t.x, y: t.y === undefined ? null : t.y,
        manual: !!t.manual, filler: !!t.filler, t: t.t || null,
        remBefore: remBefore,
        phase: finishable ? 'checkout' : 'scoring',
        atDouble: p.opened && C.minDarts(remBefore, s.outMode) === 1,
        target: null, bust: false, checkout: false, legDart: ++legDartCount[st.current]
      };
      if (d.atDouble) d.target = targetFor(remBefore, s.outMode);
      // dupla be
      let counted = score;
      if (!p.opened) {
        if (t.mult === 2) { p.opened = true; p.openedThisVisit = true; } else counted = 0;
      }
      d.points = counted;
      const remAfter = remBefore - counted;
      d.remAfter = remAfter;
      st.darts.push(d); st.visitDarts.push(d); legDarts.push(d);

      let bust = false, out = false;
      if (remAfter < 0) bust = true;
      else if (remAfter === 0) {
        if (s.outMode === 'single' || isFinishDart(t, s.outMode)) out = true; else bust = true;
      } else if (remAfter === 1 && s.outMode !== 'single') bust = true;

      if (bust) { endVisit(true, false); nextPlayer(); continue; }
      p.remaining = remAfter;
      if (out) {
        d.checkout = true;
        endVisit(false, true);
        legWon(st.current);
        continue;
      }
      if (st.visitDarts.length === 3) { endVisit(false, false); nextPlayer(); }
    }

    // Aktuális kör állapota
    const cur = P[st.current];
    st.dartsInVisit = st.visitDarts.length;
    st.liveRemaining = cur ? cur.remaining : 0;
    st.liveVisitTotal = st.visitDarts.reduce((a, d) => a + d.points, 0);
    P.forEach(p => {
      const ds = st.darts.filter(d => d.player === p.index);
      const legDs = ds.filter(d => d.leg === st.legGlobal);
      p.matchDarts = ds.length;
      p.matchAvg = avg3(ds);
      p.legDarts = legDs.length;
      p.legAvg = avg3(legDs);
      p.lastVisit = lastOf(st.visits.filter(v => v.player === p.index && v.leg === st.legGlobal));
    });
    if (!st.finished && cur) {
      st.suggestion = cur.opened ? C.suggest(cur.remaining, 3 - st.visitDarts.length, s.outMode) : null;
    }
    return st;
  }

  function lastOf(a) { return a.length ? a[a.length - 1] : null; }
  function avg3(ds) {
    if (!ds.length) return 0;
    return ds.reduce((a, d) => a + d.points, 0) / ds.length * 3;
  }

  function targetFor(rem, outMode) {
    if (outMode === 'single') return null;
    if (rem === 50) return 'DB';
    if (rem % 2 === 0 && rem <= 40) return 'D' + rem / 2;
    return null;
  }

  /** Visszavonás: a kör végi kitöltő (MISS) nyilakat együtt veszi le. */
  function undo(throws) {
    const out = throws.slice();
    if (!out.length) return out;
    if (out[out.length - 1].filler) {
      while (out.length && out[out.length - 1].filler) out.pop();
      return out;
    }
    out.pop();
    return out;
  }

  /** Kör lezárása kevesebb, mint 3 nyíllal: a hiányzókat MISS-ként tölti ki. */
  function fillVisit(settings, throws) {
    const st = compute(settings, throws);
    if (st.finished) return throws.slice();
    const out = throws.slice();
    const missing = st.visitDarts.length === 0 ? 3 : 3 - st.visitDarts.length;
    for (let i = 0; i < missing; i++) out.push({ seg: 0, mult: 0, x: null, y: null, filler: true, t: Date.now() });
    return out;
  }

  function summary(st) {
    const s = st.settings;
    if (s.setsToWin > 0) return st.players.map(p => p.sets).join('–') + ' (szett)';
    return st.players.map(p => p.totalLegs).join('–');
  }

  D.engine = { DEFAULTS, normSettings, makeThrow, compute, undo, fillVisit, summary, targetFor, avg3 };
})(globalThis.D = globalThis.D || {});
