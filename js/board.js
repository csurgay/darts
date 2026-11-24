/* Darts tábla rajzolása (canvas) és bevitel nagyítóval. */
(function (D) {
  'use strict';
  const G = D.geo, R = G.R;

  const COL = {
    black: '#151515', cream: '#efe3bd', red: '#d3202b', green: '#0f8a3c',
    wire: 'rgba(200,200,200,.55)', frame: '#0b0b0b', num: '#f2f2f2'
  };

  class Board {
    /**
     * @param canvas  <canvas>
     * @param opts    {view:{cx,cy,half} (mm), interactive, onThrow(x,y), loupe:bool}
     */
    constructor(canvas, opts) {
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.o = Object.assign({ view: { cx: 0, cy: 0, half: R.frame }, interactive: false, loupe: true }, opts || {});
      this.marks = [];     // aktuális kör nyilai [{x,y,label}]
      this.cloud = [];     // [{x,y,color,r}]
      this.ghost = [];     // halvány korábbi nyilak
      this.cache = null;
      if (this.o.interactive) this.bindInput();
      this.resize();
      // ha a doboz mérete változik (elforgatás, tartalom), újrarajzol
      if (globalThis.ResizeObserver) {
        this.ro = new ResizeObserver(() => {
          const r = this.c.getBoundingClientRect();
          if (Math.abs(r.width - this.w) > 1 || Math.abs(r.height - this.h) > 1) this.resize();
        });
        this.ro.observe(this.c);
      }
    }

    resize() {
      const rect = this.c.getBoundingClientRect();
      const dpr = globalThis.devicePixelRatio || 1;
      const w = Math.max(50, Math.round(rect.width)), h = Math.max(50, Math.round(rect.height));
      this.w = w; this.h = h; this.dpr = dpr;
      this.c.width = Math.round(w * dpr); this.c.height = Math.round(h * dpr);
      const v = this.o.view;
      this.scale = Math.min(w, h) / (2 * v.half);
      this.cx = w / 2 - v.cx * this.scale;
      this.cy = h / 2 + v.cy * this.scale;
      this.cache = null;
      this.draw();
    }

    setView(view) { this.o.view = view; this.resize(); }

    toPx(x, y) { return { x: this.cx + x * this.scale, y: this.cy - y * this.scale }; }
    toMm(px, py) { return { x: (px - this.cx) / this.scale, y: (this.cy - py) / this.scale }; }

    renderBoard() {
      const off = document.createElement('canvas');
      off.width = this.c.width; off.height = this.c.height;
      const g = off.getContext('2d');
      g.scale(this.dpr, this.dpr);
      g.translate(this.cx, this.cy);
      const s = this.scale;
      const ring = (r0, r1, a0, a1, col) => {
        g.beginPath();
        g.arc(0, 0, r1 * s, a0, a1);
        g.arc(0, 0, r0 * s, a1, a0, true);
        g.closePath(); g.fillStyle = col; g.fill();
      };
      // keret
      g.beginPath(); g.arc(0, 0, R.frame * s, 0, Math.PI * 2); g.fillStyle = COL.frame; g.fill();
      const step = Math.PI / 10;
      for (let i = 0; i < 20; i++) {
        const a0 = -Math.PI / 2 - step / 2 + i * step, a1 = a0 + step;
        const even = i % 2 === 0;
        ring(R.outerBull, R.tripleIn, a0, a1, even ? COL.black : COL.cream);
        ring(R.tripleIn, R.tripleOut, a0, a1, even ? COL.red : COL.green);
        ring(R.tripleOut, R.doubleIn, a0, a1, even ? COL.black : COL.cream);
        ring(R.doubleIn, R.doubleOut, a0, a1, even ? COL.red : COL.green);
      }
      g.beginPath(); g.arc(0, 0, R.outerBull * s, 0, Math.PI * 2); g.fillStyle = COL.green; g.fill();
      g.beginPath(); g.arc(0, 0, R.innerBull * s, 0, Math.PI * 2); g.fillStyle = COL.red; g.fill();
      // drótok
      g.strokeStyle = COL.wire; g.lineWidth = Math.max(0.5, s * 0.9);
      [R.innerBull, R.outerBull, R.tripleIn, R.tripleOut, R.doubleIn, R.doubleOut].forEach(r => { g.beginPath(); g.arc(0, 0, r * s, 0, Math.PI * 2); g.stroke(); });
      for (let i = 0; i < 20; i++) {
        const a = -Math.PI / 2 - step / 2 + i * step;
        g.beginPath();
        g.moveTo(Math.cos(a) * R.outerBull * s, Math.sin(a) * R.outerBull * s);
        g.lineTo(Math.cos(a) * R.doubleOut * s, Math.sin(a) * R.doubleOut * s);
        g.stroke();
      }
      // számok
      g.fillStyle = COL.num; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `bold ${Math.round(Math.min(24 * s, 30))}px "Oswald", "Arial Narrow", Arial, sans-serif`;
      for (let i = 0; i < 20; i++) {
        const a = -Math.PI / 2 + i * step;
        g.fillText(G.NUMBERS[i], Math.cos(a) * R.numbers * s, Math.sin(a) * R.numbers * s);
      }
      this.cache = off;
    }

    draw() {
      const g = this.ctx;
      if (!this.cache) this.renderBoard();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, this.c.width, this.c.height);
      g.drawImage(this.cache, 0, 0);
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      // felhő
      const cr = this.o.cloudRadius || Math.max(2, 3.2 * this.scale);
      this.cloud.forEach(p => {
        const q = this.toPx(p.x, p.y);
        g.beginPath(); g.arc(q.x, q.y, p.r || cr, 0, Math.PI * 2);
        g.fillStyle = p.color || 'rgba(0,200,255,.55)'; g.fill();
      });
      this.ghost.forEach(p => this.drawDart(p, true));
      this.marks.forEach((p, i) => this.drawDart(p, false, i + 1));
      if (this.o.afterDraw) this.o.afterDraw(g, this);
    }

    drawDart(p, faded, n) {
      if (p.x === null || p.x === undefined) return;
      const g = this.ctx, q = this.toPx(p.x, p.y);
      const r = Math.max(6, 5 * this.scale);
      g.save();
      g.globalAlpha = faded ? 0.35 : 1;
      g.beginPath(); g.arc(q.x, q.y, r, 0, Math.PI * 2);
      g.fillStyle = '#ffd400'; g.fill();
      g.lineWidth = 2; g.strokeStyle = '#111'; g.stroke();
      if (n) {
        g.fillStyle = '#111'; g.font = `bold ${Math.round(r * 1.2)}px Arial`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(n, q.x, q.y + 0.5);
      }
      g.restore();
    }

    // ---------------- Bevitel ----------------
    bindInput() {
      const c = this.c;
      c.style.touchAction = 'none';
      const loupe = document.createElement('canvas');
      loupe.className = 'loupe';
      loupe.style.display = 'none';
      (c.parentElement || document.body).appendChild(loupe);
      this.loupe = loupe;
      let active = null;
      const pos = e => {
        const r = c.getBoundingClientRect();
        return { px: e.clientX - r.left, py: e.clientY - r.top };
      };
      c.addEventListener('pointerdown', e => {
        if (this.o.disabled) return;
        e.preventDefault();
        c.setPointerCapture && c.setPointerCapture(e.pointerId);
        active = e.pointerId;
        this.showLoupe(pos(e));
      });
      c.addEventListener('pointermove', e => {
        if (active !== e.pointerId) return;
        e.preventDefault();
        this.showLoupe(pos(e));
      });
      const end = (e, cancel) => {
        if (active !== e.pointerId) return;
        active = null;
        loupe.style.display = 'none';
        if (cancel) return;
        const p = pos(e);
        const mm = this.toMm(p.px, p.py);
        if (this.o.onThrow) this.o.onThrow(mm.x, mm.y);
      };
      c.addEventListener('pointerup', e => end(e, false));
      c.addEventListener('pointercancel', e => end(e, true));
    }

    showLoupe(p) {
      if (!this.o.loupe) return;
      const L = this.loupe, size = 120, zoom = 2.6, dpr = this.dpr;
      L.width = size * dpr; L.height = size * dpr;
      L.style.width = size + 'px'; L.style.height = size + 'px';
      // a nagyító az ujj fölött, a képernyőn belül
      let lx = p.px - size / 2, ly = p.py - size - 40;
      if (ly < 0) ly = p.py + 40;
      lx = Math.max(0, Math.min(this.w - size, lx));
      L.style.left = (this.c.offsetLeft + lx) + 'px';
      L.style.top = (this.c.offsetTop + ly) + 'px';
      L.style.display = 'block';
      const g = L.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, L.width, L.height);
      g.save();
      g.beginPath(); g.arc(L.width / 2, L.height / 2, L.width / 2 - 2, 0, Math.PI * 2); g.clip();
      g.fillStyle = '#000'; g.fillRect(0, 0, L.width, L.height);
      const sw = (size / zoom) * dpr;
      g.drawImage(this.c, p.px * dpr - sw / 2, p.py * dpr - sw / 2, sw, sw, 0, 0, L.width, L.height);
      g.restore();
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.strokeStyle = '#fff'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(size / 2, 10); g.lineTo(size / 2, size - 10); g.moveTo(10, size / 2); g.lineTo(size - 10, size / 2); g.stroke();
      g.strokeStyle = '#ffd400'; g.lineWidth = 3;
      g.beginPath(); g.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2); g.stroke();
      const mm = this.toMm(p.px, p.py), h = G.scoreAt(mm.x, mm.y);
      g.fillStyle = 'rgba(0,0,0,.75)'; g.fillRect(size / 2 - 26, size - 30, 52, 20);
      g.fillStyle = '#ffd400'; g.font = 'bold 15px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(h.label, size / 2, size - 20);
    }
  }

  /** Színskála régi→új: kék → narancs */
  function ageColor(t, alpha) {
    t = Math.max(0, Math.min(1, t));
    const a = [64, 156, 255], b = [255, 120, 30];
    const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
    return `rgba(${c[0]},${c[1]},${c[2]},${alpha === undefined ? 0.7 : alpha})`;
  }

  D.Board = Board;
  D.boardUtil = { ageColor, COL };
})(globalThis.D = globalThis.D || {});
