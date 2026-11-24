/* Tárolás: szerver (PHP + MySQL) helyi gyorsítótárral és offline sorral,
 * vagy csak helyi (localStorage). */
(function (D) {
  'use strict';

  function uuid() {
    if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  // ---------- localStorage segédek (memóriába esik vissza, ha nincs) ----------
  const mem = {};
  const LS = {
    get(k, def) {
      try { const v = globalThis.localStorage ? localStorage.getItem(k) : mem[k]; return v == null ? def : JSON.parse(v); }
      catch (e) { return def; }
    },
    set(k, v) {
      const s = JSON.stringify(v);
      try { if (globalThis.localStorage) localStorage.setItem(k, s); else mem[k] = s; return true; }
      catch (e) { mem[k] = s; return false; }
    },
    del(k) { try { if (globalThis.localStorage) localStorage.removeItem(k); delete mem[k]; } catch (e) { delete mem[k]; } }
  };

  // ---------- Csak helyi tár ----------
  class LocalStore {
    constructor(prefix) { this.p = prefix || 'darts.'; this.kind = 'local'; }
    _players() { return LS.get(this.p + 'players', []); }
    _matches() { return LS.get(this.p + 'matches', {}); }
    async ping() { return { ok: true, mode: 'local' }; }
    async listPlayers() { return this._players().filter(p => !p.archived).sort((a, b) => a.name.localeCompare(b.name, 'hu')); }
    async allPlayers() { return this._players(); }
    async savePlayer(p) {
      const list = this._players();
      p = Object.assign({ id: uuid(), created: Date.now(), archived: false }, p);
      const i = list.findIndex(x => x.id === p.id);
      if (i >= 0) list[i] = Object.assign(list[i], p); else list.push(p);
      LS.set(this.p + 'players', list);
      return p;
    }
    async deletePlayer(id) {
      const used = Object.values(this._matches()).some(m => (m.settings.players || []).some(p => p.id === id));
      let list = this._players();
      if (used) list = list.map(p => p.id === id ? Object.assign(p, { archived: true }) : p);
      else list = list.filter(p => p.id !== id);
      LS.set(this.p + 'players', list);
      return { archived: used };
    }
    async listMatches(f) {
      f = f || {};
      let list = Object.values(this._matches());
      if (f.playerId) list = list.filter(m => (m.settings.players || []).some(p => p.id === f.playerId));
      if (f.status) list = list.filter(m => m.status === f.status);
      list.sort((a, b) => b.created - a.created);
      return list.map(m => ({ id: m.id, created: m.created, updated: m.updated, status: m.status, summary: m.summary, winnerId: m.winnerId, players: m.settings.players, settings: m.settings }));
    }
    async getMatch(id) { return this._matches()[id] || null; }
    async getMatches(f) {
      const ids = (await this.listMatches(f)).map(m => m.id);
      const all = this._matches();
      return ids.map(id => all[id]);
    }
    async saveMatch(m) {
      const all = this._matches();
      m.updated = Date.now();
      all[m.id] = m;
      if (!LS.set(this.p + 'matches', all)) throw new Error('A helyi tárhely megtelt');
      return m;
    }
    async deleteMatch(id) { const all = this._matches(); delete all[id]; LS.set(this.p + 'matches', all); return true; }
  }

  // ---------- Szerver API ----------
  class ServerStore {
    constructor(base, key) { this.base = (base || 'api/').replace(/\/?$/, '/'); this.key = key || ''; this.kind = 'server'; }
    async req(action, body, method) {
      const url = this.base + 'index.php?a=' + encodeURIComponent(action) + (method === 'GET' && body ? '&' + new URLSearchParams(body) : '');
      const opt = { method: method || 'POST', headers: { 'X-Api-Key': this.key } };
      if (opt.method !== 'GET') { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body || {}); }
      const r = await fetch(url, opt);
      let j;
      const txt = await r.text();
      try { j = JSON.parse(txt); } catch (e) { throw new Error('Hibás szerver válasz (' + r.status + '): ' + txt.slice(0, 200)); }
      if (!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status));
      return j.data;
    }
    ping() { return this.req('ping', null, 'GET'); }
    listPlayers() { return this.req('players', null, 'GET'); }
    allPlayers() { return this.req('players', { all: 1 }, 'GET'); }
    savePlayer(p) { p = Object.assign({ id: uuid(), created: Date.now() }, p); return this.req('player.save', p); }
    deletePlayer(id) { return this.req('player.delete', { id }); }
    listMatches(f) { return this.req('matches', f || {}, 'GET'); }
    getMatch(id) { return this.req('match', { id }, 'GET'); }
    getMatches(f) { return this.req('matches.full', f || {}, 'GET'); }
    saveMatch(m) {
      m.updated = Date.now();
      const body = Object.assign({}, m);
      // a származtatott mezők (fázis, pont, hátralévő ...) SQL-ből is lekérdezhetők legyenek
      if (D.engine) {
        const st = D.engine.compute(m.settings, m.throws || []);
        body.derived = st.darts.map(d => ({ playerId: d.playerId, set: d.set, leg: d.leg, visit: d.visit, dart: d.dart,
          points: d.points, remBefore: d.remBefore, phase: d.phase, atDouble: d.atDouble, target: d.target, bust: d.bust, checkout: d.checkout }));
      }
      return this.req('match.save', body);
    }
    deleteMatch(id) { return this.req('match.delete', { id }); }
    selftest() { return this.req('selftest', {}); }
  }

  // ---------- Szerver + offline sor ----------
  class SyncStore {
    constructor(server, prefix) {
      this.server = server; this.kind = 'sync';
      this.local = new LocalStore(prefix || 'darts.cache.');
      this.qkey = (prefix || 'darts.cache.') + 'queue';
      this.online = true;
    }
    queue() { return LS.get(this.qkey, []); }
    pending() { return this.queue().length; }
    enqueue(item) {
      item.ts = Date.now() + Math.random();
      const q = this.queue().filter(x => !(x.type === item.type && x.id === item.id));
      q.push(item); LS.set(this.qkey, q);
    }
    /** Sorban (egymás után) futtatott szinkronizálás. */
    flush() {
      this._flushP = (this._flushP || Promise.resolve()).then(() => this._flushOnce(), () => this._flushOnce());
      return this._flushP;
    }
    async _flushOnce() {
      const q = this.queue();
      if (!q.length) return 0;
      const done = new Set();
      let failed = false;
      for (const it of q) {
        if (failed) break; // ha a szerver nem elérhető, nem próbálkozunk tovább
        try {
          if (it.type === 'match') { const m = await this.local.getMatch(it.id); if (m) await this.server.saveMatch(m); }
          else if (it.type === 'player') { const p = (await this.local.allPlayers()).find(x => x.id === it.id); if (p) await this.server.savePlayer(p); }
          else if (it.type === 'delMatch') await this.server.deleteMatch(it.id);
          else if (it.type === 'delPlayer') await this.server.deletePlayer(it.id);
          done.add(it.type + it.id + it.ts);
          if (it.type === 'match') await this.trimMatch(it.id, it.ts);
        } catch (e) { failed = true; this.lastError = e.message; }
      }
      // közben érkezett új tételeket megtartjuk
      LS.set(this.qkey, this.queue().filter(x => !done.has(x.type + x.id + x.ts)));
      this.online = !failed;
      return done.size;
    }
    // sikeres feltöltés után a befejezett meccset nem tartjuk a helyi tárban
    async trimMatch(id, ts) {
      if (this.queue().some(x => x.type === 'match' && x.id === id && x.ts !== ts)) return;
      const m = await this.local.getMatch(id);
      if (m && m.status !== 'active') await this.local.deleteMatch(id);
    }
    async ping() { const r = await this.server.ping(); this.online = true; await this.flush(); return r; }
    async listPlayers() {
      try {
        await this.flush();
        const l = await this.server.allPlayers();
        LS.set(this.local.p + 'players', l);
        this.online = true;
        return l.filter(p => !p.archived);
      } catch (e) { this.online = false; return this.local.listPlayers(); }
    }
    async allPlayers() { try { return await this.server.allPlayers(); } catch (e) { return this.local.allPlayers(); } }
    async savePlayer(p) {
      p = await this.local.savePlayer(p);
      this.enqueue({ type: 'player', id: p.id });
      await this.flush();
      return p;
    }
    async deletePlayer(id) {
      const r = await this.local.deletePlayer(id);
      this.enqueue({ type: 'delPlayer', id });
      await this.flush();
      return r;
    }
    async listMatches(f) {
      const localList = await this.local.listMatches(f);
      try {
        const l = await this.server.listMatches(f);
        this.online = true;
        const ids = new Set(l.map(m => m.id));
        return localList.filter(m => !ids.has(m.id)).concat(l).sort((a, b) => b.created - a.created);
      } catch (e) { this.online = false; return localList; }
    }
    async getMatch(id) {
      const lm = await this.local.getMatch(id);
      if (lm) return lm;
      return this.server.getMatch(id);
    }
    async getMatches(f) {
      const localM = await this.local.getMatches(f);
      try {
        const l = await this.server.getMatches(f);
        const ids = new Set(localM.map(m => m.id));
        return localM.concat(l.filter(m => !ids.has(m.id)));
      } catch (e) { this.online = false; return localM; }
    }
    async saveMatch(m) {
      await this.local.saveMatch(m);
      this.enqueue({ type: 'match', id: m.id });
      await this.flush();
      return m;
    }
    async deleteMatch(id) {
      await this.local.deleteMatch(id);
      this.enqueue({ type: 'delMatch', id });
      await this.flush();
      return true;
    }
    selftest() { return this.server.selftest(); }
  }

  function createStore(cfg) {
    if (cfg.storage === 'local') return new LocalStore('darts.');
    return new SyncStore(new ServerStore(cfg.apiBase, cfg.apiKey));
  }

  D.store = { LocalStore, ServerStore, SyncStore, createStore, uuid, LS };
})(globalThis.D = globalThis.D || {});
