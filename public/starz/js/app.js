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
  // 이번주(0)/다음주(1) 일요일 날짜. 오늘이 일요일이면 오늘이 '이번주 일요일'.
  const sundayStr = (offsetWeeks) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + ((7 - d.getDay()) % 7) + offsetWeeks * 7); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const fmtSunShort = (s) => { const [, m, d] = s.split('-'); return `${Number(m)}/${Number(d)}`; };
  const fmtDate = (s) => { if (!s) return ''; const [y, m, d] = s.split('-'); const wd = ['일', '월', '화', '수', '목', '금', '토'][new Date(s + 'T00:00:00').getDay()]; return `${y}.${m}.${d} (${wd})`; };
  const fmtSize = (b) => b < 1024 ? b + 'B' : b < 1048576 ? (b / 1024).toFixed(0) + 'KB' : (b / 1048576).toFixed(1) + 'MB';
  const initials = (name) => (name || '?').trim().slice(-2);
  const GENDER = { M: { label: '남', cls: 'male' }, F: { label: '여', cls: 'female' } };
  const genderBadge = (g) => (g && GENDER[g]) ? `<span class="gbadge ${GENDER[g].cls}">${GENDER[g].label}</span>` : '';
  const GEAR_CAP = 3; // 성별별 주당 장비 대여 상한
  // RSVP 값 정규화: 과거 문자열('yes'/'no') 또는 객체 {status, gear} 모두 지원
  const rEntry = (map, mid) => { const v = map && map[mid]; if (!v) return null; return typeof v === 'string' ? { status: v } : v; };
  const isGearNeed = (map, mid) => { const e = rEntry(map, mid); return !!(e && e.status === 'yes' && e.gear === 'need'); };
  // 인스타그램 핸들 정규화: @핸들 / 핸들 / 전체 URL 무엇을 넣어도 핸들만 저장
  const igNormalize = (raw) => {
    if (!raw) return '';
    let s = String(raw).trim();
    s = s.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '');
    s = s.replace(/^@/, '');
    s = s.replace(/[/?#].*$/, '');
    return s.trim();
  };
  const igUrl = (handle) => 'https://instagram.com/' + encodeURIComponent(handle);
  const sizeText = (e) => (e && (e.height || e.foot)) ? `키 ${e.height || '-'} · 발 ${e.foot || '-'}` : '';

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
  const TITLES = { dashboard: '대시보드', rsvp: '이번주 참석', attendance: '출석체크(기록)', monthly: '월간 출석현황', members: '멤버 명단', schedule: '일정', notices: '공지사항', resources: '자료실', guide: '사용법' };

  function renderView(view) {
    currentView = view;
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    $('#pageTitle').textContent = TITLES[view] || '';
    const content = $('#content'); content.innerHTML = '';
    (views[view] || (() => {}))(content);
    content.scrollTop = 0; window.scrollTo(0, 0);
  }
  function closeMenuVisual() { $('#sidebar').classList.remove('open'); const bd = $('#navBackdrop'); if (bd) bd.hidden = true; }
  function openMenu() {
    $('#sidebar').classList.add('open');
    const bd = $('#navBackdrop'); if (bd) bd.hidden = false;
    try { history.pushState({ starzView: currentView, starzMenu: true }, ''); } catch (e) {}
  }
  function closeMenuViaBack() { if (history.state && history.state.starzMenu) history.back(); else closeMenuVisual(); }

  // 화면 전환 — 브라우저 히스토리에 기록해 '뒤로가기'가 이전 화면으로 가게 함
  function navigate(view) {
    const fromMenu = history.state && history.state.starzMenu;
    renderView(view);
    closeMenuVisual();
    try {
      if (fromMenu) history.replaceState({ starzView: view }, ''); // 메뉴에서 고르면 메뉴 항목을 화면 항목으로 대체
      else history.pushState({ starzView: view }, '');
    } catch (e) {}
  }
  $('#nav').addEventListener('click', (e) => { const b = e.target.closest('.nav-item'); if (b) navigate(b.dataset.view); });
  $('#hamburger').addEventListener('click', () => { $('#sidebar').classList.contains('open') ? closeMenuViaBack() : openMenu(); });
  $('#navBackdrop').addEventListener('click', closeMenuViaBack);
  window.addEventListener('popstate', (e) => {
    const menuWasOpen = $('#sidebar').classList.contains('open');
    closeMenuVisual();
    const view = (e.state && e.state.starzView) ? e.state.starzView : 'dashboard';
    if (menuWasOpen && view === currentView) return; // 열린 메뉴만 닫고 화면은 유지
    renderView(view);
  });

  /* ============================================================
     VIEW: DASHBOARD
     ============================================================ */
  views.dashboard = (root) => {
    const members = DB.getMembers();
    const mo = monthStr();
    const monthDates = sessionsInMonth(mo);
    const allDates = sessionDates();

    // team-wide monthly rate (팀 평균 출석률 카드용)
    let sumRate = 0;
    members.forEach(m => { sumRate += memberStats(m.id, monthDates).rate; });
    const teamRate = members.length && monthDates.length ? Math.round(sumRate / members.length) : 0;

    // today session?
    const t = todayStr();
    const hasToday = allDates.includes(t);

    // ── 최상단 큰 참석 CTA (이번주/다음주 참석하기 + 멤버 추가) ──
    const hero = el('div', 'cta-hero');
    hero.innerHTML = `
      <div class="cta-title">🏒 일요일 모임 참석 체크<small>이번주 · 다음주 참석 여부를 눌러주세요</small></div>
      <div class="cta-buttons">
        <button class="cta-btn primary" data-rsvp="0"><span>✋ 이번주 참석하기</span><small>${fmtSunShort(sundayStr(0))} (일)</small></button>
        <button class="cta-btn next" data-rsvp="1"><span>📅 다음주 참석하기</span><small>${fmtSunShort(sundayStr(1))} (일)</small></button>
      </div>
      <button class="cta-member" data-act="addmember">🏒 멤버 추가하기</button>`;
    hero.addEventListener('click', (e) => {
      const rb = e.target.closest('[data-rsvp]');
      if (rb) { rsvpWeek = Number(rb.dataset.rsvp); navigate('rsvp'); return; }
      if (e.target.closest('[data-act="addmember"]')) { navigate('members'); setTimeout(() => memberForm(), 60); }
    });
    root.appendChild(hero);

    // ── 일요일 모임 참석 현황 (이번주 / 다음주) ──
    const rsvpSec = el('div', 'section'); rsvpSec.style.marginTop = '0';
    rsvpSec.innerHTML = `<div class="section-head"><h2>🏒 일요일 모임 참석 현황</h2><div class="spacer"></div><span class="subtle">매주 일요일 모임</span></div>`;
    const rsvpTwo = el('div', 'grid');
    rsvpTwo.style.gridTemplateColumns = 'repeat(auto-fit,minmax(260px,1fr))';
    rsvpTwo.append(rsvpDashCard(sundayStr(0), '이번주 일요일'), rsvpDashCard(sundayStr(1), '다음주 일요일'));
    rsvpSec.appendChild(rsvpTwo);
    root.appendChild(rsvpSec);

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
    const bGuide = el('button', 'btn-ghost', '📖 사용법');
    bGuide.onclick = () => navigate('guide');
    qaRow.append(bAtt, bMem, bNotice, bGuide);
    qa.appendChild(qaRow);
    if (!hasToday && members.length) {
      const tip = el('p', 'hint', `오늘(${fmtDate(t)}) 출석 기록이 아직 없습니다. "오늘 출석체크"로 시작하세요.`);
      qa.appendChild(tip);
    }
    root.appendChild(qa);

    // 🏆 출석왕 — 실제 참여(참석) 많이 한 순
    const kingSec = el('div', 'section');
    kingSec.innerHTML = `<div class="section-head"><h2>🏆 출석왕</h2><div class="spacer"></div><span class="subtle">참여(참석) 많이 한 순</span></div>`;
    const kingGrid = el('div', 'grid');
    kingGrid.style.gridTemplateColumns = 'repeat(auto-fit,minmax(280px,1fr))';
    kingGrid.style.alignItems = 'start';
    kingGrid.append(
      attKingCard('👑 이번 달 출석왕', mo, mo.replace('-', '.') + '월'),
      attKingCard('🏅 올해의 출석왕', t.slice(0, 4), t.slice(0, 4) + '년')
    );
    kingSec.appendChild(kingGrid);
    root.appendChild(kingSec);

    // 다가오는 일정 + 최근 공지
    const two = el('div', 'grid');
    two.style.gridTemplateColumns = 'repeat(auto-fit,minmax(280px,1fr))';
    two.style.alignItems = 'start';
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
    two.appendChild(uc);

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
    two.appendChild(nc);

    const wrap = el('div', 'section'); wrap.appendChild(two); root.appendChild(wrap);
  };

  function statCard(lbl, val, ico, gold) {
    const c = el('div', 'card');
    c.innerHTML = `<div class="stat ${gold ? 'gold' : ''}"><span class="ico">${ico}</span><span class="val">${val}</span><span class="lbl">${lbl}</span></div>`;
    return c;
  }
  function emptyBox(ico, msg) { return el('div', 'empty', `<div class="big">${ico}</div><p>${msg}</p>`); }

  // 참여 횟수: 해당 기간(prefix: 'YYYY' 또는 'YYYY-MM') 안에서, 오늘까지의 날짜 중
  // 출석기록(출석·지각) 또는 이번주 참석(참석) 으로 참여한 서로 다른 날짜 수
  function participationCount(memberId, prefix, maxDate) {
    const dates = new Set();
    const att = DB.getAttendance();
    for (const d in att) { if (d.startsWith(prefix) && d <= maxDate) { const s = att[d][memberId]; if (s === 'present' || s === 'late') dates.add(d); } }
    const rsvp = DB.getRsvp();
    for (const d in rsvp) { if (d.startsWith(prefix) && d <= maxDate) { const e = rEntry(rsvp[d], memberId); if (e && e.status === 'yes') dates.add(d); } }
    return dates.size;
  }

  // 출석왕 카드 (참여 횟수 많은 순)
  function attKingCard(title, prefix, subLabel) {
    const members = DB.getMembers();
    const today = todayStr();
    const ranked = members.map(m => ({ m, cnt: participationCount(m.id, prefix, today) }))
      .sort((a, b) => b.cnt - a.cnt || (a.m.name || '').localeCompare(b.m.name || '', 'ko'));
    const top = ranked.filter(r => r.cnt > 0).slice(0, 8);
    const max = top.length ? top[0].cnt : 0;
    const c = el('div', 'card');
    c.innerHTML = `<div class="section-head"><h2>${title}</h2><div class="spacer"></div><span class="subtle">${subLabel}</span></div>`;
    if (!members.length) { c.appendChild(emptyBox('🏒', '멤버를 먼저 등록하세요.')); return c; }
    if (!top.length) { c.appendChild(emptyBox('🗓️', '아직 참여 기록이 없습니다.')); return c; }
    const list = el('div', 'rank-list');
    top.forEach((r, i) => {
      const row = el('div', 'rank-row');
      row.innerHTML = `<div class="rank-no">${i + 1}</div>
        <div class="att-avatar ${r.m.gender === 'F' ? 'f' : r.m.gender === 'M' ? 'm' : ''}" style="width:34px;height:34px;font-size:13px">${esc(initials(r.m.name))}</div>
        <div class="rank-name">${esc(r.m.name)} ${genderBadge(r.m.gender)} ${r.m.number ? `<span class="badge">#${esc(r.m.number)}</span>` : ''}</div>
        <div style="min-width:110px;text-align:right">
          <span class="rate-num" style="color:var(--gold-soft)">${r.cnt}<span style="font-size:12px;font-weight:600;margin-left:1px">회</span></span>
          <div class="rate-bar" style="margin-top:5px"><div class="rate-fill" style="width:${Math.round(r.cnt / max * 100)}%"></div></div>
        </div>`;
      list.appendChild(row);
    });
    c.appendChild(list);
    return c;
  }

  // 대시보드용 일요일 참석 요약 카드 (성별·장비 표시)
  function rsvpDashCard(dateStr, label) {
    const members = DB.getMembers();
    const map = DB.getRsvp()[dateStr] || {};
    const yes = members.filter(m => { const e = rEntry(map, m.id); return e && e.status === 'yes'; });
    const no = members.filter(m => { const e = rEntry(map, m.id); return e && e.status === 'no'; });
    const und = members.filter(m => !rEntry(map, m.id));
    const yM = yes.filter(m => m.gender === 'M').length, yF = yes.filter(m => m.gender === 'F').length;
    const gM = members.filter(m => m.gender === 'M' && isGearNeed(map, m.id)).length;
    const gF = members.filter(m => m.gender === 'F' && isGearNeed(map, m.id)).length;
    const chip = (m, kind) => {
      const e = rEntry(map, m.id);
      const gear = kind === 'yes' && e && e.gear === 'need';
      const sz = gear && (e.height || e.foot) ? ` ${e.height || '-'}·${e.foot || '-'}` : '';
      return `<span class="name-chip ${kind} ${m.gender === 'F' ? 'gf' : m.gender === 'M' ? 'gm' : ''}">${genderBadge(m.gender)}${esc(m.name)}${m.number ? ' <b>#' + esc(m.number) + '</b>' : ''}${gear ? ` <span class="gear-tag" title="장비 대여 · 키/발">🎽${sz}</span>` : ''}</span>`;
    };
    const c = el('div', 'card');
    c.innerHTML = `
      <div class="section-head"><h2>${label}</h2><div class="spacer"></div><span class="badge gold">${fmtSunShort(dateStr)} (일)</span></div>
      <div class="rsvp-big"><span class="rsvp-num">${yes.length}</span><span class="rsvp-lbl">명 참석 <span class="subtle">(남 ${yM}·여 ${yF})</span></span></div>
      <div class="chip-row">${yes.length ? yes.map(m => chip(m, 'yes')).join('') : '<span class="subtle">아직 참석 표시한 멤버가 없어요</span>'}</div>
      <div class="rsvp-sub"><span class="pill absent">불참 ${no.length}</span><span class="pill none">미정 ${und.length}</span><span class="pill gearp">🎽 장비 남 ${gM}/${GEAR_CAP}·여 ${gF}/${GEAR_CAP}</span></div>
      ${no.length ? `<div class="chip-row" style="margin-top:8px">${no.map(m => chip(m, 'no')).join('')}</div>` : ''}`;
    return c;
  }

  /* ============================================================
     VIEW: RSVP (이번주/다음주 일요일 참석·불참)
     ============================================================ */
  let rsvpWeek = 0; // 0=이번주, 1=다음주
  views.rsvp = (root) => {
    const members = DB.getMembers();
    if (!members.length) { root.appendChild(bigEmpty('🏒', '먼저 멤버 명단을 등록하세요.', '멤버 추가하러 가기', () => navigate('members'))); return; }

    const sunThis = sundayStr(0), sunNext = sundayStr(1);
    const target = rsvpWeek === 0 ? sunThis : sunNext;

    // 주 선택 탭
    const tabs = el('div', 'toolbar');
    const mkTab = (w, label, ds) => { const b = el('button', 'chip-btn' + (rsvpWeek === w ? ' on' : ''), `${label} · ${fmtSunShort(ds)}(일)`); b.onclick = () => { rsvpWeek = w; navigate('rsvp'); }; return b; };
    tabs.append(mkTab(0, '이번주 일요일', sunThis), mkTab(1, '다음주 일요일', sunNext));
    root.appendChild(tabs);

    // 헤더 카운트 + 장비 현황
    const head = el('div', 'card');
    head.innerHTML = `<div class="section-head"><h2>${fmtDate(target)} 참석 체크</h2><div class="spacer"></div>
      <span class="pill present" id="rc-yes"></span><span class="pill absent" id="rc-no"></span><span class="pill none" id="rc-und"></span></div>
      <div class="gear-summary" id="gearSummary"></div>
      <p class="hint">이름 옆 <b>참석/불참</b>을 누르고, 참석 시 <b>장비 대여 필요/불필요</b>를 선택하세요. 즉시 저장됩니다.<br/><b>필요</b>를 누르면 <b>키·발 사이즈</b>를 입력합니다. 장비 대여는 한 주에 <b>남 ${GEAR_CAP}명 · 여 ${GEAR_CAP}명</b>까지만 가능합니다.</p>`;
    root.appendChild(head);

    // 일괄
    const bulk = el('div', 'toolbar');
    const bAll = el('button', 'chip-btn', '전체 참석'); bAll.onclick = () => setAll('yes');
    const bClear = el('button', 'chip-btn', '전체 초기화'); bClear.onclick = () => setAll(null);
    bulk.append(el('span', 'subtle', '일괄: '), bAll, bClear);
    root.appendChild(bulk);

    // 멤버 목록
    const list = el('div', 'att-list');
    members.forEach(m => {
      const e = rEntry(DB.getRsvp()[target], m.id) || {};
      const row = el('div', 'att-row rsvp-row'); row.dataset.mid = m.id;
      row.innerHTML = `
        <div class="att-avatar ${m.gender === 'F' ? 'f' : m.gender === 'M' ? 'm' : ''}">${esc(initials(m.name))}</div>
        <div class="att-meta"><div class="n">${esc(m.name)} ${genderBadge(m.gender)} ${m.number ? `<span class="badge">#${esc(m.number)}</span>` : ''}</div>
          <div class="m">${esc(m.position || '')}${m.position && m.job ? ' · ' : ''}${esc(m.job || '')}</div></div>
        <div class="rsvp-controls">
          <div class="status-group">
            <button class="st-btn present ${e.status === 'yes' ? 'on' : ''}" data-s="yes">참석</button>
            <button class="st-btn absent ${e.status === 'no' ? 'on' : ''}" data-s="no">불참</button>
          </div>
          <div class="gear-group ${e.status === 'yes' ? '' : 'hide'}">
            <span class="gear-label">장비대여</span>
            <button class="st-btn gearbtn need ${e.gear === 'need' ? 'on' : ''}" data-g="need">필요</button>
            <button class="st-btn gearbtn ${e.gear === 'no' ? 'on' : ''}" data-g="no">불필요</button>
            <span class="gear-size" ${e.gear === 'need' && sizeText(e) ? '' : 'hidden'}>${sizeText(e)}</span>
          </div>
        </div>`;
      list.appendChild(row);
    });
    root.appendChild(list);

    function gearCount(gender) {
      const map = DB.getRsvp()[target] || {};
      return members.filter(m => m.gender === gender && isGearNeed(map, m.id)).length;
    }
    function updateCounts() {
      const map = DB.getRsvp()[target] || {};
      let y = 0, n = 0;
      members.forEach(m => { const e = rEntry(map, m.id); if (e && e.status === 'yes') y++; else if (e && e.status === 'no') n++; });
      $('#rc-yes').textContent = `참석 ${y}`; $('#rc-no').textContent = `불참 ${n}`; $('#rc-und').textContent = `미정 ${members.length - y - n}`;
      $('#gearSummary').innerHTML = `<span class="gear-stat male">🎽 남 장비 ${gearCount('M')}/${GEAR_CAP}</span><span class="gear-stat female">🎽 여 장비 ${gearCount('F')}/${GEAR_CAP}</span>`;
    }
    updateCounts();

    function saveEntry(mid, patch) {
      const rsvp = DB.getRsvp();
      const map = Object.assign({}, rsvp[target] || {});
      const next = Object.assign({}, rEntry(map, mid) || {}, patch);
      if (next.status !== 'yes') delete next.gear;
      if (next.gear !== 'need') { delete next.height; delete next.foot; }
      if (!next.status) delete map[mid]; else map[mid] = next;
      const all = Object.assign({}, rsvp); all[target] = map;
      DB.saveRsvp(all);
    }

    list.addEventListener('click', (ev) => {
      const btn = ev.target.closest('.st-btn'); if (!btn) return;
      const row = btn.closest('.att-row'); const mid = row.dataset.mid;
      const member = members.find(x => x.id === mid);
      const cur = rEntry(DB.getRsvp()[target], mid) || {};

      if (btn.dataset.s) { // 참석 / 불참
        const val = btn.dataset.s;
        const newStatus = cur.status === val ? undefined : val;
        saveEntry(mid, { status: newStatus });
        $$('.status-group .st-btn', row).forEach(b => b.classList.toggle('on', !!newStatus && b.dataset.s === newStatus));
        const gg = $('.gear-group', row);
        if (newStatus === 'yes') gg.classList.remove('hide');
        else { gg.classList.add('hide'); $$('.gearbtn', row).forEach(b => b.classList.remove('on')); }
        updateCounts();
        return;
      }
      if (btn.dataset.g === 'need') { // 장비 필요 → 키/발 사이즈 입력
        if (cur.status !== 'yes') return;
        if (!member.gender) { toast('먼저 멤버 성별(남/여)을 등록해주세요', 'err'); return; }
        if (!isGearNeed(DB.getRsvp()[target], mid) && gearCount(member.gender) >= GEAR_CAP) {
          toast(`이번주 ${GENDER[member.gender].label}자 장비 대여는 ${GEAR_CAP}명까지예요`, 'err'); return;
        }
        gearSizeModal(member, { height: cur.height || member.height || '', foot: cur.foot || member.footSize || '' }, ({ height, foot }) => {
          saveEntry(mid, { gear: 'need', height, foot });
          // 멤버 기본 사이즈도 갱신(다음에 자동 입력)
          const ms = DB.getMembers(); const mi = ms.findIndex(x => x.id === mid);
          if (mi >= 0) { ms[mi] = Object.assign({}, ms[mi], { height, footSize: foot }); DB.saveMembers(ms); }
          $$('.gearbtn', row).forEach(b => b.classList.toggle('on', b.dataset.g === 'need'));
          const sz = $('.gear-size', row); if (sz) { sz.textContent = sizeText({ height, foot }); sz.hidden = !sizeText({ height, foot }); }
          updateCounts();
        });
        return;
      }
      if (btn.dataset.g === 'no') { // 불필요 (재클릭 시 취소)
        if (cur.status !== 'yes') return;
        const newGear = cur.gear === 'no' ? undefined : 'no';
        saveEntry(mid, { gear: newGear });
        $$('.gearbtn', row).forEach(b => b.classList.toggle('on', !!newGear && b.dataset.g === newGear));
        const sz = $('.gear-size', row); if (sz) { sz.textContent = ''; sz.hidden = true; }
        updateCounts();
        return;
      }
    });

    function setAll(val) {
      const rsvp = DB.getRsvp();
      const map = {};
      if (val === 'yes') members.forEach(m => { map[m.id] = { status: 'yes' }; });
      const all = Object.assign({}, rsvp); all[target] = map;
      DB.saveRsvp(all);
      navigate('rsvp');
      toast(val ? '전체 참석으로 표시했습니다 (장비는 개별 선택)' : '초기화했습니다', 'ok');
    }
  };

  function gearSizeModal(member, cur, onSave) {
    const form = el('form');
    form.innerHTML = `
      <p class="hint" style="margin-bottom:14px"><b>${esc(member.name)}</b> 님의 장비 대여 사이즈를 입력하세요.</p>
      <div class="form-row">
        <div class="field"><label>키 (cm)</label><input name="height" class="input" inputmode="numeric" value="${esc(cur.height || '')}" placeholder="예: 175" /></div>
        <div class="field"><label>발 사이즈 (mm)</label><input name="foot" class="input" inputmode="numeric" value="${esc(cur.foot || '')}" placeholder="예: 270" /></div>
      </div>
      <p class="hint">한 번 입력하면 다음 주에도 자동으로 채워져요.</p>
      <div class="form-actions"><button type="button" class="btn-ghost" data-cancel>취소</button><button type="submit" class="btn">장비 필요로 저장</button></div>`;
    form.querySelector('[data-cancel]').onclick = () => modal.close();
    form.onsubmit = (e) => { e.preventDefault(); const fd = new FormData(form); modal.close(); onSave({ height: fd.get('height').trim(), foot: fd.get('foot').trim() }); };
    modal.open('🎽 장비 대여 사이즈', form);
    setTimeout(() => { const h = form.querySelector('[name=height]'); if (h) h.focus(); }, 50);
  }

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
      const shown = f ? members.filter(m => [m.name, m.job, m.position, m.instagram].some(x => (x || '').toLowerCase().includes(f))) : members;
      $('#memCount').textContent = `${members.length}명 등록`;
      wrapHost.innerHTML = '';
      if (!members.length) { wrapHost.appendChild(bigEmpty('🏒', '아직 등록된 멤버가 없습니다.', '＋ 첫 멤버 추가', () => memberForm())); return; }
      const wrap = el('div', 'table-wrap');
      const table = el('table');
      table.innerHTML = `<thead><tr><th>이름</th><th>성별</th><th>등번호</th><th>포지션</th><th>나이</th><th>연락처</th><th>직업</th><th>인스타</th><th>가입일</th><th></th></tr></thead>`;
      const tb = el('tbody');
      shown.forEach(m => {
        const tr = el('tr');
        tr.innerHTML = `
          <td class="t-name">${esc(m.name)}</td>
          <td>${genderBadge(m.gender) || '<span class="subtle">-</span>'}</td>
          <td>${m.number ? `<span class="badge gold">#${esc(m.number)}</span>` : '<span class="subtle">-</span>'}</td>
          <td>${esc(m.position || '-')}</td>
          <td class="mono">${m.age ? esc(m.age) + '세' : '-'}</td>
          <td class="mono">${esc(m.phone || '-')}</td>
          <td>${esc(m.job || '-')}</td>
          <td>${m.instagram ? `<a class="ig-link" href="${igUrl(m.instagram)}" target="_blank" rel="noopener noreferrer">📷 @${esc(m.instagram)}</a>` : '<span class="subtle">-</span>'}</td>
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
        <div class="field"><label>성별</label><select name="gender" class="select">
          <option value="" ${!m.gender ? 'selected' : ''}>미지정</option>
          <option value="M" ${m.gender === 'M' ? 'selected' : ''}>남</option>
          <option value="F" ${m.gender === 'F' ? 'selected' : ''}>여</option>
        </select></div>
        <div class="field"><label>나이</label><input name="age" class="input" inputmode="numeric" value="${esc(m.age || '')}" placeholder="예: 27" /></div>
      </div>
      <div class="form-row">
        <div class="field"><label>포지션</label><select name="position" class="select">${POSITIONS.map(p => `<option ${m.position === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
        <div class="field"><label>연락처</label><input name="phone" class="input" inputmode="tel" value="${esc(m.phone || '')}" placeholder="010-0000-0000" /></div>
      </div>
      <div class="form-row">
        <div class="field"><label>키 (cm)</label><input name="height" class="input" inputmode="numeric" value="${esc(m.height || '')}" placeholder="예: 175" /></div>
        <div class="field"><label>발 사이즈 (mm)</label><input name="footSize" class="input" inputmode="numeric" value="${esc(m.footSize || '')}" placeholder="예: 270" /></div>
      </div>
      <div class="field"><label>직업</label><input name="job" class="input" value="${esc(m.job || '')}" placeholder="예: 회사원 / 학생 / 자영업" /></div>
      <div class="field"><label>인스타그램</label><input name="instagram" class="input" value="${esc(m.instagram || '')}" placeholder="핸들만 입력 (예: starz_hockey)" />
        <div class="hint">@나 전체 주소를 붙여도 자동으로 핸들만 저장돼요. 명단에서 누르면 인스타로 이동합니다.</div></div>
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
        name, number: fd.get('number').trim(), age: fd.get('age').trim(), gender: fd.get('gender') || '',
        position: fd.get('position'), phone: fd.get('phone').trim(), job: fd.get('job').trim(),
        height: fd.get('height').trim(), footSize: fd.get('footSize').trim(),
        instagram: igNormalize(fd.get('instagram')),
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
    dz.innerHTML = `<div class="big">🎬📷</div><div><b>사진 · 영상 올리기</b></div><div class="hint">클릭하거나 파일을 여기로 끌어다 놓으세요 · <b>수십 개 한 번에 선택 가능</b></div>`;
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

    const progHost = el('div'); root.appendChild(progHost); // 업로드 진행 표시
    const gridHost = el('div', 'section'); root.appendChild(gridHost);

    // 클릭 위임은 한 번만 등록 (gridHost 는 재렌더돼도 동일 요소)
    gridHost.addEventListener('click', (e) => {
      const del = e.target.closest('[data-del]');
      const edit = e.target.closest('[data-edit]');
      const view = e.target.closest('[data-view-id]');
      if (edit) { e.stopPropagation(); const r = DB.getResources().find(x => x.id === edit.dataset.edit); if (r) resEditForm(r, renderGrid); return; }
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
    renderGrid();

    const resDate = (r) => r.date || (r.createdAt || '').slice(0, 10);

    function resCard(r) {
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
            <span class="subtle">${esc(resDate(r) || '')}</span>
            <span style="display:flex;gap:4px">
              <button class="btn-ghost sm" data-edit="${r.id}" style="padding:3px 8px;font-size:11px">수정</button>
              <button class="btn-danger" data-del="${r.id}" style="padding:3px 8px;font-size:11px">삭제</button>
            </span>
          </div>
        </div>`;
      DB.mediaGet(r.id).then(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const thumb = card.querySelector('.res-thumb');
        const media = r.type === 'video' ? el('video') : el('img');
        media.src = url; if (r.type === 'video') { media.muted = true; media.preload = 'metadata'; }
        thumb.querySelector('.loading')?.remove();
        thumb.insertBefore(media, thumb.firstChild);
      });
      return card;
    }

    function renderGrid() {
      const all = DB.getResources().slice();
      const items = resFilter === '전체' ? all : all.filter(r => r.category === resFilter);
      gridHost.innerHTML = '';
      if (!all.length) { gridHost.appendChild(emptyBox('🎬', '아직 올라온 자료가 없습니다. 위에서 사진·영상을 여러 개 한 번에 올려보세요.')); return; }
      if (!items.length) { gridHost.appendChild(emptyBox('🔍', `'${resFilter}' 카테고리에 자료가 없습니다.`)); return; }

      // 날짜별 그룹화 (최신순)
      const groups = {};
      items.forEach(r => { const d = resDate(r) || '날짜 미지정'; (groups[d] = groups[d] || []).push(r); });
      Object.keys(groups).sort((a, b) => b.localeCompare(a)).forEach(d => {
        const list = groups[d].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        const head = el('div', 'date-group-head');
        head.innerHTML = `<span class="dg-date">📅 ${d === '날짜 미지정' ? d : fmtDate(d)}</span><span class="dg-count">${list.length}개</span>`;
        gridHost.appendChild(head);
        const grid = el('div', 'res-grid');
        list.forEach(r => grid.appendChild(resCard(r)));
        gridHost.appendChild(grid);
      });
    }

    // 여러 파일을 한 번에: 파일마다 창을 띄우지 않고 카테고리·날짜만 한 번 정한 뒤 일괄 업로드
    function handleFiles(files) {
      const valid = files.filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
      if (!valid.length) { toast('사진 또는 영상 파일만 올릴 수 있어요', 'err'); return; }
      const vids = valid.filter(f => f.type.startsWith('video/')).length;
      const imgs = valid.length - vids;
      const form = el('form');
      form.innerHTML = `
        <p class="hint" style="margin-bottom:14px">선택됨: 📷 사진 ${imgs}개 · 🎬 영상 ${vids}개 <b>(총 ${valid.length}개)</b></p>
        <div class="form-row">
          <div class="field"><label>카테고리 (전체 적용)</label><select name="category" class="select">${RES_CATS.map(c => `<option ${((vids >= imgs && c.includes('영상')) || (vids < imgs && c.includes('사진'))) ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
          <div class="field"><label>날짜 (그룹 기준)</label><input name="date" type="date" class="input" value="${todayStr()}" /></div>
        </div>
        <p class="hint">제목은 파일명으로 자동 지정됩니다. 올린 뒤 개별 <b>수정</b>으로 바꿀 수 있어요.</p>
        <div class="form-actions"><button type="button" class="btn-ghost" data-cancel>취소</button><button type="submit" class="btn">${valid.length}개 업로드</button></div>`;
      form.querySelector('[data-cancel]').onclick = () => modal.close();
      form.onsubmit = (e) => { e.preventDefault(); const fd = new FormData(form); modal.close(); bulkUpload(valid, fd.get('category'), fd.get('date')); };
      modal.open('자료 일괄 업로드', form);
    }

    async function bulkUpload(files, category, date) {
      progHost.innerHTML = `<div class="card upload-prog"><div class="up-row"><span id="upLbl">업로드 준비 중…</span><span id="upCnt" class="mono">0 / ${files.length}</span></div><div class="rate-bar" style="margin-top:10px"><div class="rate-fill" id="upFill" style="width:0%"></div></div></div>`;
      const meta = DB.getResources();
      let done = 0, failed = 0;
      for (const file of files) {
        const isVideo = file.type.startsWith('video/');
        const id = DB.uid();
        const lbl = $('#upLbl'); if (lbl) lbl.textContent = `업로드 중: ${file.name}`;
        try {
          await DB.mediaPut(id, file);
          meta.push({ id, title: file.name.replace(/\.[^.]+$/, ''), category, date, type: isVideo ? 'video' : 'photo', mime: file.type, size: file.size, createdAt: new Date().toISOString() });
        } catch (err) { console.error(err); failed++; }
        done++;
        const fill = $('#upFill'); if (fill) fill.style.width = Math.round(done / files.length * 100) + '%';
        const cnt = $('#upCnt'); if (cnt) cnt.textContent = `${done} / ${files.length}`;
      }
      await DB.saveResources(meta);
      progHost.innerHTML = '';
      toast(failed ? `${done - failed}개 완료 · ${failed}개 실패(용량 초과 가능)` : `${done}개 업로드 완료 🎉`, failed ? 'err' : 'ok');
      renderGrid();
    }
  };

  function resEditForm(r, onDone) {
    const form = el('form');
    form.innerHTML = `
      <div class="field"><label>제목</label><input name="title" class="input" value="${esc(r.title || '')}" /></div>
      <div class="form-row">
        <div class="field"><label>카테고리</label><select name="category" class="select">${RES_CATS.map(c => `<option ${r.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        <div class="field"><label>날짜 (그룹 기준)</label><input name="date" type="date" class="input" value="${esc(r.date || (r.createdAt || '').slice(0, 10))}" /></div>
      </div>
      <p class="hint">${r.type === 'video' ? '🎬 영상' : '📷 사진'} · ${fmtSize(r.size || 0)}</p>
      <div class="form-actions"><button type="button" class="btn-ghost" data-cancel>취소</button><button type="submit" class="btn">저장</button></div>`;
    form.querySelector('[data-cancel]').onclick = () => modal.close();
    form.onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const list = DB.getResources();
      const i = list.findIndex(x => x.id === r.id);
      if (i >= 0) { list[i] = Object.assign({}, list[i], { title: fd.get('title').trim() || list[i].title, category: fd.get('category'), date: fd.get('date') }); DB.saveResources(list); }
      modal.close(); toast('수정되었습니다', 'ok'); if (onDone) onDone();
    };
    modal.open('자료 수정', form);
  }

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
     VIEW: GUIDE (사용법)
     ============================================================ */
  views.guide = (root) => {
    const intro = el('div', 'card');
    intro.innerHTML = `
      <div class="guide-hero">
        <img src="assets/logo.jpg" alt="STARZ" class="guide-logo" />
        <div>
          <h2 style="font-size:18px;margin-bottom:4px">STARZ 플랫폼 사용법 🏒</h2>
          <p class="subtle" style="font-size:13.5px;line-height:1.6">스타즈 아이스하키팀의 출결·참석·공지·자료를 한 곳에서 관리합니다.<br/>아래 순서대로 한 번만 익히면 누구나 쉽게 쓸 수 있어요.</p>
        </div>
      </div>`;
    root.appendChild(intro);

    const steps = [
      { n: '1', ico: '🏒', title: '멤버부터 등록하기', to: 'members', btn: '멤버 명단 열기',
        html: `<b>멤버 명단 → ＋ 멤버 추가</b> 에서 팀원을 등록합니다.<ul><li>이름·<b>성별(남/여)</b>·나이·연락처·직업·등번호·포지션 입력</li><li>성별은 <b>장비 대여 인원 제한(남 3·여 3)</b> 계산에 쓰이니 꼭 넣어주세요</li><li>등록 후 언제든 <b>수정 ✏️ / 삭제 🗑️</b> 가능</li></ul>` },
      { n: '2', ico: '✋', title: '이번주 참석 체크 (매주 일요일)', to: 'rsvp', btn: '이번주 참석 열기',
        html: `<b>이번주 참석</b> 메뉴에서 이번주/다음주 일요일을 탭으로 고르고, 이름 옆 버튼을 누릅니다.<ul><li><b>참석 / 불참</b> — 누르면 즉시 저장(다시 누르면 취소)</li><li>참석을 누르면 <b>장비 대여 필요 / 불필요</b> 선택이 나타납니다</li><li>장비 <b>필요</b>는 한 주에 <b>남 3명 · 여 3명</b>까지만 가능(초과 시 안내)</li></ul>` },
      { n: '3', ico: '📊', title: '대시보드에서 한눈에 보기', to: 'dashboard', btn: '대시보드 열기',
        html: `첫 화면 맨 위에 <b>이번주·다음주 일요일 참석명단</b>이 보입니다.<ul><li>참석자 이름에 <b>남/여</b> 배지, 장비 대여자는 🎽 표시</li><li>참석 인원(남·여), 장비 현황(남 n/3·여 n/3), 이번 달 출석왕, 다가오는 일정도 표시</li></ul>` },
      { n: '4', ico: '✅', title: '출결 기록 & 월간 통계', to: 'attendance', btn: '출석체크 열기',
        html: `<b>출석체크(기록)</b> 은 실제 출결을 남기는 곳입니다(출석·지각·사유·결석).<br/><b>월간 출석현황</b> 에서 인원별 출석률·개근 인원·세부표를 보고 <b>CSV로 내보내기</b> 할 수 있어요.<br/><span class="subtle">※ '이번주 참석'(사전 신청)과 '출석체크'(실제 기록)는 서로 다른 기능입니다.</span>` },
      { n: '5', ico: '📢', title: '공지사항 & 일정', to: 'notices', btn: '공지사항 열기',
        html: `<b>공지사항</b> — 공지 작성·수정, 중요 공지는 📌 상단 고정.<br/><b>일정</b> — 훈련·경기·친선전 일정을 등록하면 대시보드 '다가오는 일정'에 표시됩니다.` },
      { n: '6', ico: '🎬', title: '자료실 (사진·영상)', to: 'resources', btn: '자료실 열기',
        html: `경기·훈련 사진과 영상을 올립니다.<ul><li><b>수십 개를 한 번에</b> 선택 → 카테고리·날짜만 정하면 일괄 업로드</li><li>자료는 <b>날짜별로 자동 정리</b>되어 보입니다</li><li>각 자료의 제목·카테고리·날짜는 <b>수정</b> 가능</li></ul>` },
    ];
    const grid = el('div', 'guide-list');
    steps.forEach(s => {
      const c = el('div', 'card guide-card');
      c.innerHTML = `
        <div class="guide-head"><span class="guide-num">${s.n}</span><span class="guide-ico">${s.ico}</span><h3>${s.title}</h3></div>
        <div class="guide-body">${s.html}</div>
        <button class="btn-ghost sm guide-go" data-goto="${s.to}">${s.btn} →</button>`;
      grid.appendChild(c);
    });
    root.appendChild(grid);

    // 팁 카드
    const tips = el('div', 'card guide-card');
    tips.innerHTML = `
      <div class="guide-head"><span class="guide-ico">💡</span><h3>알아두면 좋은 것</h3></div>
      <div class="guide-body"><ul>
        <li><b>연결 모드</b> — 왼쪽 아래 배지가 <span class="mode-badge shared" style="display:inline-block;padding:2px 8px">☁️ 공유 모드</span> 면 팀원과 <b>실시간 공유</b>, <span class="mode-badge local" style="display:inline-block;padding:2px 8px">💾 개인 모드</span> 면 이 기기에만 저장됩니다.</li>
        <li><b>백업</b> — 개인 모드일 땐 왼쪽 아래 <b>백업 저장</b>으로 가끔 백업하세요(기기·브라우저 이동 시 <b>백업 불러오기</b>).</li>
        <li><b>수정/삭제</b> — 멤버·공지·일정·자료 등 모든 항목에 ✏️ 수정 / 🗑️ 삭제 버튼이 있습니다.</li>
        <li><b>팀 공유</b> — 이 화면 주소를 팀 단톡방에 공유하면 누구나 로그인 없이 바로 접속합니다.</li>
        <li><b>📲 앱으로 설치</b> — 왼쪽 아래 <b>앱 설치하기</b> 버튼(또는 브라우저의 '홈 화면에 추가')으로 휴대폰에 앱처럼 설치할 수 있어요. 설치하면 전체화면으로 열리고 오프라인에서도 켜집니다.</li>
      </ul></div>`;
    root.appendChild(tips);

    root.addEventListener('click', (e) => { const g = e.target.closest('[data-goto]'); if (g) navigate(g.dataset.goto); });
  };

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

  /* ---------- first-run seed (welcome notice when empty) ---------- */
  function seedIfFirstRun() {
    if (localStorage.getItem('starz.meta')) return;
    localStorage.setItem('starz.meta', JSON.stringify({ createdAt: new Date().toISOString() }));
    if (!DB.getNotices().length) {
      DB.saveNotices([{ id: DB.uid(), title: 'STARZ 플랫폼에 오신 것을 환영합니다! 🏒', body: '이곳에서 매주 출석을 체크하고, 월별 출석 현황을 확인할 수 있어요.\n\n1) [멤버 명단]에서 팀원을 등록하세요.\n2) [출석체크]에서 매주 출석을 입력하세요.\n3) [월간 출석현황]에서 대시보드를 확인하세요.\n\n공지사항·일정·자료실(사진/영상)도 활용해 보세요!', author: '운영진', pinned: true, createdAt: new Date().toISOString() }]);
    }
  }

  /* ---------- connection mode badge ---------- */
  function renderModeBadge() {
    const badge = $('#modeBadge'); const note = $('#footNote');
    if (DB.isRemote()) {
      badge.textContent = '☁️ 공유 모드 · 실시간';
      badge.className = 'mode-badge shared';
      if (note) note.innerHTML = '팀원과 실시간으로 공유됩니다.';
    } else {
      badge.textContent = '💾 개인 모드 · 이 기기';
      badge.className = 'mode-badge local';
      if (note) note.innerHTML = '이 브라우저에만 저장됩니다.<br/>정기적으로 백업하세요.';
    }
  }
  window.addEventListener('starz-remote-failed', () => { toast('공유 서버 연결 실패 — 개인 모드로 전환합니다', 'err'); renderModeBadge(); });
  window.addEventListener('starz-sync-error', () => toast('저장 동기화 오류가 발생했습니다', 'err'));

  /* ---------- PWA: 서비스워커 등록 + 앱 설치 버튼 ---------- */
  function setupPwa() {
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('/starz/sw.js', { scope: '/starz/' }).catch((e) => console.warn('SW 등록 실패', e));
    }
    const btn = $('#btnInstall');
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    let deferred = null;

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault(); deferred = e;
      if (btn && !isStandalone) btn.hidden = false;
    });
    window.addEventListener('appinstalled', () => { if (btn) btn.hidden = true; toast('앱이 설치되었습니다 🎉', 'ok'); });

    if (btn) {
      btn.addEventListener('click', async () => {
        if (deferred) { deferred.prompt(); await deferred.userChoice; deferred = null; btn.hidden = true; }
        else if (isIOS) { showIosInstall(); }
        else { showInstallHelp(); }
      });
    }
    // iOS(사파리)는 beforeinstallprompt가 없으므로 안내 버튼을 직접 노출
    if (btn && isIOS && !isStandalone) btn.hidden = false;
  }
  function isInAppBrowser() {
    const ua = navigator.userAgent || '';
    return /KAKAOTALK|Instagram|FBAN|FBAV|FB_IAB|Line\/|NAVER\(inapp|DaumApps|SnapChat|Twitter|; wv\)/i.test(ua);
  }
  function bindCopyUrl(box) {
    const cp = box.querySelector('#copyUrlBtn');
    if (cp) cp.onclick = async () => {
      try { await navigator.clipboard.writeText(location.href); toast('주소를 복사했어요. 사파리 주소창에 붙여넣으세요', 'ok'); }
      catch (e) { toast('복사 실패 — 주소창을 길게 눌러 복사하세요', 'err'); }
    };
  }
  function showIosInstall() {
    const box = el('div');
    if (isInAppBrowser()) {
      box.innerHTML = `
        <p style="line-height:1.8;font-size:14.5px">지금 <b>카카오톡·인스타 같은 앱 안의 브라우저</b>로 열려 있어요.<br/>여기서는 홈 화면 추가가 <b>안 되니, 먼저 사파리(Safari)로 열어야</b> 합니다.</p>
        <ol style="line-height:2;margin:12px 0 0 18px;font-size:14px">
          <li>화면 <b>오른쪽 위 또는 아래의 <span style="font-size:16px">⋯</span> / 나침반(Safari) 아이콘</b>을 누릅니다</li>
          <li><b>Safari로 열기</b>(다른 브라우저로 열기)를 선택합니다</li>
          <li>사파리에서 하단 <b>공유 □↑ → 홈 화면에 추가</b></li>
        </ol>
        <button class="btn" id="copyUrlBtn" style="margin-top:14px;width:100%">🔗 주소 복사하기</button>
        <p class="hint" style="margin-top:10px">복사한 주소를 <b>사파리 주소창에 붙여넣어</b> 열어도 됩니다.</p>`;
    } else {
      box.innerHTML = `
        <p style="line-height:1.8;font-size:14.5px">아이폰 <b>사파리</b>에서 앱으로 설치하기:</p>
        <ol style="line-height:2;margin:10px 0 0 18px;font-size:14px">
          <li>화면 <b>하단(또는 상단)의 공유 버튼 □↑</b> 을 누릅니다</li>
          <li>메뉴를 내려 <b>홈 화면에 추가</b> 를 선택합니다</li>
          <li><b>추가</b> 를 누르면 홈 화면에 STARZ 앱 아이콘이 생깁니다</li>
        </ol>
        <p class="hint" style="margin-top:12px">공유 버튼이 안 보이면 화면을 살짝 위로 스크롤하거나 <b>맨 아래를 한 번 탭</b>하면 툴바가 나타납니다.</p>`;
    }
    modal.open('📲 앱 설치 (아이폰)', box);
    bindCopyUrl(box);
  }
  function showInstallHelp() {
    const box = el('div');
    box.innerHTML = `
      <p style="line-height:1.8;font-size:14.5px">앱으로 설치하는 방법:</p>
      <ol style="line-height:2;margin:10px 0 0 18px;font-size:14px">
        <li><b>안드로이드(크롬)</b>: 우측 상단 <b>⋮</b> 메뉴 → <b>앱 설치</b> 또는 <b>홈 화면에 추가</b></li>
        <li><b>PC(크롬·엣지)</b>: 주소창 오른쪽의 <b>설치</b> 아이콘(⊕) 클릭</li>
      </ol>
      <p class="hint" style="margin-top:12px">이미 설치돼 있거나 브라우저가 지원하지 않으면 버튼이 보이지 않을 수 있어요.</p>`;
    modal.open('📲 앱 설치', box);
  }

  /* ---------- boot ---------- */
  (async function boot() {
    setupPwa();
    $('#todayLabel').textContent = fmtDate(todayStr());
    // 원격(공유) 데이터 로드 + 실시간 반영. 다른 팀원이 바꾸면 자동 새로고침.
    await DB.init(() => { if ($('#modalBackdrop').hidden) renderView(currentView); });
    renderModeBadge();
    seedIfFirstRun();
    try { history.replaceState({ starzView: 'dashboard' }, ''); } catch (e) {}
    renderView('dashboard');
  })();
})();
