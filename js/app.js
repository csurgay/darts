/* Darts számláló – alkalmazás (képernyők, navigáció). */
(function (D) {
  'use strict';
  const E = D.engine, G = D.geo, S = D.stats, LS = D.store.LS;

  // ---------------- Beállítások ----------------
  const CFG_KEY = 'darts.config';
  const ACTIVE_KEY = 'darts.active';
  const cfg = Object.assign({
    storage: 'server', apiBase: 'api/', apiKey: '',
    caller: false, callerLang: 'en', loupe: true, vibrate: true,
    lastSettings: null, lastPlayers: []
  }, LS.get(CFG_KEY, {}));
  function saveCfg() { LS.set(CFG_KEY, cfg); D.caller.cfg = { enabled: cfg.caller, lang: cfg.callerLang }; }
  D.caller.cfg = { enabled: cfg.caller, lang: cfg.callerLang };
  let store = D.store.createStore(cfg);
  function resetStore() { store = D.store.createStore(cfg); }

  const $app = document.getElementById('app');
  const $modal = document.getElementById('modal');
  const $toast = document.getElementById('toast');

  // ---------------- Segédek ----------------
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function f1(v) { return v === null || v === undefined || isNaN(v) ? '–' : v.toFixed(1); }
  function f0(v) { return v === null || v === undefined || isNaN(v) ? '–' : Math.round(v).toString(); }
  function pct(v) { return v === null || v === undefined ? '–' : v.toFixed(1) + '%'; }
  function dateStr(ms) {
    if (!ms) return '';
    const d = new Date(ms);
    return d.toLocaleDateString('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' + d.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
  }
  let toastT = null;
  function toast(msg, ms) {
    $toast.textContent = msg; $toast.classList.remove('hidden');
    clearTimeout(toastT); toastT = setTimeout(() => $toast.classList.add('hidden'), ms || 2500);
  }
  function vibrate(ms) { if (cfg.vibrate && navigator.vibrate) try { navigator.vibrate(ms || 15); } catch (e) { /* */ } }

  /** Modális ablak. A [data-m] gombok értékével tér vissza (Promise). */
  function modal(html, opts) {
    opts = opts || {};
    return new Promise(resolve => {
      $modal.innerHTML = `<div class="box">${html}</div>`;
      $modal.classList.remove('hidden');
      let timer = null;
      const close = v => {
        clearTimeout(timer);
        $modal.classList.add('hidden'); $modal.innerHTML = ''; $modal.onclick = null;
        resolve(v);
      };
      $modal.onclick = e => {
        const b = e.target.closest('[data-m]');
        if (b) return close(b.dataset.m);
        if (e.target === $modal && opts.dismiss !== false) close(null);
      };
      if (opts.timeout) timer = setTimeout(() => close('timeout'), opts.timeout);
      if (opts.onOpen) opts.onOpen($modal.querySelector('.box'), close);
    });
  }
  async function confirmBox(text, okLabel) {
    const r = await modal(`<p>${esc(text)}</p><div class="actions"><button class="btn" data-m="no">Mégse</button><button class="btn danger" data-m="yes">${esc(okLabel || 'Igen')}</button></div>`);
    return r === 'yes';
  }

  // ---------------- Navigáció ----------------
  let cleanup = null, onResize = null;
  function go(route) { if (location.hash === '#' + route) render(); else location.hash = '#' + route; }
  function render() {
    if (cleanup) { try { cleanup(); } catch (e) { /* */ } cleanup = null; }
    onResize = null;
    const h = (location.hash || '#home').slice(1).split('/');
    const fn = SCREENS[h[0]] || SCREENS.home;
    $app.innerHTML = '';
    Promise.resolve(fn(h[1] ? decodeURIComponent(h[1]) : null)).then(c => { if (typeof c === 'function') cleanup = c; })
      .catch(e => { console.error(e); $app.innerHTML = `<div class="screen">${topbar('Hiba')}<div class="scroll"><div class="card">${esc(e.message)}</div></div></div>`; });
  }
  window.addEventListener('hashchange', render);
  window.addEventListener('resize', () => { if (onResize) onResize(); });

  function topbar(title, right) {
    return `<div class="topbar"><button class="iconbtn" data-go="home" aria-label="Vissza">‹</button><h1>${esc(title)}</h1>${right || ''}</div>`;
  }
  $app.addEventListener('click', e => {
    const b = e.target.closest('[data-go]');
    if (b) { e.preventDefault(); go(b.dataset.go); }
  });

  // ---------------- Eredményjelző ----------------
  function formatLabel(s) {
    const st = s.startScore + (s.outMode === 'double' ? ' DO' : s.outMode === 'master' ? ' MO' : ' SO') + (s.inMode === 'double' ? ' DI' : '');
    if (s.setsToWin > 0) return `${st} · ${s.setsToWin} szett · szettenként ${s.legsToWin} leg`;
    return `${st} · Első ${s.legsToWin} leg`;
  }

  function scoreboardHtml(st, opts) {
    opts = opts || {};
    const s = st.settings, sets = s.setsToWin > 0;
    const rows = st.players.map(p => {
      const active = !st.finished && p.index === st.current;
      const win = st.finished && st.winner === p.index;
      const score = active && opts.live ? p.remaining : p.remaining;
      return `<div class="sb-row ${active ? 'active' : ''} ${win ? 'winner' : ''}">
        <div class="ind"></div>
        <div class="name"><span class="n">${esc(p.name)}</span><span class="a">Átl. ${f1(p.matchAvg)} · ${p.legDarts} nyíl</span></div>
        <div class="sets">${sets ? p.sets : ''}</div>
        <div class="legs">${p.legs}</div>
        <div class="score">${score}</div>
      </div>`;
    }).join('');
    const cur = st.players[st.current];
    let route = st.finished ? '' : (st.suggestion ? st.suggestion.join('  ') : '');
    const vd = st.visitDarts || [];
    const dartBox = i => `<div class="dart">${vd[i] ? (vd[i].filler ? '–' : esc(G.label(vd[i].seg, vd[i].mult))) : ''}</div>`;
    const info = st.finished
      ? `<div class="route">${esc(st.players[st.winner].name)} nyert · ${esc(E.summary(st))}</div>`
      : `<div class="route ${route ? '' : 'none'}">${route ? esc(route) : (cur && !cur.opened ? 'Dupla be kell' : (cur && cur.remaining <= 170 ? 'Nincs kiszálló ' + (3 - vd.length) + ' nyílból' : 'Tömeg'))}</div>${dartBox(0)}${dartBox(1)}${dartBox(2)}<div class="vt">${vd.length ? st.liveVisitTotal : ''}</div>`;
    return `<div class="sb ${sets ? '' : 'nosets'}">
      <div class="sb-head"><div></div><div class="fmt">${esc(formatLabel(s))}</div><div class="c">${sets ? 'Szett' : ''}</div><div class="c">Leg</div><div></div></div>
      ${rows}
      <div class="sb-info">${info}</div>
    </div>`;
  }

  // ---------------- Főmenü ----------------
  function screenHome() {
    const active = LS.get(ACTIVE_KEY, null);
    const act = active && active.status === 'active';
    $app.innerHTML = `<div class="screen home">
      <div class="logo"><div class="big">DARTS<b>·</b>SZÁMLÁLÓ</div><div class="sub">Minden nyíl számít</div></div>
      ${act ? `<button class="menu-btn primary" data-go="game"><span class="ic">▶</span><span>Folytatás<small>${esc(active.settings.players.map(p => p.name).join(' – '))}</small></span></button>` : ''}
      <button class="menu-btn ${act ? '' : 'primary'}" data-go="new"><span class="ic">🎯</span><span>Új meccs<small>301 / 501 / 701, leg és szett</small></span></button>
      <button class="menu-btn" data-go="players"><span class="ic">👤</span><span>Játékosok</span></button>
      <button class="menu-btn" data-go="matches"><span class="ic">📼</span><span>Meccsek, visszajátszás</span></button>
      <button class="menu-btn" data-go="stats"><span class="ic">📈</span><span>Statisztika, dobásfelhők</span></button>
      <button class="menu-btn" data-go="config"><span class="ic">⚙</span><span>Beállítások, tesztek</span></button>
      <div class="muted small" style="text-align:center;margin-top:6px" id="syncinfo"></div>
    </div>`;
    syncInfo();
  }
  async function syncInfo() {
    const el = document.getElementById('syncinfo');
    if (!el) return;
    if (store.kind === 'local') { el.textContent = 'Tárolás: csak ezen az eszközön'; return; }
    try { await store.ping(); el.textContent = 'Szerver: kapcsolódva' + (store.pending() ? ` · ${store.pending()} feltöltésre vár` : ''); }
    catch (e) { el.textContent = 'Szerver nem elérhető – offline mód' + (store.pending() ? ` · ${store.pending()} feltöltésre vár` : ''); }
  }

  // ---------------- Játékosok ----------------
  async function playerModal(p) {
    p = p || {};
    const isNew = !p.id;
    const r = await modal(`<h2>${isNew ? 'Új játékos' : 'Játékos'}</h2>
      <label class="field"><span>Név</span><input class="input" id="pm-name" value="${esc(p.name || '')}" maxlength="100" autocomplete="off"></label>
      <label class="field"><span>Becenév (nem kötelező)</span><input class="input" id="pm-nick" value="${esc(p.nickname || '')}" maxlength="100" autocomplete="off"></label>
      <div class="actions">
        ${isNew ? '' : '<button class="btn danger" data-m="del">Törlés</button><button class="btn" data-m="stats">Statisztika</button>'}
        <button class="btn" data-m="cancel">Mégse</button><button class="btn primary" data-m="save">Mentés</button>
      </div>`, {
      onOpen: (box, close) => {
        const i = box.querySelector('#pm-name'); setTimeout(() => i.focus(), 50);
        box.addEventListener('keydown', e => { if (e.key === 'Enter') box.querySelector('[data-m=save]').click(); });
        box.addEventListener('click', e => {
          const b = e.target.closest('[data-m=save]');
          if (b) { p._name = box.querySelector('#pm-name').value.trim(); p._nick = box.querySelector('#pm-nick').value.trim(); }
        }, true);
      }
    });
    if (r === 'save') {
      if (!p._name) { toast('A név kötelező'); return null; }
      const saved = await store.savePlayer({ id: p.id, name: p._name, nickname: p._nick, created: p.created, archived: false });
      toast('Mentve');
      return saved;
    }
    if (r === 'del') {
      if (!await confirmBox(`Törlöd: ${p.name}? Ha már vannak meccsei, csak archiválódik (a statisztikák megmaradnak).`, 'Törlés')) return null;
      const res = await store.deletePlayer(p.id);
      toast(res && res.archived ? 'Archiválva' : 'Törölve');
      return { deleted: true };
    }
    if (r === 'stats') { go('stats/' + p.id); return null; }
    return null;
  }

  async function screenPlayers() {
    $app.innerHTML = `<div class="screen">${topbar('Játékosok', '<button class="iconbtn" id="add" aria-label="Új">＋</button>')}<div class="scroll"><div class="list" id="pl"><div class="muted">Betöltés…</div></div></div></div>`;
    const load = async () => {
      const list = await store.listPlayers();
      const el = document.getElementById('pl');
      if (!el) return;
      el.innerHTML = list.length ? list.map(p => `<div class="item" data-id="${esc(p.id)}"><div class="main"><div class="t">${esc(p.name)}</div>${p.nickname ? `<div class="s">„${esc(p.nickname)}”</div>` : ''}</div><span class="muted">›</span></div>`).join('')
        : '<div class="card muted">Még nincs játékos. Vegyél fel egyet a ＋ gombbal.</div>';
      el.onclick = async e => {
        const it = e.target.closest('.item'); if (!it) return;
        const p = list.find(x => x.id === it.dataset.id);
        if (await playerModal(p)) load();
      };
    };
    document.getElementById('add').onclick = async () => { if (await playerModal()) load(); };
    await load();
  }

  // ---------------- Új meccs ----------------
  async function screenNew() {
    const players = await store.listPlayers();
    const s = Object.assign({}, E.DEFAULTS, cfg.lastSettings || {});
    let sel = (cfg.lastPlayers || []).filter(id => players.some(p => p.id === id));
    const segBtns = (name, opts, val) => `<div class="seg" data-name="${name}">${opts.map(o => `<button data-v="${o[0]}" class="${String(o[0]) === String(val) ? 'on' : ''}">${o[1]}</button>`).join('')}</div>`;
    $app.innerHTML = `<div class="screen">${topbar('Új meccs')}<div class="scroll">
      <div class="card"><h2>Játékosok (dobási sorrend)</h2><div class="chips" id="chips"></div>
        <div class="row" style="margin-top:12px"><button class="btn" id="addp">＋ Új játékos</button><button class="btn" id="shuffle">🎲 Sorsolás</button></div></div>
      <div class="card"><h2>Játék</h2>
        ${segBtns('startScore', [[301, '301'], [501, '501'], [701, '701'], [1001, '1001']], s.startScore)}
        <h3>Kiszálló</h3>${segBtns('outMode', [['double', 'Dupla'], ['single', 'Szimpla'], ['master', 'Master']], s.outMode)}
        <h3>Kezdés</h3>${segBtns('inMode', [['straight', 'Egyenes'], ['double', 'Dupla be']], s.inMode)}
      </div>
      <div class="card"><h2>Formátum</h2>
        <h3>Szettek</h3>${segBtns('setsToWin', [[0, 'Nincs'], [2, 'Első 2'], [3, 'Első 3'], [4, 'Első 4'], [7, 'Első 7']], s.setsToWin)}
        <h3 id="legh">Legek</h3>${segBtns('legsToWin', [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6'], [7, '7'], [11, '11']], s.legsToWin)}
        <div class="muted small" id="fmt" style="margin-top:8px"></div>
      </div>
      <button class="btn primary block" id="start" style="padding:16px;font-size:18px">Indítás</button>
    </div></div>`;
    const chips = document.getElementById('chips');
    const drawChips = () => {
      chips.innerHTML = players.length ? players.map(p => {
        const i = sel.indexOf(p.id);
        return `<button class="chip ${i >= 0 ? 'on' : ''}" data-id="${esc(p.id)}">${esc(p.name)}${i >= 0 ? `<span class="ord">${i + 1}</span>` : ''}</button>`;
      }).join('') : '<span class="muted">Előbb vegyél fel játékost.</span>';
      document.getElementById('legh').textContent = s.setsToWin > 0 ? 'Legek szettenként (első X)' : 'Legek (első X nyer)';
      document.getElementById('fmt').textContent = formatLabel(E.normSettings(s));
    };
    chips.onclick = e => {
      const c = e.target.closest('.chip'); if (!c) return;
      const id = c.dataset.id, i = sel.indexOf(id);
      if (i >= 0) sel.splice(i, 1); else if (sel.length < 8) sel.push(id);
      drawChips();
    };
    $app.querySelectorAll('.seg').forEach(seg => seg.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      const v = b.dataset.v; s[seg.dataset.name] = isNaN(v) ? v : Number(v);
      drawChips();
    }));
    document.getElementById('addp').onclick = async () => {
      const p = await playerModal();
      if (p && p.id) { players.push(p); sel.push(p.id); drawChips(); }
    };
    document.getElementById('shuffle').onclick = () => {
      for (let i = sel.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [sel[i], sel[j]] = [sel[j], sel[i]]; }
      drawChips(); toast(sel.length ? 'Kezd: ' + players.find(p => p.id === sel[0]).name : 'Nincs kiválasztott játékos');
    };
    document.getElementById('start').onclick = async () => {
      if (!sel.length) return toast('Válassz legalább egy játékost');
      const active = LS.get(ACTIVE_KEY, null);
      if (active && active.status === 'active' && !await confirmBox('Van folyamatban lévő meccs. Az megmarad a Meccsek között (folytatható onnan). Új meccset indítasz?', 'Új meccs')) return;
      cfg.lastSettings = { startScore: s.startScore, outMode: s.outMode, inMode: s.inMode, legsToWin: s.legsToWin, setsToWin: s.setsToWin };
      cfg.lastPlayers = sel.slice(); saveCfg();
      const settings = E.normSettings(Object.assign({}, cfg.lastSettings, { startingPlayer: 0, players: sel.map(id => { const p = players.find(x => x.id === id); return { id: p.id, name: p.name }; }) }));
      await startMatch(settings);
    };
    drawChips();
  }

  async function startMatch(settings) {
    const m = { id: D.store.uuid(), created: Date.now(), updated: Date.now(), status: 'active', settings, throws: [], winnerId: null, summary: '' };
    LS.set(ACTIVE_KEY, m);
    persist(m);
    go('game');
  }

  async function persist(m) {
    try { await store.saveMatch(JSON.parse(JSON.stringify(m))); }
    catch (e) { console.warn(e); toast('Mentési hiba: ' + e.message); }
  }

  // ---------------- Játék ----------------
  function screenGame(id) {
    let m = LS.get(ACTIVE_KEY, null);
    if (!m || (id && m.id !== id)) { go('home'); return; }
    $app.innerHTML = `<div class="screen game">
      <div class="layout">
        <div class="sbcol"><div id="sb"></div></div>
        <div class="board-wrap" id="bw"><canvas class="board" id="board"></canvas><div class="flash" id="flash"></div></div>
      </div>
      <div class="controls">
        <button id="menu" aria-label="Menü">☰</button>
        <button id="undo">↶ Vissza</button>
        <button id="kp">⌨ Mezők</button>
        <button class="miss" id="ok">Kör vége</button>
      </div>
      <div class="keypad hidden" id="keypad"></div>
    </div>`;
    const $sb = document.getElementById('sb'), $flash = document.getElementById('flash'), $kp = document.getElementById('keypad');
    let st = E.compute(m.settings, m.throws);
    const board = new D.Board(document.getElementById('board'), { interactive: true, loupe: cfg.loupe, onThrow: (x, y) => addThrow({ x, y }) });
    onResize = () => { board.resize(); };
    let flashT = null;
    const flash = (txt, cls) => {
      $flash.textContent = txt; $flash.className = 'flash show ' + (cls || '');
      clearTimeout(flashT); flashT = setTimeout(() => { $flash.className = 'flash ' + (cls || ''); }, 1100);
    };

    function update() {
      st = E.compute(m.settings, m.throws);
      $sb.innerHTML = scoreboardHtml(st, { live: true });
      if (st.visitDarts.length) { board.marks = st.visitDarts; board.ghost = []; }
      else { board.marks = []; const lv = st.visits[st.visits.length - 1]; board.ghost = lv ? lv.darts : []; }
      board.o.disabled = st.finished;
      board.draw();
      document.getElementById('ok').textContent = st.visitDarts.length ? 'Kör vége' : 'Nem dobott';
      document.getElementById('undo').disabled = !m.throws.length;
    }

    function addThrow(inp) {
      if (st.finished) return;
      const before = st;
      m.throws.push(E.makeThrow(inp));
      vibrate();
      afterChange(before);
    }

    function afterChange(before) {
      m.updated = Date.now();
      update();
      let visitEnded = st.visits.length > before.visits.length;
      if (st.finished) {
        m.status = 'finished'; m.winnerId = st.players[st.winner].id; m.summary = E.summary(st);
      } else { m.status = 'active'; m.winnerId = null; m.summary = E.summary(st); }
      LS.set(ACTIVE_KEY, m);
      if (!visitEnded) return;
      const v = st.visits[st.visits.length - 1];
      const pl = st.players[v.player];
      persist(m);
      if (v.checkout) {
        flash(v.startRem + ' ✓');
        if (st.finished) {
          D.caller.gameShot(pl.name, 'match');
          setTimeout(() => matchOver(), 700);
        } else {
          D.caller.gameShot(pl.name, st.lastEvent === 'set' ? 'set' : 'leg');
          legOver(v);
        }
        return;
      }
      if (v.bust) { flash('BUST', 'bust'); vibrate(120); D.caller.visit(0, true); }
      else { flash(v.total === 180 ? '180!' : String(v.total)); if (v.total === 180) vibrate([60, 40, 60, 40, 120]); D.caller.visit(v.total); }
      const nx = st.players[st.current];
      if (nx && nx.opened && nx.remaining <= 170 && D.checkout.isFinishable(nx.remaining, 3, m.settings.outMode)) setTimeout(() => D.caller.require(nx.name, nx.remaining), 1300);
    }

    async function legOver(v) {
      const lastLeg = st.legs[st.legs.length - 1];
      const p = st.players[lastLeg.winner];
      const legDarts = st.darts.filter(d => d.leg === lastLeg.leg && d.player === lastLeg.winner);
      const r = await modal(`<h2>${st.lastEvent === 'set' ? 'Szett' : 'Leg'} – ${esc(p.name)}</h2>
        <p>Kiszálló: <b>${v.startRem}</b> · ${legDarts.length} nyíl · leg átlag ${f1(E.avg3(legDarts))}</p>
        <p class="muted">${st.players.map(x => esc(x.name) + ': ' + (m.settings.setsToWin ? x.sets + ' szett, ' : '') + x.legs + ' leg').join(' · ')}</p>
        <div class="actions"><button class="btn" data-m="undo">↶ Tévedés, vissza</button><button class="btn primary" data-m="ok">Következő leg</button></div>`, { timeout: 6000 });
      if (r === 'undo') doUndo();
    }

    async function matchOver() {
      const rows = st.players.map(p => {
        const ss = S.forPlayer([m], p.id);
        return `<tr><td>${esc(p.name)}${st.winner === p.index ? ' ★' : ''}</td><td>${f1(ss.avg3)}</td><td>${f1(ss.first9)}</td><td>${pct(ss.checkout.pct)}</td><td>${ss.scoring.t180}</td><td>${ss.checkout.highest || '–'}</td></tr>`;
      }).join('');
      const r = await modal(`<h2>${esc(st.players[st.winner].name)} nyert!</h2>
        <p class="sum">${esc(E.summary(st))}</p>
        <table class="t"><tr><th>Játékos</th><th>Átl.</th><th>Első 9</th><th>Kiszálló</th><th>180</th><th>Max</th></tr>${rows}</table>
        <div class="actions"><button class="btn" data-m="undo">↶ Vissza</button><button class="btn" data-m="replay">📼 Visszajátszás</button></div>
        <div class="actions"><button class="btn" data-m="rematch">Visszavágó</button><button class="btn primary" data-m="home">Főmenü</button></div>`, { dismiss: false });
      if (r === 'undo') return doUndo();
      await persist(m);
      LS.del(ACTIVE_KEY);
      if (r === 'replay') go('replay/' + m.id);
      else if (r === 'rematch') {
        const s2 = Object.assign({}, m.settings, { players: m.settings.players.slice(1).concat(m.settings.players.slice(0, 1)) });
        startMatch(s2);
      } else go('home');
    }

    function doUndo() {
      if (!m.throws.length) return;
      m.throws = E.undo(m.throws);
      const before = st;
      update();
      m.status = st.finished ? 'finished' : 'active';
      m.winnerId = st.finished ? st.players[st.winner].id : null;
      m.summary = E.summary(st);
      m.updated = Date.now();
      LS.set(ACTIVE_KEY, m);
      if (before.visits.length !== st.visits.length) persist(m);
      vibrate(30);
    }

    // billentyűzet (mezők gombokkal, koordináta nélkül)
    let kpMult = 1;
    const drawKp = () => {
      $kp.innerHTML = `<div class="mult">${[[1, 'Szimpla'], [2, 'Dupla'], [3, 'Tripla']].map(x => `<button data-mult="${x[0]}" class="${kpMult === x[0] ? 'on' : ''}">${x[1]}</button>`).join('')}</div>
        <div class="nums">${Array.from({ length: 20 }, (_, i) => `<button data-n="${i + 1}">${i + 1}</button>`).join('')}</div>
        <div class="bottom"><button data-n="25">${kpMult === 2 ? 'Bull 50' : 'Bull 25'}</button><button data-n="0">Mellé</button><button data-close="1">Tábla ▾</button></div>`;
    };
    $kp.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.mult) { kpMult = Number(b.dataset.mult); drawKp(); return; }
      if (b.dataset.close) { $kp.classList.add('hidden'); return; }
      if (b.dataset.n !== undefined) {
        const n = Number(b.dataset.n);
        const mult = n === 0 ? 0 : n === 25 ? Math.min(kpMult, 2) : kpMult;
        addThrow({ seg: n, mult, manual: true });
        kpMult = 1; drawKp();
      }
    };
    drawKp();

    document.getElementById('undo').onclick = doUndo;
    document.getElementById('kp').onclick = () => $kp.classList.toggle('hidden');
    document.getElementById('ok').onclick = () => {
      if (st.finished) return;
      const before = st;
      m.throws = E.fillVisit(m.settings, m.throws);
      afterChange(before);
    };
    document.getElementById('menu').onclick = async () => {
      const r = await modal(`<h2>Meccs</h2><p class="muted">${esc(formatLabel(m.settings))}</p>
        <div class="list">
          <button class="btn block" data-m="close">▶ Folytatás</button>
          <button class="btn block" data-m="exit">⏸ Kilépés (később folytatható)</button>
          <button class="btn block" data-m="replay">📼 Eddigi dobások visszajátszása</button>
          <button class="btn block danger" data-m="abandon">✕ Meccs feladása</button>
        </div>`);
      if (r === 'exit') { persist(m); go('home'); }
      else if (r === 'replay') { await persist(m); go('replay/' + m.id); }
      else if (r === 'abandon') {
        if (!await confirmBox('Biztosan befejezed a meccset eredmény nélkül? A dobások megmaradnak a statisztikában.', 'Feladás')) return;
        m.status = 'abandoned'; await persist(m); LS.del(ACTIVE_KEY); go('home');
      }
    };
    update();
    requestAnimationFrame(() => board.resize());
    if (st.finished) setTimeout(matchOver, 300);
    return () => { clearTimeout(flashT); };
  }

  // ---------------- Meccsek ----------------
  async function screenMatches() {
    $app.innerHTML = `<div class="screen">${topbar('Meccsek')}<div class="scroll"><div class="list" id="ml"><div class="muted">Betöltés…</div></div></div></div>`;
    const load = async () => {
      const list = await store.listMatches({});
      const active = LS.get(ACTIVE_KEY, null);
      const el = document.getElementById('ml'); if (!el) return;
      if (!list.length) { el.innerHTML = '<div class="card muted">Még nincs lejátszott meccs.</div>'; return; }
      el.innerHTML = list.map(mm => {
        const names = (mm.players || []).map(p => esc(p.name) + (p.id === mm.winnerId ? ' ★' : '')).join(' – ');
        const badge = mm.status === 'active' ? '<span class="badge live">folyamatban</span>' : mm.status === 'abandoned' ? '<span class="badge">feladva</span>' : '<span class="badge win">vége</span>';
        return `<div class="item" data-id="${esc(mm.id)}"><div class="main"><div class="t">${names}</div><div class="s">${dateStr(mm.created)} · ${esc(mm.settings ? formatLabel(E.normSettings(mm.settings)) : '')} · ${esc(mm.summary || '')}</div></div>${badge}<button class="iconbtn" data-del="${esc(mm.id)}" aria-label="Törlés">🗑</button></div>`;
      }).join('');
      el.onclick = async e => {
        const del = e.target.closest('[data-del]');
        if (del) {
          e.stopPropagation();
          if (!await confirmBox('Törlöd ezt a meccset az összes dobásával együtt? Ez nem vonható vissza.', 'Törlés')) return;
          await store.deleteMatch(del.dataset.del);
          if (active && active.id === del.dataset.del) LS.del(ACTIVE_KEY);
          return load();
        }
        const it = e.target.closest('.item'); if (!it) return;
        const mm = list.find(x => x.id === it.dataset.id);
        if (mm.status === 'active') {
          const r = await modal(`<h2>Folyamatban lévő meccs</h2><div class="actions"><button class="btn" data-m="replay">📼 Visszajátszás</button><button class="btn primary" data-m="resume">▶ Folytatás</button></div>`);
          if (r === 'resume') {
            const full = (active && active.id === mm.id) ? active : await store.getMatch(mm.id);
            LS.set(ACTIVE_KEY, full); go('game'); return;
          }
          if (r !== 'replay') return;
        }
        go('replay/' + mm.id);
      };
    };
    await load();
  }

  // ---------------- Visszajátszás ----------------
  async function screenReplay(id) {
    const active = LS.get(ACTIVE_KEY, null);
    const m = (active && active.id === id) ? active : await store.getMatch(id);
    if (!m) { toast('A meccs nem található'); go('matches'); return; }
    const N = m.throws.length;
    let k = 0, playing = false, timer = null, speed = 700, showLeg = true;
    $app.innerHTML = `<div class="screen game">${topbar('Visszajátszás', `<button class="iconbtn" id="ghost" title="A leg korábbi nyilai">👁</button>`)}
      <div class="layout">
        <div class="sbcol"><div id="sb"></div></div>
        <div class="board-wrap"><canvas class="board" id="board"></canvas></div>
      </div>
      <div class="rp-bar"><span class="muted small" id="pos"></span><input type="range" id="rng" min="0" max="${N}" value="0"><select class="input" id="spd" style="width:auto;padding:6px"><option value="1400">0,5×</option><option value="700" selected>1×</option><option value="350">2×</option><option value="150">4×</option></select></div>
      <div class="rp-controls"><button id="b-leg" title="Előző leg">⏮</button><button id="b-prev" title="Előző nyíl">◀</button><button id="b-play">▶</button><button id="b-next" title="Következő nyíl">▶❘</button><button id="b-nleg" title="Következő leg">⏭</button></div>
      <div class="sheet" id="sheet"></div>
    </div>`;
    const board = new D.Board(document.getElementById('board'), {});
    onResize = () => board.resize();
    const full = E.compute(m.settings, m.throws);
    const $sb = document.getElementById('sb'), $rng = document.getElementById('rng'), $pos = document.getElementById('pos'), $sheet = document.getElementById('sheet');

    function show() {
      const st = E.compute(m.settings, m.throws.slice(0, k));
      $sb.innerHTML = scoreboardHtml(st);
      const last = full.darts[k - 1];
      if (last) {
        board.marks = full.darts.filter(d => d.seq < k && d.player === last.player && d.leg === last.leg && d.visit === last.visit);
        board.ghost = showLeg ? full.darts.filter(d => d.seq < k && d.leg === last.leg && !board.marks.includes(d)) : [];
      } else { board.marks = []; board.ghost = []; }
      board.draw();
      $rng.value = k;
      $pos.textContent = `${k}/${N}`;
      drawSheet(last ? last.leg : 1, last);
    }

    function drawSheet(leg, last) {
      const P = m.settings.players;
      const vs = full.visits.filter(v => v.leg === leg);
      const rounds = Math.max(0, ...vs.map(v => v.visitNo));
      let rows = '';
      for (let r = 1; r <= rounds; r++) {
        rows += `<tr data-r="${r}">` + `<td class="muted">${r * 3}</td>` + P.map((p, i) => {
          const v = vs.find(x => x.player === i && x.visitNo === r);
          if (!v) return '<td></td><td></td>';
          const endSeq = v.darts[v.darts.length - 1].seq + 1;
          const cur = last && v.darts.some(d => d.seq === last.seq);
          return `<td class="${v.bust ? 'bust' : v.checkout ? 'co' : ''}" data-k="${endSeq}" ${cur ? 'style="background:#3a3000"' : ''}>${v.bust ? 'BUST' : v.total}</td><td class="muted" data-k="${endSeq}">${v.endRem}</td>`;
        }).join('') + '</tr>';
      }
      $sheet.innerHTML = `<table><tr><th>Nyíl</th>${P.map(p => `<th colspan="2">${esc(p.name)}</th>`).join('')}</tr>${rows}</table>`;
    }
    $sheet.onclick = e => { const td = e.target.closest('[data-k]'); if (td) { stop(); k = Number(td.dataset.k); show(); } };

    const stop = () => { playing = false; clearTimeout(timer); document.getElementById('b-play').textContent = '▶'; };
    const tick = () => {
      if (!playing) return;
      if (k >= N) return stop();
      k++; show();
      const d = full.darts[k - 1];
      const visitEnd = d && (d.dart === 3 || d.bust || d.checkout);
      timer = setTimeout(tick, visitEnd ? speed * 2.2 : speed);
    };
    const legStart = leg => { const d = full.darts.find(x => x.leg === leg); return d ? d.seq : 0; };
    document.getElementById('b-play').onclick = () => {
      if (playing) return stop();
      if (k >= N) k = 0;
      playing = true; document.getElementById('b-play').textContent = '⏸'; tick();
    };
    document.getElementById('b-prev').onclick = () => { stop(); k = Math.max(0, k - 1); show(); };
    document.getElementById('b-next').onclick = () => { stop(); k = Math.min(N, k + 1); show(); };
    document.getElementById('b-leg').onclick = () => {
      stop();
      const cur = full.darts[k - 1];
      const leg = cur ? cur.leg : 1;
      const s0 = legStart(leg);
      k = (k > s0 + 1 || leg === 1) ? s0 : legStart(leg - 1);
      show();
    };
    document.getElementById('b-nleg').onclick = () => {
      stop();
      const cur = full.darts[k - 1] || full.darts[0];
      const nxt = full.darts.find(x => x.leg === (cur ? cur.leg : 1) + 1);
      k = nxt ? nxt.seq + 1 : N; show();
    };
    $rng.oninput = () => { stop(); k = Number($rng.value); show(); };
    document.getElementById('spd').onchange = e => { speed = Number(e.target.value); };
    document.getElementById('ghost').onclick = () => { showLeg = !showLeg; toast(showLeg ? 'A leg korábbi nyilai látszanak' : 'Csak az aktuális kör'); show(); };
    requestAnimationFrame(() => { board.resize(); show(); });
    return () => stop();
  }

  // ---------------- Statisztika ----------------
  async function screenStats(pid) {
    const players = await store.allPlayers();
    const visible = players.filter(p => !p.archived || p.id === pid);
    pid = pid || (cfg.lastPlayers && cfg.lastPlayers[0]) || (visible[0] && visible[0].id);
    $app.innerHTML = `<div class="screen">${topbar('Statisztika')}<div class="scroll">
      <div class="card"><select class="input" id="pp">${visible.map(p => `<option value="${esc(p.id)}" ${p.id === pid ? 'selected' : ''}>${esc(p.name)}${p.archived ? ' (archív)' : ''}</option>`).join('')}</select>
        <div class="seg" id="per" style="margin-top:10px"><button data-v="all" class="on">Mind</button><button data-v="l10">Utolsó 10</button><button data-v="d30">30 nap</button><button data-v="d90">90 nap</button></div></div>
      <div id="st"><div class="muted">Betöltés…</div></div>
    </div></div>`;
    if (!pid) { document.getElementById('st').innerHTML = '<div class="card muted">Nincs játékos.</div>'; return; }
    let matches = [], period = 'all', cloudMode = 'age', cloudSet = 'scoring';
    const boards = [];
    onResize = () => boards.forEach(b => b.resize());

    const load = async () => {
      document.getElementById('st').innerHTML = '<div class="muted">Betöltés…</div>';
      matches = (await store.getMatches({ playerId: pid })).filter(Boolean);
      draw();
    };
    const filtered = () => {
      let l = matches.slice().sort((a, b) => a.created - b.created);
      if (period === 'l10') l = l.slice(-10);
      if (period === 'd30') l = l.filter(x => x.created >= Date.now() - 30 * 864e5);
      if (period === 'd90') l = l.filter(x => x.created >= Date.now() - 90 * 864e5);
      return l;
    };
    const tr = (sl, hib, eps) => { const t = S.trendLabel(sl, hib, eps); return `<div class="tr ${t}">${t === 'javul' ? '▲ javul' : t === 'romlik' ? '▼ romlik' : '● stabil'}</div>`; };
    const kpi = (v, l, t) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div>${t || ''}</div>`;

    function draw() {
      boards.length = 0;
      const ms = filtered();
      const r = S.forPlayer(ms, pid);
      const el = document.getElementById('st');
      if (!r.darts) { el.innerHTML = '<div class="card muted">Ebben az időszakban nincs dobása.</div>'; return; }
      const dbl = r.checkout.doubles.slice(0, 12).map(d => `<tr><td>${esc(d.target)}</td><td>${d.attempts}</td><td>${d.hits}</td><td>${pct(d.hits / d.attempts * 100)}</td></tr>`).join('');
      el.innerHTML = `
        <div class="card"><h2>Összesítés</h2><div class="kpis">
          ${kpi(f1(r.avg3), '3 nyilas átlag', tr(r.trend.avg3, true, 0.1))}
          ${kpi(f1(r.first9), 'Első 9 átlag')}
          ${kpi(`${r.matchesWon}/${r.matchesPlayed}`, 'Meccs nyert')}
          ${kpi(`${r.legs.won}/${r.legs.played}`, 'Leg nyert')}
          ${kpi(f0(r.legs.best), 'Legjobb leg (nyíl)')}
          ${kpi(f1(r.legs.avgDarts), 'Nyíl / nyert leg')}
        </div></div>
        <div class="card"><h2>Tömeg dobások</h2><p class="muted small">Amikor a hátralévő pont a körben megmaradt nyilakkal még nem kiszállható.</p><div class="kpis">
          ${kpi(f1(r.scoring.avg3), 'Tömeg átlag', tr(r.trend.scoringAvg, true, 0.1))}
          ${kpi(r.scoring.darts, 'Nyíl')}
          ${kpi(f1(r.scoring.spread) + '<span class="small"> mm</span>', 'Szórás', tr(r.trend.spread, false, 0.1))}
          ${kpi(r.scoring.t180, '180')}
          ${kpi(r.scoring.t140, '140+')}
          ${kpi(r.scoring.tons, '100+')}
          ${kpi(pct(r.scoring.trebleRate), 'Tripla találat')}
          ${kpi(pct(r.scoring.t20Rate), 'T20 találat')}
          ${kpi(r.scoring.busts, 'Besokallás')}
        </div></div>
        <div class="card"><h2>Kiszállók</h2><p class="muted small">Amikor a körben még kiszállható volt. „Dupla nyíl”: egy nyíllal kiszállható állásból dobva.</p><div class="kpis">
          ${kpi(pct(r.checkout.pct), 'Kiszálló %', tr(r.trend.checkoutPct, true, 0.2))}
          ${kpi(`${r.checkout.checkouts}/${r.checkout.dartsAtDouble}`, 'Dupla nyíl')}
          ${kpi(pct(r.checkout.visitPct), 'Kiszálló körök')}
          ${kpi(f0(r.checkout.highest), 'Legmagasabb')}
          ${kpi(f1(r.checkout.avgCheckout), 'Átl. kiszálló')}
          ${kpi(f1(r.checkout.spread) + '<span class="small"> mm</span>', 'Dupla szórás')}
        </div>
        ${dbl ? `<h3>Duplák</h3><table class="t"><tr><th>Cél</th><th>Nyíl</th><th>Talált</th><th>%</th></tr>${dbl}</table>` : ''}</div>
        <div class="card"><h2>Dobásfelhő</h2>
          <div class="seg" id="cset"><button data-v="scoring" class="${cloudSet === 'scoring' ? 'on' : ''}">Tömeg</button><button data-v="checkout" class="${cloudSet === 'checkout' ? 'on' : ''}">Kiszálló</button><button data-v="all" class="${cloudSet === 'all' ? 'on' : ''}">Mind</button></div>
          <div class="seg" id="cmode" style="margin:8px 0"><button data-v="age" class="${cloudMode === 'age' ? 'on' : ''}">Idő szerint</button><button data-v="half" class="${cloudMode === 'half' ? 'on' : ''}">Régi vs új</button><button data-v="seg" class="${cloudMode === 'seg' ? 'on' : ''}">Találat</button></div>
          <div class="cloudbox"><canvas id="cloud1"></canvas></div>
          <div class="legend" id="leg1"></div>
          <h3>Dupla-dobásfelhő</h3><p class="muted small">Minden dupla nyíl elforgatva úgy, hogy a célzott dupla legyen felül (zöld = talált).</p>
          <div class="cloudbox"><canvas id="cloud2"></canvas></div>
        </div>
        <div class="card"><h2>Fejlődés meccsenként</h2>
          <h3>3 nyilas átlag</h3><div class="chart">${D.charts.lineChart(r.perMatch.map(x => x.avg3), { color: '#4aa3ff', title: 'Átlag' })}</div>
          <h3>Tömeg átlag</h3><div class="chart">${D.charts.lineChart(r.perMatch.map(x => x.scoringAvg), { color: '#a78bfa', title: 'Tömeg átlag' })}</div>
          <h3>Kiszálló %</h3><div class="chart">${D.charts.lineChart(r.perMatch.map(x => x.checkoutPct), { color: '#34d399', title: 'Kiszálló %', min: 0 })}</div>
          <h3>Tömeg szórás (mm, kisebb a jobb)</h3><div class="chart">${D.charts.lineChart(r.perMatch.map(x => x.spread), { color: '#fb923c', title: 'Szórás', min: 0 })}</div>
          <p class="muted small">Sárga szaggatott vonal: trend (lineáris illesztés).</p>
        </div>
        <div class="card"><h2>Meccsek</h2><table class="t"><tr><th>Dátum</th><th>Ellenfél</th><th>Átl.</th><th>Kiszálló</th></tr>
          ${r.perMatch.slice().reverse().map(x => `<tr data-mid="${esc(x.matchId)}"><td>${dateStr(x.date).slice(0, 12)}${x.won ? ' ★' : ''}</td><td>${esc(x.opponent || 'egyéni')}</td><td>${f1(x.avg3)}</td><td>${pct(x.checkoutPct)}</td></tr>`).join('')}
        </table><p class="muted small">Koppints egy meccsre a visszajátszáshoz.</p></div>`;

      // felhők
      const pts = cloudSet === 'scoring' ? r.cloud.scoring : cloudSet === 'checkout' ? r.cloud.checkout : r.cloud.scoring.concat(r.cloud.checkout);
      const maxM = Math.max(1, r.perMatch.length - 1);
      const mid = r.perMatch.length / 2;
      const color = p => {
        if (cloudMode === 'half') return p.m < mid ? 'rgba(64,156,255,.6)' : 'rgba(255,120,30,.75)';
        if (cloudMode === 'seg') return p.mult === 3 ? 'rgba(255,60,60,.8)' : p.mult === 2 ? 'rgba(40,220,120,.8)' : p.seg ? 'rgba(255,255,255,.55)' : 'rgba(150,150,150,.6)';
        return D.boardUtil.ageColor(p.m / maxM);
      };
      const b1 = new D.Board(document.getElementById('cloud1'), {});
      b1.cloud = pts.map(p => ({ x: p.x, y: p.y, color: color(p) }));
      b1.draw(); boards.push(b1);
      document.getElementById('leg1').innerHTML = cloudMode === 'age' ? '<span>régi</span><span class="grad"></span><span>új</span>'
        : cloudMode === 'half' ? '<span style="color:rgb(64,156,255)">● első fele</span><span style="color:rgb(255,120,30)">● második fele</span>'
          : '<span style="color:#ff3c3c">● tripla</span><span style="color:#28dc78">● dupla</span><span>● szimpla</span>';
      const b2 = new D.Board(document.getElementById('cloud2'), { view: { cx: 0, cy: 160, half: 38 } });
      b2.cloud = r.cloud.doubles.map(p => ({ x: p.nx, y: p.ny, color: p.hit ? 'rgba(40,220,120,.9)' : D.boardUtil.ageColor(p.m / maxM, 0.75), r: 5 }));
      b2.draw(); boards.push(b2);

      el.querySelector('#cset').onclick = e => { const b = e.target.closest('button'); if (b) { cloudSet = b.dataset.v; draw(); } };
      el.querySelector('#cmode').onclick = e => { const b = e.target.closest('button'); if (b) { cloudMode = b.dataset.v; draw(); } };
      el.querySelectorAll('[data-mid]').forEach(tr => tr.onclick = () => go('replay/' + tr.dataset.mid));
    }
    document.getElementById('pp').onchange = e => { pid = e.target.value; load(); };
    document.getElementById('per').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      period = b.dataset.v;
      document.querySelectorAll('#per button').forEach(x => x.classList.toggle('on', x === b));
      draw();
    };
    await load();
  }

  // ---------------- Beállítások ----------------
  function screenConfig() {
    const yes = (k, on, off) => `<div class="seg" data-k="${k}"><button data-v="1" class="${cfg[k] ? 'on' : ''}">${on || 'Be'}</button><button data-v="0" class="${cfg[k] ? '' : 'on'}">${off || 'Ki'}</button></div>`;
    $app.innerHTML = `<div class="screen">${topbar('Beállítások')}<div class="scroll">
      <div class="card"><h2>Autotesztek</h2><p class="muted small">Játékmotor, kiszálló, statisztika, tábla geometria, helyi tár, szerver API és adatbázis tesztek.</p>
        <button class="btn primary block" data-go="tests">▶ Összes teszt futtatása</button></div>
      <div class="card"><h2>Tárolás</h2>
        <div class="seg" id="storage"><button data-v="server" class="${cfg.storage !== 'local' ? 'on' : ''}">Szerver (MySQL)</button><button data-v="local" class="${cfg.storage === 'local' ? 'on' : ''}">Csak ez az eszköz</button></div>
        <label class="field"><span>API cím</span><input class="input" id="apiBase" value="${esc(cfg.apiBase)}"></label>
        <label class="field"><span>API kulcs (ha a config.php-ban be van állítva)</span><input class="input" id="apiKey" type="password" value="${esc(cfg.apiKey)}" autocomplete="off"></label>
        <div class="row"><button class="btn" id="ping">Kapcsolat teszt</button><button class="btn" id="sync">Szinkronizálás most</button></div>
        <p class="muted small" id="pingres"></p></div>
      <div class="card"><h2>Bevitel</h2>
        <h3>Nagyító a táblán</h3>${yes('loupe')}
        <h3>Rezgés</h3>${yes('vibrate')}</div>
      <div class="card"><h2>Bemondó (caller)</h2>${yes('caller')}
        <h3>Nyelv</h3><div class="seg" id="lang"><button data-v="en" class="${cfg.callerLang === 'en' ? 'on' : ''}">Angol</button><button data-v="hu" class="${cfg.callerLang === 'hu' ? 'on' : ''}">Magyar</button></div>
        <button class="btn" id="saytest" style="margin-top:10px">🔊 Próba</button></div>
      <div class="card"><h2>Adatok</h2>
        <div class="row"><button class="btn" id="export">⤓ Mentés fájlba (JSON)</button><label class="btn">⤒ Betöltés fájlból<input type="file" id="import" accept="application/json,.json" hidden></label></div>
        <p class="muted small">Helyi ↔ szerver áthordáshoz is jó: válts tárolást, majd töltsd be a mentést.</p></div>
      <p class="muted small" style="text-align:center">Darts számláló · ${esc(location.host)}</p>
    </div></div>`;
    $app.querySelectorAll('.seg[data-k]').forEach(seg => seg.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      cfg[seg.dataset.k] = b.dataset.v === '1'; saveCfg();
      seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    });
    document.getElementById('storage').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      cfg.storage = b.dataset.v; saveCfg(); resetStore();
      document.querySelectorAll('#storage button').forEach(x => x.classList.toggle('on', x === b));
      toast(cfg.storage === 'local' ? 'Mostantól csak ezen az eszközön tárol' : 'Mostantól a szerverre ment');
    };
    document.getElementById('lang').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      cfg.callerLang = b.dataset.v; saveCfg();
      document.querySelectorAll('#lang button').forEach(x => x.classList.toggle('on', x === b));
    };
    const upd = () => { cfg.apiBase = document.getElementById('apiBase').value.trim() || 'api/'; cfg.apiKey = document.getElementById('apiKey').value; saveCfg(); resetStore(); };
    document.getElementById('apiBase').onchange = upd;
    document.getElementById('apiKey').onchange = upd;
    const $res = document.getElementById('pingres');
    document.getElementById('ping').onclick = async () => {
      upd(); $res.textContent = 'Kapcsolódás…';
      try { const r = await new D.store.ServerStore(cfg.apiBase, cfg.apiKey).ping(); $res.textContent = `OK – API ${r.version}, ${r.driver}, PHP ${r.php}`; }
      catch (e) { $res.textContent = 'Hiba: ' + e.message; }
    };
    document.getElementById('sync').onclick = async () => {
      if (store.kind !== 'sync') return toast('Csak szerver módban');
      const n = await store.flush();
      toast(store.pending() ? `${store.pending()} tétel még vár (szerver nem elérhető?)` : `Szinkronizálva (${n})`);
    };
    document.getElementById('saytest').onclick = () => {
      const old = D.caller.cfg; D.caller.cfg = { enabled: true, lang: cfg.callerLang };
      D.caller.visit(180); D.caller.cfg = old;
    };
    document.getElementById('export').onclick = async () => {
      const data = { app: 'darts', version: 1, exported: Date.now(), players: await store.allPlayers(), matches: await store.getMatches({}) };
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'darts-mentes-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
    document.getElementById('import').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (data.app !== 'darts') throw new Error('Nem darts mentés');
        for (const p of data.players || []) await store.savePlayer(p);
        for (const m of data.matches || []) await store.saveMatch(m);
        toast(`Betöltve: ${(data.players || []).length} játékos, ${(data.matches || []).length} meccs`, 4000);
      } catch (err) { toast('Hiba: ' + err.message, 4000); }
    };
  }

  // ---------------- Tesztek ----------------
  function loadScript(src) {
    return new Promise((res, rej) => {
      if (document.querySelector(`script[src="${src}"]`)) return res();
      const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Nem tölthető: ' + src));
      document.head.appendChild(s);
    });
  }
  async function screenTests() {
    $app.innerHTML = `<div class="screen">${topbar('Autotesztek', '<button class="iconbtn" id="rerun">↻</button>')}<div class="scroll">
      <div class="card"><div class="sum" id="sum">Futtatás…</div><div class="muted small" id="sub"></div></div>
      <div id="groups"></div></div></div>`;
    document.querySelector('.topbar [data-go]').dataset.go = 'config';
    await loadScript('tests/harness.js');
    await loadScript('tests/tests.js');
    const run = async () => {
      const $g = document.getElementById('groups'), $sum = document.getElementById('sum'), $sub = document.getElementById('sub');
      $g.innerHTML = ''; $sum.className = 'sum'; $sum.textContent = 'Futtatás…';
      const groups = {};
      const ctx = {
        server: store.kind !== 'local' ? new D.store.ServerStore(cfg.apiBase, cfg.apiKey) : null,
        dom: true
      };
      const t0 = performance.now();
      const res = await D.testing.run(ctx, r => {
        if (!groups[r.group]) {
          const c = document.createElement('div'); c.className = 'card'; c.innerHTML = `<h2>${esc(r.group)}</h2>`;
          $g.appendChild(c); groups[r.group] = c;
        }
        const row = document.createElement('div');
        row.className = 'test ' + r.status;
        row.innerHTML = `<span class="st">${r.status === 'ok' ? '✔' : r.status === 'skip' ? '–' : '✘'}</span><div><div>${esc(r.name)}</div>${r.msg ? `<div class="msg">${esc(r.msg)}</div>` : ''}</div><span class="ms">${r.ms} ms</span>`;
        groups[r.group].appendChild(row);
      });
      const fail = res.filter(r => r.status === 'fail').length, ok = res.filter(r => r.status === 'ok').length, skip = res.filter(r => r.status === 'skip').length;
      $sum.className = 'sum ' + (fail ? 'fail' : 'ok');
      $sum.textContent = fail ? `${fail} hibás teszt` : `Minden teszt sikeres`;
      $sub.textContent = `${ok} sikeres · ${fail} hibás · ${skip} kihagyva · ${Math.round(performance.now() - t0)} ms`;
    };
    document.getElementById('rerun').onclick = run;
    await run();
  }

  const SCREENS = { home: screenHome, players: screenPlayers, new: screenNew, game: screenGame, matches: screenMatches, replay: screenReplay, stats: screenStats, config: screenConfig, tests: screenTests };

  D.app = { cfg, get store() { return store; }, go, render, scoreboardHtml, formatLabel };

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* nem kötelező */ });
  }
  render();
})(globalThis.D = globalThis.D || {});
