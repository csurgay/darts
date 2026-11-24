/* Darts tábla geometria – minden koordináta milliméterben, a tábla közepétől.
 * x jobbra, y felfelé nő. A szabványos (WDF/PDC) méretek szerint. */
(function (D) {
  'use strict';

  const R = {
    innerBull: 6.35,   // dupla bull (50)
    outerBull: 15.9,   // szimpla bull (25)
    tripleIn: 99,
    tripleOut: 107,
    doubleIn: 162,
    doubleOut: 170,
    numbers: 200,      // számgyűrű közepe (rajzoláshoz)
    frame: 225         // a rajzolt tábla széle
  };

  // Óramutató járása szerint, felülről (20) indulva
  const NUMBERS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

  function sectorIndexOf(num) { return NUMBERS.indexOf(num); }

  /** Szög fokban felülről, óramutató szerint (0..360) */
  function angleDeg(x, y) {
    let a = Math.atan2(x, y) * 180 / Math.PI;
    if (a < 0) a += 360;
    return a;
  }

  /** Egy dobás pontja a koordinátákból. */
  function scoreAt(x, y) {
    const r = Math.hypot(x, y);
    if (r <= R.innerBull) return mk(25, 2);
    if (r <= R.outerBull) return mk(25, 1);
    if (r > R.doubleOut) return mk(0, 0);
    const idx = Math.floor(((angleDeg(x, y) + 9) % 360) / 18);
    const seg = NUMBERS[idx];
    if (r >= R.tripleIn && r <= R.tripleOut) return mk(seg, 3);
    if (r >= R.doubleIn) return mk(seg, 2);
    return mk(seg, 1);
  }

  function mk(seg, mult) {
    return { seg: seg, mult: mult, score: seg * mult, label: label(seg, mult) };
  }

  function label(seg, mult) {
    if (!mult || !seg) return 'MISS';
    if (seg === 25) return mult === 2 ? 'DB' : 'SB';
    return (mult === 3 ? 'T' : mult === 2 ? 'D' : 'S') + seg;
  }

  /** "T20" -> {seg:20, mult:3}; "DB"/"BULL" -> 25/2; "SB"/"25" -> 25/1 */
  function parseLabel(s) {
    s = String(s).toUpperCase().trim();
    if (s === 'DB' || s === 'BULL' || s === 'D25' || s === '50') return mk(25, 2);
    if (s === 'SB' || s === 'S25' || s === '25') return mk(25, 1);
    if (s === 'MISS' || s === '0' || s === 'M') return mk(0, 0);
    const m = /^([SDT]?)(\d{1,2})$/.exec(s);
    if (!m) return null;
    const n = parseInt(m[2], 10);
    if (n < 1 || n > 20) return null;
    return mk(n, m[1] === 'T' ? 3 : m[1] === 'D' ? 2 : 1);
  }

  /** Egy mező közepe (mm), pl. tesztekhez és a billentyűzetes bevitelhez. */
  function centerOf(seg, mult) {
    if (seg === 25) return { x: 0, y: mult === 2 ? 0 : (R.innerBull + R.outerBull) / 2 };
    if (!seg) return null;
    let r;
    if (mult === 3) r = (R.tripleIn + R.tripleOut) / 2;
    else if (mult === 2) r = (R.doubleIn + R.doubleOut) / 2;
    else r = (R.tripleOut + R.doubleIn) / 2; // külső szimpla
    const a = sectorIndexOf(seg) * 18 * Math.PI / 180;
    return { x: r * Math.sin(a), y: r * Math.cos(a) };
  }

  /** Pont elforgatása a középpont körül (fok, óramutató szerint). */
  function rotate(x, y, deg) {
    const a = -deg * Math.PI / 180;
    return { x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) };
  }

  /** Elforgatja a pontot úgy, hogy a megadott szektor kerüljön felülre (a 20 helyére). */
  function normalizeToTop(x, y, seg) {
    const idx = sectorIndexOf(seg);
    if (idx < 0) return { x: x, y: y };
    return rotate(x, y, -idx * 18);
  }

  D.geo = { R, NUMBERS, scoreAt, label, parseLabel, centerOf, rotate, normalizeToTop, angleDeg, mk, sectorIndexOf };
})(globalThis.D = globalThis.D || {});
