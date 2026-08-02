/* ============================================================
   STARZ · 아이스하키팀 플랫폼 — 앱 로직
   ============================================================ */
(function () {
  'use strict';

  /* ---------- constants ---------- */
  const STATUS = {
    present: { label: '출석', short: '출', cls: 'present' },
    late:    { label: '지각', short: '지', cls: 'late' },
    excused: { label: '사유', short: '사', cls: 'excused' },
    absent:  { label: '결석', short: '결', cls: 'absent' },
  };
  const POSITIONS = ['골리(GK)', '수비(DF)', '공격(FW)', '센터(C)', '미정'];
  const SESSION_TYPES = ['정기훈련', '경기', '친선전', '이벤트', '기타'];
  const RES_CATS = ['경기영상', '훈련영상', '단체사진', '경기사진', '기타'];

  /* ---------- helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const monthStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const fmtDate = (s) => { if (!s) return ''; const [y, m, d] = s.split('-'); const wd = ['일', '월', '화', '수', '목', '금', '토'][new Date(s + 'T00:00:00').getDay()]; return `${y}.${m}.${d} (${wd})`; };
  const fmtSize = (b) => b < 1024 ? b + 'B' : b < 1048576 ? (b / 1024).toFixed(0) + 'KB' : (b / 1048576).toFixed(1) + 'MB';
  const initials = (name) => (name || '?').trim().slice(-2);

  function toast(msg, type) {
    const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (type ? ' ' + type : '');
    t.hidden = false; clearTimeout(t._t); t._t = setTimeout(() => { t.className = 'toast'; }, 2400);
  }
  function confirmBox(msg) { return window.confirm(msg); }

  /* ---------- modal ---------- */
  const modal = {
    open(title, bodyNode) {
      $('#modalTitle').textContent = title;
      const body = $('#modalBody'); body.innerHTML = ''; body.appendChild(bodyNode);
      $('#modalBackdrop').hidden = false;
    },
    close() { $('#modalBackdrop').hidden = true; },
  };
  $('#modalClose').addEventListener('click', () => modal.close());
  $('#modalBackdrop').addEventListener('click', (e) => { if (e.target.id === 'modalBackdrop') modal.close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') modal.close(); });

  /* ---------- stats engine ---------- */
  function sessionDates() {
    // union of explicit sessions + any date present in attendance map
    const set = new Set(DB.getSessions().map(s => s.date));
    Object.keys(DB.getAttendance()).forEach(d => set.add(d));
    return [...set].sort();
  }
  function sessionsInMonth(mo) { return sessionDates().filter(d => d.startsWith(mo)); }

  function memberStats(memberId, dates) {
    const att = DB.getAttendance();
    let present = 0, late = 0, excused = 0, absent = 0;
    dates.forEach(d => {
      const s = att[d] && att[d][memberId];
      if (s === 'present') present++;
      else if (s === 'late') late++;
      else if (s === 'excused') excused++;
      else absent++; // no record on a session date counts as absent
    });
    const total = dates.length;
    const attended = present + late; // 지각도 참석으로 인정
    const rate = total ? Math.round((attended / total) * 100) : 0;
    return { present, late, excused, absent, total, attended, rate };
  }

  /* ============================================================
     ROUTER
     ============================================================ */
  const views = {};
  let currentView = 'dashboard';
  const TITLES = { dashboard: '대시보드', attendance: '출석체크', monthly: '월간 출석현황', members: '멤버 명단', schedule: '일정', notices: '공지사항', resources: '자료실' };

  function navigate(view) {
    currentView = view;
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    $('#pageTitle').textContent = TITLES[view] || '';
    $('#sidebar').classList.remove('open');
    const content = $('#content'); content.innerHTML = '';
    (views[view] || (() => {}))(content);
    content.scrollTop = 0; window.scrollTo(0, 0);
  }
  $('#nav').addEventListener('click', (e) => { const b = e.target.closest('.nav-item'); if (b) navigate(b.dataset.view); });
  $('#hamburger').addEventListener('click', () => $('#sidebar').classList.toggle('open'));

  /* ============================================================
     VIEW: DASHBOARD
     ============================================================ */
  views.dashboard = (root) => {
    const members = DB.getMembers();
    const mo = monthStr();
    const monthDates = sessionsInMonth(mo);
    const allDates = sessionDates();

    // team-wide monthly rate
    let sumRate = 0;
    const ranked = members.map(m => {
      const st = memberStats(m.id, monthDates);
      sumRate += st.rate;
      return { m, st };
    }).sort((a, b) => b.st.rate - a.st.rate || b.st.attended - a.st.attended);
    const teamRate = members.length && monthDates.length ? Math.round(sumRate / members.length) : 0;

    // today session?
    const t = todayStr();
    const hasToday = allDates.includes(t);

    // stat cards
    const cards = el('div', 'cards');
    cards.appendChild(statCard('멤버 수', members.length + '명', '🏒', false));
    cards.appendChild(statCard('이번 달 세션', monthDates.length + '회', '🗓️', false));
    cards.appendChild(statCard('이번 달 팀 평균 출석률', teamRate + '%', '📈', true));
    const upcoming = DB.getSchedule().filter(s => s.date >= t).sort((a, b) => a.date.localeCompare(b.date));
    cards.appendChild(statCard('다가오는 일정', upcoming.length + '건', '⏰', false));
    root.appendChild(cards);

    // quick actions
    const qa = el('div', 'section');
    qa.innerHTML = `<div class="section-head"><h2>빠른 시작</h2></div>`;
    const qaRow = el('div', 'toolbar');
    const bAtt = el('button', 'btn', '✅ 오늘 출석체크');
    bAtt.onclick = () => { navigate('attendance'); };
    const bMem = el('button', 'btn-ghost', '🏒 멤버 추가');
    bMem.onclick = () => { navigate('members'); setTimeout(() => memberForm(), 60); };
    const bNotice = el('button', 'btn-ghost', '📢 공지 작성');
    bNotice.onclick = () => { navigate('notices'); setTimeout(() => noticeForm(), 60); };
    qaRow.append(bAtt, bMem, bNotice);
    qa.appendChild(qaRow);
    if (!hasToday && members.length) {
      const tip = el('p', 'hint', `오늘(${fmtDate(t)}) 출석 기록이 아직 없습니다. "오늘 출석체크"로 시작하세요.`);
      qa.appendChild(tip);
    }
    root.appendChild(qa);

    // two-column: ranking + upcoming/notices
    const two = el('div', 'grid');
    two.style.gridTemplateColumns = 'minmax(0,1.3fr) minmax(0,1fr)';
    two.style.alignItems = 'start';

    // ranking card
    const rc = el('div', 'card');
    rc.innerHTML = `<div class="section-head"><h2>🏆 이번 달 출석왕</h2><div class="spacer"></div><span class="subtle">${mo.replace('-', '.')}</span></div>`;
    if (!members.length) rc.appendChild(emptyBox('🏒', '멤버를 먼저 등록하세요.'));
    else if (!monthDates.length) rc.appendChild(emptyBox('🗓️', '이번 달 출석 기록이 없습니다.'));
    else {
      const list = el('div', 'rank-list');
      ranked.slice(0, 8).forEach((r, i) => {
        const row = el('div', 'rank-row');
        row.innerHTML = `<div class="rank-no">${i + 1}</div>
          <div class="att-avatar" style="width:34px;height:34px;font-size:13px">${esc(initials(r.m.name))}</div>
          <div class="rank-name">${esc(r.m.name)} ${r.m.number ? `<span class="badge">#${esc(r.m.number)}</span>` : ''}</div>
          <div style="min-width:120px;text-align:right">
            <span class="rate-num" style="color:var(--gold-soft)">${r.st.rate}%</span>
            <div class="rate-bar" style="margin-top:5px"><div class="rate-fill" style="width:${r.st.rate}%"></div></div>
          </div>`;
        list.appendChild(row);
      });
      rc.appendChild(list);
    }
    two.appendChild(rc);

    // right column: upcoming + latest notice
    const right = el('div', 'grid');
    const uc = el('div', 'card');
    uc.innerHTML = `<div class="section-head"><h2>⏰ 다가오는 일정</h2></div>`;
    if (!upcoming.length) uc.appendChild(emptyBox('🗓️', '예정된 일정이 없습니다.'));
    else {
      const list = el('div', 'rank-list');
      upcoming.slice(0, 4).forEach(s => {
        const row = el('div', 'rank-row');
        row.innerHTML = `<div class="rank-no" style="background:rgba(255,207,51,.14);color:var(--gold-soft)">${s.date.slice(8)}</div>
          <div class="rank-name"><div style="font-weight:700">${esc(s.title)}</div>
          <div class="subtle" style="font-size:12px">${fmtDate(s.date)}${s.time ? ' · ' + esc(s.time) : ''}${s.location ? ' · ' + esc(s.location) : ''}</div></div>
          <span class="badge">${esc(s.type || '')}</span>`;
        list.appendChild(row);
      });
      uc.appendChild(list);
    }
    right.appendChild(uc);

    const nc = el('div', 'card');
    const notices = DB.getNotices().slice().sort((a, b) => (b.pinned - a.pinned) || b.createdAt.localeCompare(a.createdAt));
    nc.innerHTML = `<div class="section-head"><h2>📢 최근 공지</h2></div>`;
    if (!notices.length) nc.appendChild(emptyBox('📢', '공지사항이 없습니다.'));
    else {
      const list = el('div', 'rank-list');
      notices.slice(0, 3).forEach(n => {
        const row = el('div', 'rank-row');
        row.innerHTML = `<div class="rank-name"><div style="font-weight:700">${n.pinned ? '📌 ' : ''}${esc(n.title)}</div>
          <div class="subtle" style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px">${esc(n.body)}</div></div>`;
        list.appendChild(row);
      });
      nc.appendChild(list);
    }
    right.appendChild(nc);
    two.appendChild(right);

    const wrap = el('div', 'section'); wrap.appendChild(two); root.appendChild(wrap);
  };

  function statCard(lbl, val, ico, gold) {
    const c = el('div', 'card');
    c.innerHTML = `<div class="stat ${gold ? 'gold' : ''}"><span class="ico">${ico}</span><span class="val">${val}</span><span class="lbl">${lbl}</span></div>`;
    return c;
  }
  function emptyBox(ico, msg) { return el('div', 'empty', `<div class="big">${ico}</div><p>${msg}</p>`); }

  /* ============================================================
     VIEW: ATTENDANCE (weekly input)
     ============================================================ */
  let attDate = todayStr();
  views.attendance = (root) => {
    const members = DB.getMembers();
    if (!members.length) { root.appendChild(bigEmpty('🏒', '먼저 멤버 명단을 등록하세요.', '멤버 추가하러 가기', () => navigate('members'))); return; }

    const sessions = DB.getSessions();
    const existing = sessions.find(s => s.date === attDate);

    // toolbar: date + session type
    const bar = el('div', 'card');
    bar.innerHTML = `
      <div class="section-head"><h2>세션 선택</h2><div class="spacer"></div>
        <span class="subtle" id="attProgress"></span></div>
      <div class="form-row">
        <div class="field"><label>날짜</label><input type="date" id="attDate" class="input" value="${attDate}" /></div>
        <div class="field"><label>세션 종류</label>
          <select id="attType" class="select">${SESSION_TYPES.map(t => `<option ${existing && existing.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
        </div>
      </div>
      <div class="field"><label>세션 제목 (선택)</label><input id="attTitle" class="input" placeholder="예: 8월 첫째주 정기훈련" value="${existing ? esc(existing.title || '') : ''}" /></div>
    `;
    root.appendChild(bar);

    // bulk actions
    const tb = el('div', 'toolbar'); tb.style.marginTop = '16px';
    const bAll = el('button', 'chip-btn', '전체 출석');
    bAll.onclick = () => setAllStatus('present');
    const bNone = el('button', 'chip-btn', '전체 결석');
    bNone.onclick = () => setAllStatus('absent');
    tb.append(el('span', 'subtle', '일괄: '), bAll, bNone);
    root.appendChild(tb);

    // member list
    const att = DB.getAttendance();
    const dayMap = att[attDate] || {};
    const list = el('div', 'att-list');
    members.forEach(m => {
      const row = el('div', 'att-row'); row.dataset.mid = m.id;
      const cur = dayMap[m.id] || '';
      row.innerHTML = `
        <div class="att-avatar">${esc(initials(m.name))}</div>
        <div class="att-meta"><div class="n">${esc(m.name)} ${m.number ? `<span class="badge">#${esc(m.number)}</span>` : ''}</div>
          <div class="m">${esc(m.position || '')}${m.position && m.job ? ' · ' : ''}${esc(m.job || '')}</div></div>
        <div class="status-group">
          ${Object.entries(STATUS).map(([k, v]) => `<button class="st-btn ${v.cls} ${cur === k ? 'on' : ''}" data-s="${k}">${v.label}</button>`).join('')}
        </div>`;
      list.appendChild(row);
    });
    root.appendChild(list);

    // save bar
    const save = el('div', 'form-actions'); save.style.marginTop = '18px';
    const bSave = el('button', 'btn', '💾 출석 저장');
    bSave.onclick = () => saveAttendance();
    save.appendChild(bSave);
    root.appendChild(save);

    // interactions
    list.addEventListener('click', (e) => {
      const btn = e.target.closest('.st-btn'); if (!btn) return;
      const group = btn.closest('.status-group');
      $$('.st-btn', group).forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      updateProgress();
    });
    $('#attDate').addEventListener('change', (e) => { attDate = e.target.value; navigate('attendance'); });
    updateProgress();

    function setAllStatus(status) {
      $$('.att-row', list).forEach(row => {
        $$('.st-btn', row).forEach(b => b.classList.toggle('on', b.dataset.s === status));
      });
      updateProgress();
    }
    function updateProgress() {
      let done = 0;
      $$('.att-row', list).forEach(row => { if ($('.st-btn.on', row)) done++; });
      $('#attProgress').textContent = `${done} / ${members.length} 명 체크됨`;
    }
    function saveAttendance() {
      const att = DB.getAttendance();
      const dm = {};
      $$('.att-row', list).forEach(row => {
        const on = $('.st-btn.on', row);
        if (on) dm[row.dataset.mid] = on.dataset.s;
      });
      att[attDate] = dm;
      DB.saveAttendance(att);
      // upsert session record
      const sessions = DB.getSessions().filter(s => s.date !== attDate);
      sessions.push({ date: attDate, type: $('#attType').value, title: $('#attTitle').value.trim() });
      DB.saveSessions(sessions);
      toast('출석이 저장되었습니다 ✅', 'ok');
    }
  };

  function bigEmpty(ico, msg, btnLabel, onClick) {
    const box = el('div', 'empty');
    box.innerHTML = `<div class="big">${ico}</div><p>${msg}</p>`;
    if (btnLabel) { const b = el('button', 'btn', btnLabel); b.style.marginTop = '16px'; b.onclick = onClick; box.appendChild(b); }
    return box;
  }

  /* ============================================================
     VIEW: MONTHLY dashboard
     ============================================================ */
  let curMonth = monthStr();
  views.monthly = (root) => {
    const members = DB.getMembers();

    // month selector
    const bar = el('div', 'toolbar');
    const prev = el('button', 'icon-btn', '‹'); prev.style.fontSize = '20px';
    const next = el('button', 'icon-btn', '›'); next.style.fontSize = '20px';
    const label = el('span', ''); label.style.fontWeight = '900'; label.style.fontSize = '18px'; label.style.minWidth = '120px'; label.style.textAlign = 'center';
    label.textContent = curMonth.replace('-', '. ') + '월';
    prev.onclick = () => { curMonth = shiftMonth(curMonth, -1); navigate('monthly'); };
    next.onclick = () => { curMonth = shiftMonth(curMonth, +1); navigate('monthly'); };
    bar.append(prev, label, next, el('span', 'grow'));
    const bExport = el('button', 'btn-ghost sm', '⬇︎ CSV 내보내기');
    bExport.onclick = () => exportMonthlyCsv();
    bar.appendChild(bExport);
    root.appendChild(bar);

    const dates = sessionsInMonth(curMonth);
    if (!members.length) { root.appendChild(emptyBox('🏒', '등록된 멤버가 없습니다.')); return; }
    if (!dates.length) { root.appendChild(emptyBox('🗓️', `${curMonth.replace('-', '.')}월 출석 기록이 없습니다.`)); return; }

    // summary cards
    const rows = members.map(m => ({ m, st: memberStats(m.id, dates) })).sort((a, b) => b.st.rate - a.st.rate);
    const teamRate = Math.round(rows.reduce((s, r) => s + r.st.rate, 0) / rows.length);
    const cards = el('div', 'cards'); cards.style.marginTop = '16px';
    cards.appendChild(statCard('세션 수', dates.length + '회', '🗓️', false));
    cards.appendChild(statCard('팀 평균 출석률', teamRate + '%', '📈', true));
    const perfect = rows.filter(r => r.st.rate === 100).length;
    cards.appendChild(statCard('개근 인원', perfect + '명', '🏅', false));
    const totalPresent = rows.reduce((s, r) => s + r.st.present + r.st.late, 0);
    cards.appendChild(statCard('총 참석 연인원', totalPresent + '명', '👥', false));
    root.appendChild(cards);

    // per-member rate table
    const sec = el('div', 'section');
    sec.innerHTML = `<div class="section-head"><h2>인원별 출석률</h2></div>`;
    const wrap = el('div', 'table-wrap');
    const table = el('table');
    table.innerHTML = `<thead><tr>
      <th>멤버</th><th>출석률</th><th>출석</th><th>지각</th><th>사유</th><th>결석</th><th style="min-width:140px">진행바</th>
    </tr></thead>`;
    const tb = el('tbody');
    rows.forEach(r => {
      const tr = el('tr');
      tr.innerHTML = `
        <td class="t-name">${esc(r.m.name)} ${r.m.number ? `<span class="badge">#${esc(r.m.number)}</span>` : ''}</td>
        <td class="mono rate-num" style="color:${r.st.rate >= 80 ? 'var(--green)' : r.st.rate >= 50 ? 'var(--amber)' : 'var(--red)'}">${r.st.rate}%</td>
        <td class="mono">${r.st.present}</td>
        <td class="mono">${r.st.late}</td>
        <td class="mono">${r.st.excused}</td>
        <td class="mono">${r.st.absent}</td>
        <td><div class="rate-bar"><div class="rate-fill" style="width:${r.st.rate}%"></div></div></td>`;
      tb.appendChild(tr);
    });
    table.appendChild(tb); wrap.appendChild(table); sec.appendChild(wrap); root.appendChild(sec);

    // detailed calendar grid (member x date)
    const sec2 = el('div', 'section');
    sec2.innerHTML = `<div class="section-head"><h2>세부 출석표</h2><div class="spacer"></div><span class="subtle">출 지 사 결</span></div>`;
    const wrap2 = el('div', 'table-wrap');
    const t2 = el('table', 'month-table');
    t2.innerHTML = `<thead><tr><th style="position:sticky;left:0;background:#0e1938">멤버</th>${dates.map(d => `<th style="text-align:center">${d.slice(5).replace('-', '/')}</th>`).join('')}</tr></thead>`;
    const tb2 = el('tbody');
    const att = DB.getAttendance();
    members.forEach(m => {
      const tr = el('tr');
      let cells = `<td class="t-name" style="position:sticky;left:0;background:#0c1430">${esc(m.name)}</td>`;
      dates.forEach(d => {
        const s = (att[d] && att[d][m.id]) || 'absent';
        const v = STATUS[s] || STATUS.absent;
        cells += `<td class="cell"><span class="dot ${v.cls}">${v.short}</span></td>`;
      });
      tr.innerHTML = cells; tb2.appendChild(tr);
    });
    t2.appendChild(tb2); wrap2.appendChild(t2); sec2.appendChild(wrap2); root.appendChild(sec2);

    function exportMonthlyCsv() {
      const header = ['멤버', '등번호', ...dates, '출석률(%)', '출석', '지각', '사유', '결석'];
      const lines = [header.join(',')];
      members.forEach(m => {
        const st = memberStats(m.id, dates);
        const cells = dates.map(d => { const s = (att[d] && att[d][m.id]) || 'absent'; return (STATUS[s] || STATUS.absent).label; });
        lines.push([m.name, m.number || '', ...cells, st.rate, st.present, st.late, st.excused, st.absent].join(','));
      });
      downloadText(`STARZ_출석_${curMonth}.csv`, '﻿' + lines.join('\n'), 'text/csv');
    }
  };
  function shiftMonth(mo, delta) {
    const [y, m] = mo.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  }

  /* ============================================================
     VIEW: MEMBERS
     ============================================================ */
  views.members = (root) => {
    const bar = el('div', 'toolbar');
    bar.innerHTML = `<span class="subtle" id="memCount"></span>`;
    const grow = el('span', 'grow'); bar.appendChild(grow);
    const search = el('input', 'input'); search.placeholder = '이름/직업/포지션 검색'; search.style.maxWidth = '220px';
    const bAdd = el('button', 'btn', '＋ 멤버 추가'); bAdd.onclick = () => memberForm();
    bar.append(search, bAdd);
    root.appendChild(bar);

    const wrapHost = el('div'); root.appendChild(wrapHost);

    function renderTable(filter) {
      const members = DB.getMembers().slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
      const f = (filter || '').trim().toLowerCase();
      const shown = f ? members.filter(m => [m.name, m.job, m.position].some(x => (x || '').toLowerCase().includes(f))) : members;
      $('#memCount').textContent = `${members.length}명 등록`;
      wrapHost.innerHTML = '';
      if (!members.length) { wrapHost.appendChild(bigEmpty('🏒', '아직 등록된 멤버가 없습니다.', '＋ 첫 멤버 추가', () => memberForm())); return; }
      const wrap = el('div', 'table-wrap');
      const table = el('table');
      table.innerHTML = `<thead><tr><th>이름</th><th>등번호</th><th>포지션</th><th>나이</th><th>연락처</th><th>직업</th><th>가입일</th><th></th></tr></thead>`;
      const tb = el('tbody');
      shown.forEach(m => {
        const tr = el('tr');
        tr.innerHTML = `
          <td class="t-name">${esc(m.name)}</td>
          <td>${m.number ? `<span class="badge gold">#${esc(m.number)}</span>` : '<span class="subtle">-</span>'}</td>
          <td>${esc(m.position || '-')}</td>
          <td class="mono">${m.age ? esc(m.age) + '세' : '-'}</td>
          <td class="mono">${esc(m.phone || '-')}</td>
          <td>${esc(m.job || '-')}</td>
          <td class="mono subtle">${esc(m.joinedAt || '-')}</td>
          <td style="text-align:right"><button class="icon-btn" data-edit="${m.id}">✏️</button><button class="icon-btn" data-del="${m.id}">🗑️</button></td>`;
        tb.appendChild(tr);
      });
      table.appendChild(tb); wrap.appendChild(table); wrapHost.appendChild(wrap);
    }
    wrapHost.addEventListener('click', (e) => {
      const ed = e.target.closest('[data-edit]'); const dl = e.target.closest('[data-del]');
      if (ed) { const m = DB.getMembers().find(x => x.id === ed.dataset.edit); memberForm(m); }
      if (dl) {
        const m = DB.getMembers().find(x => x.id === dl.dataset.del);
        if (m && confirmBox(`'${m.name}' 멤버를 삭제할까요?\n(출석 기록도 함께 사라집니다)`)) {
          DB.saveMembers(DB.getMembers().filter(x => x.id !== m.id));
          // clean attendance
          const att = DB.getAttendance();
          Object.keys(att).forEach(d => { delete att[d][m.id]; });
          DB.saveAttendance(att);
          toast('삭제되었습니다', 'ok'); renderTable(search.value);
        }
      }
    });
    search.addEventListener('input', () => renderTable(search.value));
    root._refresh = () => renderTable(search.value);
    renderTable('');
  };

  function memberForm(existing) {
    const m = existing || {};
    const form = el('form');
    form.innerHTML = `
      <div class="form-row">
        <div class="field"><label>이름 *</label><input name="name" class="input" required value="${esc(m.name || '')}" /></div>
        <div class="field"><label>등번호</label><input name="number" class="input" inputmode="numeric" value="${esc(m.number || '')}" placeholder="예: 17" /></div>
      </div>
      <div class="form-row">
        <div class="field"><label>나이</label><input name="age" class="input" inputmode="numeric" value="${esc(m.age || '')}" placeholder="예: 27" /></div>
        <div class="field"><label>포지션</label><select name="position" class="select">${POSITIONS.map(p => `<option ${m.position === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label>연락처</label><input name="phone" class="input" inputmode="tel" value="${esc(m.phone || '')}" placeholder="010-0000-0000" /></div>
      <div class="field"><label>직업</label><input name="job" class="input" value="${esc(m.job || '')}" placeholder="예: 회사원 / 학생 / 자영업" /></div>
      <div class="field"><label>가입일</label><input name="joinedAt" type="date" class="input" value="${esc(m.joinedAt || todayStr())}" /></div>
      <div class="form-actions">
        <button type="button" class="btn-ghost" data-cancel>취소</button>
        <button type="submit" class="btn">저장</button>
      </div>`;
    form.querySelector('[data-cancel]').onclick = () => modal.close();
    form.onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const name = fd.get('name').trim();
      if (!name) { toast('이름을 입력하세요', 'err'); return; }
      const members = DB.getMembers();
      const rec = {
        id: m.id || DB.uid(),
        name, number: fd.get('number').trim(), age: fd.get('age').trim(),
        position: fd.get('position'), phone: fd.get('phone').trim(), job: fd.get('job').trim(),
        joinedAt: fd.get('joinedAt'),
      };
      if (m.id) { const i = members.findIndex(x => x.id === m.id); members[i] = rec; }
      else members.push(rec);
      DB.saveMembers(members);
      modal.close(); toast(m.id ? '수정되었습니다' : '멤버가 추가되었습니다', 'ok');
      if (currentView === 'members') navigate('members');
    };
    modal.open(existing ? '멤버 수정' : '멤버 추가', form);
    setTimeout(() => form.querySelector('[name=name]').focus(), 50);
  }

  /* ============================================================
     VIEW: SCHEDULE
     ============================================================ */
  views.schedule = (root) => {
    const bar = el('div', 'toolbar');
    bar.append(el('span', 'grow'));
    const bAdd = el('button', 'btn', '＋ 일정 추가'); bAdd.onclick = () => scheduleForm();
    bar.appendChild(bAdd); root.appendChild(bar);

    const list = DB.getSchedule().slice().sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
    const t = todayStr();
    const upcoming = list.filter(s => s.date >= t);
    const past = list.filter(s => s.date < t).reverse();

    if (!list.length) { root.appendChild(bigEmpty('🗓️', '등록된 일정이 없습니다.', '＋ 첫 일정 추가', () => scheduleForm())); return; }
    root.appendChild(scheduleSection('다가오는 일정', upcoming, false));
    if (past.length) root.appendChild(scheduleSection('지난 일정', past, true));

    root.addEventListener('click', (e) => {
      const ed = e.target.closest('[data-edit]'); const dl = e.target.closest('[data-del]');
      if (ed) scheduleForm(DB.getSchedule().find(x => x.id === ed.dataset.edit));
      if (dl && confirmBox('이 일정을 삭제할까요?')) {
        DB.saveSchedule(DB.getSchedule().filter(x => x.id !== dl.dataset.del));
        toast('삭제되었습니다', 'ok'); navigate('schedule');
      }
    });
  };
  function scheduleSection(title, items, dim) {
    const sec = el('div', 'section');
    sec.innerHTML = `<div class="section-head"><h2>${title}</h2><div class="spacer"></div><span class="subtle">${items.length}건</span></div>`;
    if (!items.length) { sec.appendChild(el('p', 'subtle', '없음')); return sec; }
    const list = el('div', 'rank-list');
    items.forEach(s => {
      const row = el('div', 'rank-row'); if (dim) row.style.opacity = '.62';
      const [y, mo, d] = s.date.split('-');
      row.innerHTML = `
        <div style="text-align:center;min-width:48px">
          <div style="font-size:11px;color:var(--muted)">${mo}월</div>
          <div style="font-size:22px;font-weight:900;font-family:'Montserrat'">${d}</div>
        </div>
        <div class="rank-name"><div style="font-weight:700">${esc(s.title)} <span class="badge">${esc(s.type || '')}</span></div>
          <div class="subtle" style="font-size:12.5px">${fmtDate(s.date)}${s.time ? ' · ' + esc(s.time) : ''}${s.location ? ' · 📍' + esc(s.location) : ''}</div>
          ${s.memo ? `<div class="subtle" style="font-size:12px;margin-top:3px">${esc(s.memo)}</div>` : ''}</div>
        <div><button class="icon-btn" data-edit="${s.id}">✏️</button><button class="icon-btn" data-del="${s.id}">🗑️</button></div>`;
      list.appendChild(row);
    });
    sec.appendChild(list); return sec;
  }
  function scheduleForm(existing) {
    const s = existing || {};
    const form = el('form');
    form.innerHTML = `
      <div class="field"><label>제목 *</label><input name="title" class="input" required value="${esc(s.title || '')}" placeholder="예: 정기훈련 / OO팀과 친선경기" /></div>
      <div class="form-row">
        <div class="field"><label>날짜 *</label><input name="date" type="date" class="input" required value="${esc(s.date || todayStr())}" /></div>
        <div class="field"><label>시간</label><input name="time" type="time" class="input" value="${esc(s.time || '')}" /></div>
      </div>
      <div class="form-row">
        <div class="field"><label>종류</label><select name="type" class="select">${SESSION_TYPES.map(t => `<option ${s.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="field"><label>장소</label><input name="location" class="input" value="${esc(s.location || '')}" placeholder="예: OO아이스링크" /></div>
      </div>
      <div class="field"><label>메모</label><textarea name="memo" class="textarea" placeholder="준비물, 상대팀, 집합 안내 등">${esc(s.memo || '')}</textarea></div>
      <div class="form-actions"><button type="button" class="btn-ghost" data-cancel>취소</button><button type="submit" class="btn">저장</button></div>`;
    form.querySelector('[data-cancel]').onclick = () => modal.close();
    form.onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const list = DB.getSchedule();
      const rec = { id: s.id || DB.uid(), title: fd.get('title').trim(), date: fd.get('date'), time: fd.get('time'), type: fd.get('type'), location: fd.get('location').trim(), memo: fd.get('memo').trim() };
      if (!rec.title || !rec.date) { toast('제목과 날짜는 필수입니다', 'err'); return; }
      if (s.id) { list[list.findIndex(x => x.id === s.id)] = rec; } else list.push(rec);
      DB.saveSchedule(list); modal.close(); toast('저장되었습니다', 'ok'); navigate('schedule');
    };
    modal.open(existing ? '일정 수정' : '일정 추가', form);
  }

  /* ============================================================
     VIEW: NOTICES
     ============================================================ */
  views.notices = (root) => {
    const bar = el('div', 'toolbar'); bar.append(el('span', 'grow'));
    const bAdd = el('button', 'btn', '＋ 공지 작성'); bAdd.onclick = () => noticeForm();
    bar.appendChild(bAdd); root.appendChild(bar);

    const notices = DB.getNotices().slice().sort((a, b) => (b.pinned - a.pinned) || b.createdAt.localeCompare(a.createdAt));
    if (!notices.length) { root.appendChild(bigEmpty('📢', '등록된 공지사항이 없습니다.', '＋ 첫 공지 작성', () => noticeForm())); return; }
    const host = el('div'); root.appendChild(host);
    notices.forEach(n => {
      const card = el('div', 'notice' + (n.pinned ? ' pinned' : ''));
      card.innerHTML = `
        <div class="notice-actions">
          <button class="icon-btn" data-pin="${n.id}" title="고정">${n.pinned ? '📌' : '📍'}</button>
          <button class="icon-btn" data-edit="${n.id}">✏️</button>
          <button class="icon-btn" data-del="${n.id}">🗑️</button>
        </div>
        <div class="notice-head"><div class="notice-title">${n.pinned ? '📌 ' : ''}${esc(n.title)}</div></div>
        <div class="notice-body">${esc(n.body)}</div>
        <div class="notice-meta"><span>✍️ ${esc(n.author || '운영진')}</span><span>🕒 ${esc((n.createdAt || '').slice(0, 10))}</span></div>`;
      host.appendChild(card);
    });
    host.addEventListener('click', (e) => {
      const pin = e.target.closest('[data-pin]'); const ed = e.target.closest('[data-edit]'); const dl = e.target.closest('[data-del]');
      const list = DB.getNotices();
      if (pin) { const n = list.find(x => x.id === pin.dataset.pin); n.pinned = !n.pinned; DB.saveNotices(list); navigate('notices'); }
      if (ed) noticeForm(list.find(x => x.id === ed.dataset.edit));
      if (dl && confirmBox('이 공지를 삭제할까요?')) { DB.saveNotices(list.filter(x => x.id !== dl.dataset.del)); toast('삭제되었습니다', 'ok'); navigate('notices'); }
    });
  };
  function noticeForm(existing) {
    const n = existing || {};
    const form = el('form');
    form.innerHTML = `
      <div class="field"><label>제목 *</label><input name="title" class="input" required value="${esc(n.title || '')}" /></div>
      <div class="field"><label>내용</label><textarea name="body" class="textarea" style="min-height:140px" placeholder="공지 내용을 입력하세요">${esc(n.body || '')}</textarea></div>
      <div class="form-row">
        <div class="field"><label>작성자</label><input name="author" class="input" value="${esc(n.author || '운영진')}" /></div>
        <div class="field" style="justify-content:flex-end"><label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" name="pinned" ${n.pinned ? 'checked' : ''} style="width:18px;height:18px" /> 상단 고정</label></div>
      </div>
      <div class="form-actions"><button type="button" class="btn-ghost" data-cancel>취소</button><button type="submit" class="btn">저장</button></div>`;
    form.querySelector('[data-cancel]').onclick = () => modal.close();
    form.onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const list = DB.getNotices();
      const title = fd.get('title').trim();
      if (!title) { toast('제목을 입력하세요', 'err'); return; }
      const rec = { id: n.id || DB.uid(), title, body: fd.get('body').trim(), author: fd.get('author').trim() || '운영진', pinned: !!fd.get('pinned'), createdAt: n.createdAt || new Date().toISOString() };
      if (n.id) { list[list.findIndex(x => x.id === n.id)] = rec; } else list.unshift(rec);
      DB.saveNotices(list); modal.close(); toast('저장되었습니다', 'ok'); navigate('notices');
    };
    modal.open(existing ? '공지 수정' : '공지 작성', form);
    setTimeout(() => form.querySelector('[name=title]').focus(), 50);
  }

  /* ============================================================
     VIEW: RESOURCES (photo/video library)
     ============================================================ */
  let resFilter = '전체';
  views.resources = (root) => {
    // upload zone
    const dz = el('div', 'dropzone');
    dz.innerHTML = `<div class="big">🎬📷</div><div><b>사진 · 영상 올리기</b></div><div class="hint">클릭하거나 파일을 여기로 끌어다 놓으세요 (여러 개 가능)</div>`;
    const fileInput = el('input'); fileInput.type = 'file'; fileInput.accept = 'image/*,video/*'; fileInput.multiple = true; fileInput.hidden = true;
    dz.appendChild(fileInput);
    dz.onclick = () => fileInput.click();
    fileInput.onchange = () => handleFiles([...fileInput.files]);
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
    dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('drag'); handleFiles([...e.dataTransfer.files]); });
    root.appendChild(dz);

    // category filter
    const filt = el('div', 'toolbar'); filt.style.marginTop = '16px';
    ['전체', ...RES_CATS].forEach(c => {
      const b = el('button', 'chip-btn' + (resFilter === c ? ' on' : ''), c);
      b.onclick = () => { resFilter = c; navigate('resources'); };
      filt.appendChild(b);
    });
    root.appendChild(filt);

    const gridHost = el('div', 'section'); root.appendChild(gridHost);
    renderGrid();

    function renderGrid() {
      const all = DB.getResources().slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      const items = resFilter === '전체' ? all : all.filter(r => r.category === resFilter);
      gridHost.innerHTML = '';
      if (!all.length) { gridHost.appendChild(emptyBox('🎬', '아직 올라온 자료가 없습니다. 위에서 사진이나 영상을 올려보세요.')); return; }
      if (!items.length) { gridHost.appendChild(emptyBox('🔍', `'${resFilter}' 카테고리에 자료가 없습니다.`)); return; }
      const grid = el('div', 'res-grid');
      items.forEach(r => {
        const card = el('div', 'res-card'); card.dataset.id = r.id;
        card.innerHTML = `
          <div class="res-thumb" data-view-id="${r.id}">
            <div class="loading subtle" style="font-size:12px">불러오는 중…</div>
            ${r.type === 'video' ? '<div class="play">▶</div>' : ''}
          </div>
          <div class="res-info">
            <div class="rt" title="${esc(r.title)}">${r.type === 'video' ? '🎬 ' : '📷 '}${esc(r.title)}</div>
            <div class="rm"><span>${esc(r.category || '기타')}</span><span>${fmtSize(r.size || 0)}</span></div>
            <div class="rm" style="margin-top:6px">
              <span class="subtle">${esc((r.createdAt || '').slice(0, 10))}</span>
              <button class="btn-danger" data-del="${r.id}" style="padding:3px 8px;font-size:11px">삭제</button>
            </div>
          </div>`;
        grid.appendChild(card);
        // lazy load thumb
        DB.mediaGet(r.id).then(blob => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const thumb = card.querySelector('.res-thumb');
          const media = r.type === 'video' ? el('video') : el('img');
          media.src = url; if (r.type === 'video') { media.muted = true; media.preload = 'metadata'; }
          thumb.querySelector('.loading')?.remove();
          thumb.insertBefore(media, thumb.firstChild);
        });
      });
      gridHost.appendChild(grid);

      grid.addEventListener('click', (e) => {
        const del = e.target.closest('[data-del]');
        const view = e.target.closest('[data-view-id]');
        if (del) {
          e.stopPropagation();
          if (confirmBox('이 자료를 삭제할까요?')) {
            DB.mediaDel(del.dataset.del);
            DB.saveResources(DB.getResources().filter(x => x.id !== del.dataset.del));
            toast('삭제되었습니다', 'ok'); renderGrid();
          }
          return;
        }
        if (view) { const r = DB.getResources().find(x => x.id === view.dataset.viewId); if (r) openViewer(r); }
      });
    }

    async function handleFiles(files) {
      const valid = files.filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
      if (!valid.length) { toast('사진 또는 영상 파일만 올릴 수 있어요', 'err'); return; }
      for (const f of valid) {
        await uploadOne(f);
      }
    }
    function uploadOne(file) {
      return new Promise(resolve => {
        const isVideo = file.type.startsWith('video/');
        const form = el('form');
        form.innerHTML = `
          <div class="field"><label>제목</label><input name="title" class="input" value="${esc(file.name.replace(/\.[^.]+$/, ''))}" /></div>
          <div class="field"><label>카테고리</label><select name="category" class="select">${RES_CATS.map(c => `<option ${((isVideo && c.includes('영상')) || (!isVideo && c.includes('사진'))) ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
          <p class="hint">${esc(file.name)} · ${fmtSize(file.size)} · ${isVideo ? '영상' : '사진'}</p>
          <div class="form-actions"><button type="button" class="btn-ghost" data-cancel>건너뛰기</button><button type="submit" class="btn">업로드</button></div>`;
        form.querySelector('[data-cancel]').onclick = () => { modal.close(); resolve(); };
        form.onsubmit = async (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          const id = DB.uid();
          try {
            await DB.mediaPut(id, file);
            const meta = DB.getResources();
            meta.push({ id, title: fd.get('title').trim() || file.name, category: fd.get('category'), type: isVideo ? 'video' : 'photo', mime: file.type, size: file.size, createdAt: new Date().toISOString() });
            DB.saveResources(meta);
            modal.close(); toast('업로드 완료 🎉', 'ok'); renderGrid(); resolve();
          } catch (err) {
            console.error(err); toast('저장 실패: 용량이 너무 클 수 있어요', 'err'); resolve();
          }
        };
        modal.open('자료 업로드', form);
      });
    }
  };

  function openViewer(r) {
    const box = el('div', 'viewer');
    box.innerHTML = `<div class="subtle" style="margin-bottom:10px">${esc(r.category || '')} · ${fmtSize(r.size || 0)}</div><div class="loading subtle">불러오는 중…</div>`;
    DB.mediaGet(r.id).then(blob => {
      if (!blob) { box.innerHTML = '<p class="subtle">파일을 찾을 수 없습니다.</p>'; return; }
      const url = URL.createObjectURL(blob);
      box.querySelector('.loading')?.remove();
      const media = r.type === 'video' ? el('video') : el('img');
      media.src = url; if (r.type === 'video') { media.controls = true; media.autoplay = true; }
      box.appendChild(media);
      const dl = el('a', 'btn-ghost sm', '⬇︎ 원본 저장'); dl.href = url; dl.download = r.title; dl.style.display = 'inline-block'; dl.style.marginTop = '12px';
      box.appendChild(dl);
    });
    modal.open(r.title, box);
  }

  /* ============================================================
     Backup / Restore / util
     ============================================================ */
  function downloadText(name, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain' });
    const a = el('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  $('#btnBackup').addEventListener('click', async () => {
    toast('백업 파일 생성 중…');
    const data = await DB.exportAll();
    downloadText(`STARZ_백업_${todayStr()}.json`, JSON.stringify(data), 'application/json');
    toast('백업 파일이 저장되었습니다 💾', 'ok');
  });
  $('#btnRestore').addEventListener('click', () => $('#restoreFile').click());
  $('#restoreFile').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    if (!confirmBox('백업을 불러오면 현재 데이터에 덮어써집니다. 계속할까요?')) { e.target.value = ''; return; }
    try {
      const data = JSON.parse(await file.text());
      await DB.importAll(data);
      toast('복원 완료 ✅', 'ok'); navigate(currentView);
    } catch (err) { console.error(err); toast('복원 실패: ' + err.message, 'err'); }
    e.target.value = '';
  });

  /* ---------- first-run seed (demo helper only if empty) ---------- */
  function seedIfFirstRun() {
    if (localStorage.getItem('starz.meta')) return;
    localStorage.setItem('starz.meta', JSON.stringify({ createdAt: new Date().toISOString() }));
    if (!DB.getNotices().length) {
      DB.saveNotices([{ id: DB.uid(), title: 'STARZ 플랫폼에 오신 것을 환영합니다! 🏒', body: '이곳에서 매주 출석을 체크하고, 월별 출석 현황을 확인할 수 있어요.\n\n1) [멤버 명단]에서 팀원을 등록하세요.\n2) [출석체크]에서 매주 출석을 입력하세요.\n3) [월간 출석현황]에서 대시보드를 확인하세요.\n\n공지사항·일정·자료실(사진/영상)도 활용해 보세요!', author: '운영진', pinned: true, createdAt: new Date().toISOString() }]);
    }
  }

  /* ---------- boot ---------- */
  $('#todayLabel').textContent = fmtDate(todayStr());
  seedIfFirstRun();
  navigate('dashboard');
})();
