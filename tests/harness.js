/* Minimális tesztkeret – böngészőben (Beállítások / Autotesztek) és node-ban is fut. */
(function (D) {
  'use strict';
  const tests = [];

  class AssertError extends Error {}
  const A = {
    ok(c, msg) { if (!c) throw new AssertError(msg || 'feltétel nem teljesül'); },
    eq(a, b, msg) { if (a !== b) throw new AssertError((msg ? msg + ': ' : '') + `várt ${fmt(b)}, kapott ${fmt(a)}`); },
    near(a, b, eps, msg) { if (!(Math.abs(a - b) <= (eps || 1e-6))) throw new AssertError((msg ? msg + ': ' : '') + `várt ≈${b}, kapott ${a}`); },
    deepEq(a, b, msg) { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new AssertError((msg ? msg + ': ' : '') + `várt ${y}, kapott ${x}`); },
    async rejects(p, msg) { let ok = false; try { await p; } catch (e) { ok = true; } if (!ok) throw new AssertError(msg || 'hibát vártunk'); }
  };
  function fmt(v) { try { return JSON.stringify(v); } catch (e) { return String(v); } }

  /** opts: {needs: 'server' | 'dom'} */
  function add(group, name, fn, opts) { tests.push({ group, name, fn, opts: opts || {} }); }

  async function run(ctx, onResult, filter) {
    ctx = ctx || {};
    const out = [];
    const emit = r => { out.push(r); if (onResult) onResult(r); };
    for (const t of tests) {
      if (filter && !filter(t)) continue;
      const need = t.opts.needs;
      if (need && !ctx[need]) { emit({ group: t.group, name: t.name, status: 'skip', msg: need === 'server' ? 'nincs szerver (helyi mód)' : 'nincs böngésző', ms: 0 }); continue; }
      const t0 = Date.now();
      try {
        const r = await t.fn(A, ctx);
        if (r && Array.isArray(r.sub)) {
          r.sub.forEach(s => emit({ group: t.group, name: s.name, status: s.ok ? 'ok' : 'fail', msg: s.ok ? (s.msg && s.msg !== 'ok' ? s.msg : '') : s.msg, ms: s.ms || 0 }));
        } else emit({ group: t.group, name: t.name, status: 'ok', msg: typeof r === 'string' ? r : '', ms: Date.now() - t0 });
      } catch (e) {
        emit({ group: t.group, name: t.name, status: 'fail', msg: e && e.message ? e.message : String(e), ms: Date.now() - t0 });
      }
    }
    return out;
  }

  D.testing = { add, run, tests, A };
})(globalThis.D = globalThis.D || {});
