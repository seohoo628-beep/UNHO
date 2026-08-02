/* ============================================================
   STARZ · 데이터 저장 계층
   - 구조화 데이터(멤버/출석/공지/일정)는 localStorage
   - 미디어 파일(사진/영상)은 IndexedDB (용량이 크므로)
   ============================================================ */
(function (global) {
  'use strict';

  const KEYS = {
    members: 'starz.members',
    attendance: 'starz.attendance', // { 'YYYY-MM-DD': { memberId: 'present'|'late'|'excused'|'absent' } }
    sessions: 'starz.sessions',     // [{date, title, type}]
    notices: 'starz.notices',
    schedule: 'starz.schedule',
    resourcesMeta: 'starz.resourcesMeta',
    meta: 'starz.meta',
  };

  /* ---------- localStorage helpers ---------- */
  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : structuredCloneSafe(fallback);
    } catch (e) {
      console.error('read error', key, e);
      return structuredCloneSafe(fallback);
    }
  }
  function write(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }
  function structuredCloneSafe(v) {
    return JSON.parse(JSON.stringify(v == null ? null : v));
  }
  function uid() {
    return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* ---------- IndexedDB (media blobs) ---------- */
  const DB_NAME = 'starz-media';
  const STORE = 'files';
  let _dbp = null;
  function idb() {
    if (_dbp) return _dbp;
    _dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return _dbp;
  }
  async function mediaPut(id, blob) {
    const db = await idb();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(blob, id);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }
  async function mediaGet(id) {
    const db = await idb();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readonly');
      const r = tx.objectStore(STORE).get(id);
      r.onsuccess = () => res(r.result || null);
      r.onerror = () => rej(r.error);
    });
  }
  async function mediaDel(id) {
    const db = await idb();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }
  async function mediaAll() {
    const db = await idb();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const out = {};
      const cur = store.openCursor();
      cur.onsuccess = (e) => {
        const c = e.target.result;
        if (c) { out[c.key] = c.value; c.continue(); }
        else res(out);
      };
      cur.onerror = () => rej(cur.error);
    });
  }

  /* ---------- Public API ---------- */
  const DB = {
    KEYS, uid,

    // members
    getMembers() { return read(KEYS.members, []); },
    saveMembers(list) { write(KEYS.members, list); },

    // attendance map
    getAttendance() { return read(KEYS.attendance, {}); },
    saveAttendance(map) { write(KEYS.attendance, map); },

    // sessions (list of dates that had a practice/game)
    getSessions() { return read(KEYS.sessions, []); },
    saveSessions(list) { write(KEYS.sessions, list); },

    // notices
    getNotices() { return read(KEYS.notices, []); },
    saveNotices(list) { write(KEYS.notices, list); },

    // schedule
    getSchedule() { return read(KEYS.schedule, []); },
    saveSchedule(list) { write(KEYS.schedule, list); },

    // resources metadata
    getResources() { return read(KEYS.resourcesMeta, []); },
    saveResources(list) { write(KEYS.resourcesMeta, list); },

    // media blobs
    mediaPut, mediaGet, mediaDel, mediaAll,

    /* ---------- backup / restore ---------- */
    async exportAll() {
      const blobs = await mediaAll();
      const media = {};
      for (const [id, blob] of Object.entries(blobs)) {
        media[id] = { type: blob.type, dataUrl: await blobToDataUrl(blob) };
      }
      return {
        _app: 'STARZ', _version: 1, exportedAt: new Date().toISOString(),
        members: this.getMembers(),
        attendance: this.getAttendance(),
        sessions: this.getSessions(),
        notices: this.getNotices(),
        schedule: this.getSchedule(),
        resourcesMeta: this.getResources(),
        media,
      };
    },
    async importAll(data) {
      if (!data || data._app !== 'STARZ') throw new Error('올바른 STARZ 백업 파일이 아닙니다.');
      if (data.members) this.saveMembers(data.members);
      if (data.attendance) this.saveAttendance(data.attendance);
      if (data.sessions) this.saveSessions(data.sessions);
      if (data.notices) this.saveNotices(data.notices);
      if (data.schedule) this.saveSchedule(data.schedule);
      if (data.resourcesMeta) this.saveResources(data.resourcesMeta);
      if (data.media) {
        for (const [id, m] of Object.entries(data.media)) {
          const blob = await dataUrlToBlob(m.dataUrl);
          await mediaPut(id, blob);
        }
      }
    },
  };

  function blobToDataUrl(blob) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.readAsDataURL(blob);
    });
  }
  async function dataUrlToBlob(dataUrl) {
    const resp = await fetch(dataUrl);
    return resp.blob();
  }

  global.DB = DB;
})(window);
