/* ============================================================
   STARZ · 데이터 저장 계층 (이중 백엔드 어댑터)
   - 공유 모드: Supabase (config.js 에 URL/KEY 입력 시)  → 팀원 실시간 공유
   - 개인 모드: localStorage + IndexedDB (미설정 시)      → 이 브라우저에만 저장
   두 모드 모두 동일한 동기(sync) 읽기 API 를 제공한다.
   부팅 시 DB.init() 이 원격 데이터를 캐시에 적재하고, 이후 읽기는 캐시에서 즉시 반환한다.
   ============================================================ */
(function (global) {
  'use strict';

  const KEYS = {
    members: 'starz.members', attendance: 'starz.attendance', sessions: 'starz.sessions',
    notices: 'starz.notices', schedule: 'starz.schedule', resourcesMeta: 'starz.resourcesMeta', meta: 'starz.meta',
  };
  const TABLE = 'starz_docs';
  const BUCKET = 'starz-media';

  const cfg = global.STARZ_CONFIG || {};
  let remote = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && global.supabase && String(cfg.SUPABASE_URL).startsWith('http'));
  let sb = null;

  // in-memory cache — 화면은 항상 여기서 동기적으로 읽는다
  const cache = { members: [], attendance: {}, sessions: [], notices: [], schedule: [], resources: [] };
  // 원격 삭제 diff 용 이전 id 집합
  const prevIds = { members: new Set(), notices: new Set(), schedule: new Set(), resources: new Set(), attendance: new Set(), sessions: new Set() };

  /* ---------- utils ---------- */
  function uid() { return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function read(key, fb) { try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : clone(fb); } catch (e) { return clone(fb); } }
  function write(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
  function clone(v) { return JSON.parse(JSON.stringify(v == null ? null : v)); }

  /* ---------- IndexedDB (개인 모드 미디어) ---------- */
  const DB_NAME = 'starz-media', STORE = 'files';
  let _dbp = null;
  function idb() {
    if (_dbp) return _dbp;
    _dbp = new Promise((res, rej) => {
      const rq = indexedDB.open(DB_NAME, 1);
      rq.onupgradeneeded = () => { const d = rq.result; if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE); };
      rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
    });
    return _dbp;
  }
  async function idbPut(id, blob) { const d = await idb(); return new Promise((r, j) => { const t = d.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(blob, id); t.oncomplete = r; t.onerror = () => j(t.error); }); }
  async function idbGet(id) { const d = await idb(); return new Promise((r, j) => { const t = d.transaction(STORE, 'readonly').objectStore(STORE).get(id); t.onsuccess = () => r(t.result || null); t.onerror = () => j(t.error); }); }
  async function idbDel(id) { const d = await idb(); return new Promise((r, j) => { const t = d.transaction(STORE, 'readwrite'); t.objectStore(STORE).delete(id); t.oncomplete = r; t.onerror = () => j(t.error); }); }
  async function idbAll() { const d = await idb(); return new Promise((r, j) => { const out = {}; const c = d.transaction(STORE, 'readonly').objectStore(STORE).openCursor(); c.onsuccess = (e) => { const cur = e.target.result; if (cur) { out[cur.key] = cur.value; cur.continue(); } else r(out); }; c.onerror = () => j(c.error); }); }

  /* ---------- load ---------- */
  function loadLocal() {
    cache.members = read(KEYS.members, []);
    cache.attendance = read(KEYS.attendance, {});
    cache.sessions = read(KEYS.sessions, []);
    cache.notices = read(KEYS.notices, []);
    cache.schedule = read(KEYS.schedule, []);
    cache.resources = read(KEYS.resourcesMeta, []);
    syncPrevIds();
  }
  async function loadRemote() {
    const { data, error } = await sb.from(TABLE).select('collection,doc_id,data');
    if (error) throw error;
    const members = [], notices = [], schedule = [], resources = [], sessions = [], attendance = {};
    for (const row of (data || [])) {
      switch (row.collection) {
        case 'members': members.push(row.data); break;
        case 'notices': notices.push(row.data); break;
        case 'schedule': schedule.push(row.data); break;
        case 'resources': resources.push(row.data); break;
        case 'sessions': sessions.push(Object.assign({ date: row.doc_id }, row.data)); break;
        case 'attendance': attendance[row.doc_id] = row.data; break;
      }
    }
    cache.members = members; cache.notices = notices; cache.schedule = schedule;
    cache.resources = resources; cache.sessions = sessions; cache.attendance = attendance;
    syncPrevIds();
  }
  function syncPrevIds() {
    prevIds.members = new Set(cache.members.map(m => String(m.id)));
    prevIds.notices = new Set(cache.notices.map(m => String(m.id)));
    prevIds.schedule = new Set(cache.schedule.map(m => String(m.id)));
    prevIds.resources = new Set(cache.resources.map(m => String(m.id)));
    prevIds.sessions = new Set(cache.sessions.map(s => String(s.date)));
    prevIds.attendance = new Set(Object.keys(cache.attendance));
  }

  /* ---------- persist ---------- */
  async function persist(collection, entries, lsKey, lsValue) {
    if (!remote) { write(lsKey, lsValue); return; }
    try {
      const rows = entries.map(([id, data]) => ({ collection, doc_id: String(id), data }));
      if (rows.length) {
        const { error } = await sb.from(TABLE).upsert(rows, { onConflict: 'collection,doc_id' });
        if (error) throw error;
      }
      const newIds = new Set(rows.map(r => r.doc_id));
      const removed = [...(prevIds[collection] || [])].filter(id => !newIds.has(id));
      if (removed.length) {
        const { error } = await sb.from(TABLE).delete().eq('collection', collection).in('doc_id', removed);
        if (error) throw error;
      }
      prevIds[collection] = newIds;
    } catch (e) { console.error('persist ' + collection, e); global.dispatchEvent(new CustomEvent('starz-sync-error', { detail: e })); }
  }

  /* ---------- media ---------- */
  async function mediaPut(id, blob) {
    if (!remote) return idbPut(id, blob);
    const { error } = await sb.storage.from(BUCKET).upload(String(id), blob, { upsert: true, contentType: blob.type || 'application/octet-stream' });
    if (error) throw error;
  }
  async function mediaGet(id) {
    if (!remote) return idbGet(id);
    const { data, error } = await sb.storage.from(BUCKET).download(String(id));
    if (error) { console.error('mediaGet', error); return null; }
    return data;
  }
  async function mediaDel(id) {
    if (!remote) return idbDel(id);
    await sb.storage.from(BUCKET).remove([String(id)]);
  }
  async function mediaAll() {
    if (!remote) return idbAll();
    const out = {};
    const { data } = await sb.storage.from(BUCKET).list('', { limit: 1000 });
    for (const f of (data || [])) { const b = await mediaGet(f.name); if (b) out[f.name] = b; }
    return out;
  }

  /* ---------- backup helpers ---------- */
  function blobToDataUrl(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); }); }
  async function dataUrlToBlob(u) { return (await fetch(u)).blob(); }

  /* ---------- public API ---------- */
  const DB = {
    KEYS, uid,
    isRemote: () => remote,

    async init(onChange) {
      if (remote) {
        try {
          sb = global.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
          await loadRemote();
          if (onChange) {
            let t;
            sb.channel('starz-realtime')
              .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, () => {
                clearTimeout(t);
                t = setTimeout(async () => { try { await loadRemote(); onChange(); } catch (e) { console.error(e); } }, 250);
              })
              .subscribe();
          }
          return;
        } catch (e) {
          console.error('원격 연결 실패 → 개인 모드로 전환', e);
          remote = false;
          global.dispatchEvent(new CustomEvent('starz-remote-failed', { detail: e }));
        }
      }
      loadLocal();
    },
    async reload() { return remote ? loadRemote() : loadLocal(); },

    getMembers() { return cache.members; },
    saveMembers(l) { cache.members = l; return persist('members', l.map(m => [m.id, m]), KEYS.members, l); },
    getAttendance() { return cache.attendance; },
    saveAttendance(m) { cache.attendance = m; return persist('attendance', Object.entries(m), KEYS.attendance, m); },
    getSessions() { return cache.sessions; },
    saveSessions(l) { cache.sessions = l; return persist('sessions', l.map(s => [s.date, { type: s.type, title: s.title }]), KEYS.sessions, l); },
    getNotices() { return cache.notices; },
    saveNotices(l) { cache.notices = l; return persist('notices', l.map(n => [n.id, n]), KEYS.notices, l); },
    getSchedule() { return cache.schedule; },
    saveSchedule(l) { cache.schedule = l; return persist('schedule', l.map(s => [s.id, s]), KEYS.schedule, l); },
    getResources() { return cache.resources; },
    saveResources(l) { cache.resources = l; return persist('resources', l.map(r => [r.id, r]), KEYS.resourcesMeta, l); },

    mediaPut, mediaGet, mediaDel, mediaAll,

    async exportAll() {
      const blobs = await mediaAll();
      const media = {};
      for (const [id, blob] of Object.entries(blobs)) media[id] = { type: blob.type, dataUrl: await blobToDataUrl(blob) };
      return {
        _app: 'STARZ', _version: 2, exportedAt: new Date().toISOString(),
        members: cache.members, attendance: cache.attendance, sessions: cache.sessions,
        notices: cache.notices, schedule: cache.schedule, resourcesMeta: cache.resources, media,
      };
    },
    async importAll(data) {
      if (!data || data._app !== 'STARZ') throw new Error('올바른 STARZ 백업 파일이 아닙니다.');
      if (data.media) for (const [id, m] of Object.entries(data.media)) await mediaPut(id, await dataUrlToBlob(m.dataUrl));
      if (data.members) await DB.saveMembers(data.members);
      if (data.attendance) await DB.saveAttendance(data.attendance);
      if (data.sessions) await DB.saveSessions(data.sessions);
      if (data.notices) await DB.saveNotices(data.notices);
      if (data.schedule) await DB.saveSchedule(data.schedule);
      if (data.resourcesMeta) await DB.saveResources(data.resourcesMeta);
    },
  };

  global.DB = DB;
})(window);
