"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { CEO_TODOS, PRI_ORDER, PRI_TONE, CATS, NO_CAT, type CeoTodo, type Pri } from "./data";
import { uploadAttachment } from "@/lib/uploadAttachment";
import { upsertCeoTodo, toggleCeoTodo, deleteCeoTodo, importCeoTodos, testSendCeoDigest, reorderCeoTodos, setCeoPinned, setCeoChecklist } from "./actions";
import RevisionHistoryModal from "@/components/RevisionHistoryModal";
import { ChecklistEditor, ChecklistView, type ChecklistItem } from "@/components/Checklist";

const DATA_KEY = "ceo-todos-v1";

const SYNC_SQL = `create table if not exists public.ceo_todos (
  id text primary key, no int, cat text, text text not null,
  pri text not null default '최우선', done boolean not null default false,
  link text, files jsonb not null default '[]'::jsonb, src text, due_date date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.ceo_todos enable row level security;
drop policy if exists ceo_todos_owner on public.ceo_todos;
create policy ceo_todos_owner on public.ceo_todos for all to authenticated
  using (public.current_app_role() = 'owner') with check (public.current_app_role() = 'owner');`;

export default function CeoTodosClient({ dbReady, initial }: { dbReady: boolean; initial: CeoTodo[] }) {
  // 접근은 계정(최운호)으로 이미 통제됨 → 폴더 비번 게이트 없음.
  return <TodoBoard dbReady={dbReady} initial={initial} />;
}

// ── 투두 보드 ─────────────────────────────────────
function TodoBoard({ dbReady, initial }: { dbReady: boolean; initial: CeoTodo[] }) {
  const [items, setItems] = useState<CeoTodo[]>(dbReady ? initial : CEO_TODOS);
  const [hydrated, setHydrated] = useState(dbReady);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [migrateN, setMigrateN] = useState(0);
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [groupBy, setGroupBy] = useState<"pri" | "cat">("pri");
  const [filterVal, setFilterVal] = useState<string>("전체");
  const [showDone, setShowDone] = useState(false);
  const [modal, setModal] = useState<CeoTodo | "new" | null>(null);
  const [histTodo, setHistTodo] = useState<CeoTodo | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // 그룹 접힘 상태 로드/저장(기기 기억).
  useEffect(() => {
    try {
      const raw = localStorage.getItem("ceo-collapsed-v1");
      if (raw) setCollapsed(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);
  const toggleCollapse = (key: string) =>
    setCollapsed((prev) => {
      const n = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem("ceo-collapsed-v1", JSON.stringify(n));
      } catch {
        /* ignore */
      }
      return n;
    });

  // 하이드레이트: DB 모드면 localStorage 잔여분(이전 미이관 데이터) 개수만 파악, 아니면 localStorage에서 로드.
  useEffect(() => {
    if (dbReady) {
      try {
        const raw = localStorage.getItem(DATA_KEY);
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr) && arr.length) setMigrateN(arr.length);
        }
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      const raw = localStorage.getItem(DATA_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, [dbReady]);

  // localStorage 저장은 DB 모드가 아닐 때만.
  useEffect(() => {
    if (dbReady || !hydrated) return;
    try {
      localStorage.setItem(DATA_KEY, JSON.stringify(items));
    } catch {
      /* ignore */
    }
  }, [items, hydrated, dbReady]);

  const runDb = (p: Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await p;
      if (!r.ok) setErr(r.error ?? "저장 실패");
      else setErr(null);
    });

  const toggle = (id: string) => {
    const cur = items.find((i) => i.id === id);
    const nd = !cur?.done;
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, done: nd } : i)));
    if (dbReady) runDb(toggleCeoTodo(id, nd));
  };
  const toggleChecklistItem = (todoId: string, itemId: string, done: boolean) => {
    const cur = items.find((i) => i.id === todoId);
    const next = (cur?.checklist ?? []).map((c) => (c.id === itemId ? { ...c, done } : c));
    setItems((prev) => prev.map((i) => (i.id === todoId ? { ...i, checklist: next } : i)));
    if (dbReady) runDb(setCeoChecklist(todoId, next));
  };
  const remove = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (dbReady) runDb(deleteCeoTodo(id));
  };
  const upsert = (t: CeoTodo) => {
    setItems((prev) => {
      const idx = prev.findIndex((x) => x.id === t.id);
      if (idx >= 0) {
        const cp = [...prev];
        cp[idx] = t;
        return cp;
      }
      return [t, ...prev];
    });
    if (dbReady) runDb(upsertCeoTodo(t));
  };

  // 이 기기 localStorage 데이터를 서버로 올려 동기화 시작.
  const migrateThisDevice = () => {
    let arr: CeoTodo[] = [];
    try {
      const raw = localStorage.getItem(DATA_KEY);
      arr = raw ? (JSON.parse(raw) as CeoTodo[]) : [];
    } catch {
      arr = [];
    }
    if (!arr.length) { setMigrateN(0); return; }
    start(async () => {
      const r = await importCeoTodos(arr);
      if (!r.ok) { setErr(r.error ?? "올리기 실패"); return; }
      setItems((prev) => {
        const map = new Map(prev.map((i) => [i.id, i]));
        for (const t of arr) map.set(t.id, t);
        return [...map.values()];
      });
      try { localStorage.removeItem(DATA_KEY); } catch { /* ignore */ }
      setMigrateN(0);
      setErr(null);
    });
  };

  const dimValues = groupBy === "pri" ? PRI_ORDER : [...CATS, NO_CAT];
  const dimOf = (i: CeoTodo): string => (groupBy === "pri" ? i.pri : i.cat || NO_CAT);
  const filterOptions = ["전체", ...dimValues];

  // 검색·필터 통과분(완료 여부 무관)
  const matched = useMemo(() => {
    return items.filter((i) => {
      if (filterVal !== "전체" && dimOf(i) !== filterVal) return false;
      if (q && !i.text.toLowerCase().includes(q.toLowerCase()) && !(i.cat ?? "").includes(q)) return false;
      return true;
    });
  }, [items, filterVal, q, groupBy]);

  // 진행 중(미완료)만 우선순위/분류 그룹에 표시, 완료분은 별도 섹션으로.
  const filtered = matched.filter((i) => !i.done);
  const doneItems = matched.filter((i) => i.done);

  const total = items.length;
  const done = items.filter((i) => i.done).length;
  const switchGroup = (g: "pri" | "cat") => { setGroupBy(g); setFilterVal("전체"); };

  // 현재 보이는 모든 그룹 일괄 접기/펼치기.
  const collapseAll = (val: boolean) => {
    const keys = dimValues.filter((dv) => filtered.some((i) => dimOf(i) === dv)).map((dv) => `${groupBy}:${dv}`);
    setCollapsed((prev) => {
      const n = { ...prev };
      for (const k of keys) n[k] = val;
      try {
        localStorage.setItem("ceo-collapsed-v1", JSON.stringify(n));
      } catch {
        /* ignore */
      }
      return n;
    });
  };

  // 재정렬 결과 적용: sort_order 재부여 후 저장(DB/로컬 공통).
  const applyOrder = (arr: CeoTodo[]) => {
    const withSort = arr.map((it, i) => ({ ...it, sortOrder: i }));
    setItems(withSort);
    if (dbReady) runDb(reorderCeoTodos(withSort.map((it) => ({ id: it.id, sortOrder: it.sortOrder as number }))));
  };

  // 같은 그룹(현재 분류 기준) 안에서 위/아래로 이동.
  const move = (id: string, dir: "up" | "down") => {
    const arr = [...items];
    const idx = arr.findIndex((x) => x.id === id);
    if (idx < 0) return;
    const g = dimOf(arr[idx]);
    let j = -1;
    if (dir === "up") { for (let k = idx - 1; k >= 0; k--) if (dimOf(arr[k]) === g) { j = k; break; } }
    else { for (let k = idx + 1; k < arr.length; k++) if (dimOf(arr[k]) === g) { j = k; break; } }
    if (j < 0) return; // 그룹 내 끝
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    applyOrder(arr);
  };

  // 그룹 맨 위로.
  const moveTop = (id: string) => {
    const arr = [...items];
    const idx = arr.findIndex((x) => x.id === id);
    if (idx < 0) return;
    const g = dimOf(arr[idx]);
    const first = arr.findIndex((x) => dimOf(x) === g);
    if (first < 0 || first === idx) return;
    const [moved] = arr.splice(idx, 1);
    arr.splice(first, 0, moved);
    applyOrder(arr);
  };

  // 드래그 드롭(PC): 같은 그룹 안에서 target 위치로 이동.
  const onDropRow = (targetId: string) => {
    const src = dragId;
    setDragId(null);
    if (!src || src === targetId) return;
    const arr = [...items];
    const from = arr.findIndex((x) => x.id === src);
    const to = arr.findIndex((x) => x.id === targetId);
    if (from < 0 || to < 0 || dimOf(arr[from]) !== dimOf(arr[to])) return;
    const [moved] = arr.splice(from, 1);
    const insertAt = arr.findIndex((x) => x.id === targetId);
    arr.splice(insertAt, 0, moved);
    applyOrder(arr);
  };

  // 최신 items를 참조(포인터 드래그 종료 시 저장용)
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  // 모바일 손가락 드래그(pointer). 핸들에서 시작, 이동 중 겹치는 같은 그룹 행과 실시간 교체.
  const touchDragId = useRef<string | null>(null);
  const onHandlePointerDown = (e: React.PointerEvent, id: string) => {
    if (e.pointerType === "mouse") return; // PC는 HTML5 드래그 사용
    touchDragId.current = id;
    setDragId(id);
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  const onHandlePointerMove = (e: React.PointerEvent) => {
    const src = touchDragId.current;
    if (!src) return;
    e.preventDefault();
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const rowEl = el?.closest("[data-todo-id]") as HTMLElement | null;
    const overId = rowEl?.getAttribute("data-todo-id");
    if (!overId || overId === src) return;
    setItems((prev) => {
      const arr = [...prev];
      const from = arr.findIndex((x) => x.id === src);
      const to = arr.findIndex((x) => x.id === overId);
      if (from < 0 || to < 0 || dimOf(arr[from]) !== dimOf(arr[to])) return prev;
      const [m] = arr.splice(from, 1);
      const at = arr.findIndex((x) => x.id === overId);
      arr.splice(at, 0, m);
      return arr;
    });
  };
  const onHandlePointerUp = () => {
    if (!touchDragId.current) return;
    touchDragId.current = null;
    setDragId(null);
    applyOrder([...itemsRef.current]);
  };

  // 상단 고정 토글.
  const togglePin = (id: string) => {
    const cur = items.find((i) => i.id === id);
    const np = !cur?.pinned;
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, pinned: np } : i)));
    if (dbReady) runDb(setCeoPinned(id, np));
  };

  // '당장실행' 다이제스트 지금 테스트 발송
  const testSend = () => {
    setSendMsg("발송 중…");
    start(async () => {
      const r = await testSendCeoDigest();
      if (!r.ok) { setSendMsg("발송 실패: " + (r.error ?? "")); return; }
      const digestMsg = r.sent ? `당장실행 ${r.count}건` : "당장실행 없음";
      const remMsg = `마감 오늘 ${r.dueToday ?? 0} / 3일후 ${r.due3 ?? 0}`;
      setSendMsg(`✅ 발송 처리 완료 · ${digestMsg} · ${remMsg}`);
    });
  };

  return (
    <>
      <div className="page-head" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>🔒 CEO 투두</h1>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
            최운호 대표 개인 마스터 투두 · 총 {total}개 · 완료 {done} · 남은 {total - done}
            {" · "}
            {dbReady ? <span style={{ color: "var(--ok, #16a34a)" }}>☁ 서버 동기화</span> : <span style={{ color: "var(--warn, #b45309)" }}>⚠ 이 기기에만 저장</span>}
            {pending ? " · 저장 중…" : ""}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={testSend} disabled={pending || !dbReady} title="당장실행 항목을 지금 seohoo628 지메일로 발송">📧 지금 테스트 발송</button>
          <button className="btn" onClick={() => setModal("new")} style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}>+ 추가</button>
        </div>
      </div>

      {sendMsg && <div className="card" style={{ padding: 10, marginBottom: 12, fontSize: 13 }}>{sendMsg}</div>}
      {err && <div className="card" style={{ padding: 10, marginBottom: 12, color: "var(--owner, #b91c1c)" }}>{err}</div>}

      {!dbReady && (
        <div className="card" style={{ borderLeft: "4px solid var(--warn, #f59e0b)", marginBottom: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>기기 간 동기화 준비 — DB 설정 필요</div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
            지금은 이 기기(브라우저)에만 저장돼 폰↔PC 동기화가 안 됩니다. Supabase → SQL Editor에 아래를 실행하면 서버 저장으로 바뀌어 어느 기기에서나 같이 보입니다.
          </p>
          <pre className="pre" style={{ fontSize: 11, overflow: "auto", maxHeight: 160 }}>{SYNC_SQL}</pre>
        </div>
      )}

      {dbReady && migrateN > 0 && (
        <div className="card" style={{ borderLeft: "4px solid var(--accent)", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13 }}>
            이 기기에 저장된 CEO 투두 <b>{migrateN}개</b>가 아직 서버에 없습니다. 올려서 동기화하세요.
          </div>
          <button className="btn" disabled={pending} onClick={migrateThisDevice} style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}>📤 이 기기 데이터 서버로 올리기</button>
        </div>
      )}

      {/* 우선순위 요약 */}
      <div className="card" style={{ padding: 14, marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {PRI_ORDER.map((p) => {
          const cnt = items.filter((i) => i.pri === p && !i.done).length;
          return <span key={p} className={`badge ${PRI_TONE[p] === "muted" ? "" : PRI_TONE[p]}`}>{p} {cnt}</span>;
        })}
      </div>

      {/* 필터 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="검색…" style={{ padding: "8px 11px", border: "1px solid var(--line-2)", borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--ink)", minWidth: 180 }} />
        <div style={{ display: "inline-flex", border: "1px solid var(--line-2)", borderRadius: "var(--radius)", overflow: "hidden" }}>
          {(["pri", "cat"] as const).map((g) => (
            <button key={g} onClick={() => switchGroup(g)} className="btn" style={{ border: "none", borderRadius: 0, padding: "8px 12px", background: groupBy === g ? "var(--accent)" : "var(--surface)", color: groupBy === g ? "var(--accent-ink)" : "var(--ink-2)" }}>
              {g === "pri" ? "우선순위별" : "분류별"}
            </button>
          ))}
        </div>
        <select value={filterVal} onChange={(e) => setFilterVal(e.target.value)} style={{ padding: "8px 11px", border: "1px solid var(--line-2)", borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--ink)" }}>
          {filterOptions.map((c) => <option key={c}>{c}</option>)}
        </select>
        <span style={{ display: "inline-flex", gap: 6, marginLeft: "auto" }}>
          <button className="btn sm" onClick={() => collapseAll(true)}>모두 접기</button>
          <button className="btn sm" onClick={() => collapseAll(false)}>모두 펼치기</button>
        </span>
      </div>

      {/* 그룹별 목록 */}
      {dimValues.map((dv) => {
        const rows = filtered.filter((i) => dimOf(i) === dv).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
        if (rows.length === 0) return null;
        const tone = groupBy === "pri" ? PRI_TONE[dv as Pri] : "";
        const colKey = `${groupBy}:${dv}`;
        const isCol = !!collapsed[colKey];
        return (
          <div key={dv} style={{ marginBottom: 20 }}>
            <button
              onClick={() => toggleCollapse(colKey)}
              className="section-title"
              style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, width: "100%", background: "transparent", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}
            >
              <span style={{ display: "inline-block", transition: "transform .15s", transform: isCol ? "none" : "rotate(90deg)", fontSize: 12, color: "var(--ink-2)" }}>▸</span>
              <span className={`badge ${tone && tone !== "muted" ? tone : ""}`}>{dv}</span>
              <span className="muted" style={{ fontSize: 12 }}>{rows.length}건</span>
            </button>
            {!isCol && (
            <div className="card" style={{ overflow: "hidden" }}>
              {rows.map((i, idx) => (
                <div
                  key={i.id}
                  data-todo-id={i.id}
                  draggable
                  onDragStart={() => setDragId(i.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDropRow(i.id)}
                  onDragEnd={() => setDragId(null)}
                  style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 12px", borderTop: idx === 0 ? "none" : "1px solid var(--line)", opacity: dragId === i.id ? 0.4 : i.done ? 0.5 : 1, background: i.pinned ? "var(--accent-bg)" : undefined }}
                >
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <input type="checkbox" checked={!!i.done} onChange={() => toggle(i.id)} style={{ marginTop: 3, flexShrink: 0, width: 18, height: 18, cursor: "pointer" }} />
                    <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => setModal(i)} title="눌러서 수정">
                      <div style={{ fontSize: 14, lineHeight: 1.55, textDecoration: i.done ? "line-through" : "none", wordBreak: "break-word" }}>{i.text}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                        {i.brand && <span className="badge" style={{ fontSize: 11, background: "#eef2ff", color: "#3730a3" }}>{i.brand}</span>}
                        {i.cat && <span className="badge" style={{ fontSize: 11 }}>{i.cat}</span>}
                        {groupBy === "cat" && <span className={`badge ${PRI_TONE[i.pri] !== "muted" ? PRI_TONE[i.pri] : ""}`} style={{ fontSize: 11 }}>{i.pri}</span>}
                        {i.no != null && <span className="muted" style={{ fontSize: 11 }}>No.{i.no}</span>}
                        {i.dueDate && (() => {
                          const t0 = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }) + "T00:00:00+09:00").getTime();
                          const d = Math.round((new Date(i.dueDate + "T00:00:00+09:00").getTime() - t0) / 86400000);
                          const tone = d < 0 ? "owner" : d <= 3 ? "warn" : "";
                          const label = d < 0 ? `마감 ${-d}일 지남` : d === 0 ? "오늘 마감" : `D-${d}`;
                          return <span className={`badge ${tone}`} style={{ fontSize: 11 }}>📅 {label}</span>;
                        })()}
                        {i.link && <a href={i.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="badge accent" style={{ fontSize: 11, textDecoration: "none" }}>🔗 링크</a>}
                        {(i.files && i.files.length ? i.files : i.fileUrl ? [{ url: i.fileUrl, name: i.fileName ?? "파일" }] : []).map((f, fi, arr) => (
                          <a key={fi} href={f.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="badge accent" style={{ fontSize: 11, textDecoration: "none" }} title={f.name}>📎 {arr.length > 1 ? fi + 1 : "파일"}</a>
                        ))}
                      </div>
                      {i.checklist && i.checklist.length > 0 && (
                        <div onClick={(e) => e.stopPropagation()} style={{ cursor: "default" }}>
                          <ChecklistView items={i.checklist} onToggle={(cid, done) => toggleChecklistItem(i.id, cid, done)} busy={pending} />
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <span
                      title="드래그해서 순서 이동"
                      onPointerDown={(e) => onHandlePointerDown(e, i.id)}
                      onPointerMove={onHandlePointerMove}
                      onPointerUp={onHandlePointerUp}
                      style={{ cursor: "grab", color: "var(--ink-2)", fontSize: 16, marginRight: "auto", userSelect: "none", touchAction: "none", padding: "0 4px" }}
                    >⠿</span>
                    <button className="btn" onClick={() => togglePin(i.id)} title={i.pinned ? "고정 해제" : "상단 고정"} style={{ padding: "3px 8px", fontSize: 13, ...(i.pinned ? { background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" } : {}) }}>📌</button>
                    <button className="btn" onClick={() => moveTop(i.id)} disabled={idx === 0 || pending} title="맨 위로" style={{ padding: "3px 8px", fontSize: 12 }}>⤒</button>
                    <button className="btn" onClick={() => move(i.id, "up")} disabled={idx === 0 || pending} title="위로" style={{ padding: "3px 8px", fontSize: 12 }}>↑</button>
                    <button className="btn" onClick={() => move(i.id, "down")} disabled={idx === rows.length - 1 || pending} title="아래로" style={{ padding: "3px 8px", fontSize: 12 }}>↓</button>
                    <button className="btn" onClick={() => setModal(i)} title="수정" style={{ padding: "3px 9px", fontSize: 12 }}>수정</button>
                    <button className="btn" onClick={() => setHistTodo(i)} title="버전 기록·복원" style={{ padding: "3px 8px", fontSize: 12 }}>🕘</button>
                    <button className="btn" onClick={() => { if (confirm("삭제할까요?")) remove(i.id); }} title="삭제" style={{ padding: "3px 8px", fontSize: 12, color: "var(--owner)" }}>✕</button>
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>
        );
      })}

      {filtered.length === 0 && doneItems.length === 0 && (
        <div className="empty muted" style={{ padding: 40, textAlign: "center" }}>해당 조건의 항목이 없습니다.</div>
      )}
      {filtered.length === 0 && doneItems.length > 0 && (
        <div className="empty muted" style={{ padding: 24, textAlign: "center" }}>진행 중인 항목이 없습니다. 완료 {doneItems.length}건은 아래에 있습니다.</div>
      )}

      {/* ✅ 완료 섹션 — 완료 체크 시 이곳으로 이동 */}
      {doneItems.length > 0 && (
        <div style={{ marginTop: 8, marginBottom: 20 }}>
          <button
            className="btn"
            onClick={() => setShowDone((v) => !v)}
            style={{ width: "100%", justifyContent: "space-between", display: "flex", alignItems: "center", background: "var(--surface)" }}
          >
            <span>✅ 완료 {doneItems.length}건</span>
            <span className="muted" style={{ fontSize: 12 }}>{showDone ? "접기 ▲" : "펼치기 ▼"}</span>
          </button>
          {showDone && (
            <div className="card" style={{ overflow: "hidden", marginTop: 8 }}>
              {doneItems.map((i, idx) => (
                <div key={i.id} style={{ display: "flex", gap: 10, padding: "10px 14px", borderTop: idx === 0 ? "none" : "1px solid var(--line)", alignItems: "flex-start", opacity: 0.6 }}>
                  <input type="checkbox" checked onChange={() => toggle(i.id)} style={{ marginTop: 3, flexShrink: 0, width: 17, height: 17, cursor: "pointer" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, lineHeight: 1.5, textDecoration: "line-through" }}>{i.text}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                      {i.brand && <span className="badge" style={{ fontSize: 11, background: "#eef2ff", color: "#3730a3" }}>{i.brand}</span>}
                      {i.cat && <span className="badge" style={{ fontSize: 11 }}>{i.cat}</span>}
                      <span className={`badge ${PRI_TONE[i.pri] !== "muted" ? PRI_TONE[i.pri] : ""}`} style={{ fontSize: 11 }}>{i.pri}</span>
                    </div>
                  </div>
                  <button className="btn" onClick={() => toggle(i.id)} title="완료 취소(되돌리기)" style={{ padding: "3px 9px", fontSize: 12, flexShrink: 0 }}>↩ 되돌리기</button>
                  <button className="btn" onClick={() => { if (confirm("삭제할까요?")) remove(i.id); }} title="삭제" style={{ padding: "3px 8px", fontSize: 12, color: "var(--owner)", flexShrink: 0 }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {modal && (
        <TodoModal
          initial={modal === "new" ? null : modal}
          onClose={() => setModal(null)}
          onSave={(t) => { upsert(t); setModal(null); }}
        />
      )}

      {histTodo && (
        <RevisionHistoryModal
          entity="ceo_todos"
          recordId={histTodo.id}
          title={histTodo.text}
          preview={(s) => `[${s?.pri ?? ""}] ${s?.text ?? ""}`}
          onClose={() => setHistTodo(null)}
        />
      )}
    </>
  );
}

const BRANDS = ["리앤밤", "뷰티밤", "주당의비결", "슈퍼릴라", "신미집", "대운목장", "청담 오리닭", "엣지라인"];
const ALL_BRAND = "브랜드전체";

function TodoModal({ initial, onClose, onSave }: { initial: CeoTodo | null; onClose: () => void; onSave: (t: CeoTodo) => void }) {
  const [text, setText] = useState(initial?.text ?? "");
  const [pri, setPri] = useState<Pri>(initial?.pri ?? "최우선");
  const [cat, setCat] = useState<string>(initial?.cat ?? NO_CAT);
  const [brand, setBrand] = useState<string>(initial?.brand ?? "");
  const [link, setLink] = useState(initial?.link ?? "");
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [files, setFiles] = useState<{ url: string; name: string }[]>(
    initial?.files && initial.files.length ? initial.files : initial?.fileUrl ? [{ url: initial.fileUrl, name: initial.fileName ?? "파일" }] : []
  );
  const [checklist, setChecklist] = useState<ChecklistItem[]>(initial?.checklist ?? []);
  const [uploading, setUploading] = useState(false);
  const [upErr, setUpErr] = useState<string | null>(null);

  const field: React.CSSProperties = { padding: "8px 10px", border: "1px solid var(--line-2)", borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--ink)" };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    if (!list.length) return;
    setUploading(true);
    setUpErr(null);
    const added: { url: string; name: string }[] = [];
    for (const f of list) {
      const r = await uploadAttachment(f, "ceo-todo-files");
      if (!r.ok) { setUpErr(r.error ?? "업로드 실패"); break; }
      added.push({ url: r.url ?? "", name: r.name ?? "파일" });
    }
    setFiles((prev) => [...prev, ...added]);
    setUploading(false);
    e.target.value = "";
  };

  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, background: "rgba(16,20,24,0.5)", display: "grid", placeItems: "center", zIndex: 100, padding: 20 }}>
      <div className="card" onMouseDown={(e) => e.stopPropagation()} style={{ padding: 20, width: "100%", maxWidth: 460 }}>
        <h3 style={{ marginTop: 0 }}>{initial ? "투두 수정" : "투두 추가"}</h3>
        <label style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginBottom: 4, fontWeight: 600 }}>할 일</label>
        <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="할 일 내용" rows={3} style={{ width: "100%", padding: 10, border: "1px solid var(--line-2)", borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--ink)", resize: "vertical", marginBottom: 12 }} />
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginBottom: 4, fontWeight: 600 }}>우선순위</label>
            <select value={pri} onChange={(e) => setPri(e.target.value as Pri)} style={{ ...field, width: "100%" }}>
              {PRI_ORDER.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginBottom: 4, fontWeight: 600 }}>분류</label>
            <select value={cat} onChange={(e) => setCat(e.target.value)} style={{ ...field, width: "100%" }}>
              <option value={NO_CAT}>{NO_CAT}</option>
              {CATS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginBottom: 4, fontWeight: 600 }}>브랜드</label>
            <select value={brand} onChange={(e) => setBrand(e.target.value)} style={{ ...field, width: "100%" }}>
              <option value="">{ALL_BRAND}</option>
              {BRANDS.map((b) => <option key={b}>{b}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginBottom: 4, fontWeight: 600 }}>마감일 (선택)</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ ...field, width: "100%" }} />
          </div>
        </div>

        <label style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginBottom: 4, fontWeight: 600 }}>참고 링크 (선택)</label>
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="시트·문서·게시물 URL" style={{ ...field, width: "100%", marginBottom: 12 }} />

        <label style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginBottom: 4, fontWeight: 600 }}>파일 첨부 (여러 개 가능)</label>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
          <input type="file" multiple onChange={onFile} disabled={uploading} style={{ fontSize: 13 }} />
          {uploading && <span className="muted" style={{ fontSize: 12 }}>업로드 중…</span>}
        </div>
        {files.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
            {files.map((f) => (
              <span key={f.url} className="badge" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                📎 {f.name}
                <button type="button" onClick={() => setFiles((prev) => prev.filter((x) => x.url !== f.url))} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--owner)" }}>✕</button>
              </span>
            ))}
          </div>
        )}
        {upErr && <div style={{ color: "var(--owner)", fontSize: 12, marginBottom: 6 }}>{upErr}</div>}

        <label style={{ display: "block", fontSize: 12, color: "var(--ink-2)", margin: "6px 0 4px", fontWeight: 600 }}>하위 체크리스트</label>
        <ChecklistEditor value={checklist} onChange={setChecklist} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <button className="btn" onClick={onClose}>취소</button>
          <button
            className="btn"
            disabled={!text.trim() || uploading}
            onClick={() =>
              onSave({
                id: initial?.id ?? "u_" + Math.random().toString(36).slice(2, 9),
                no: initial?.no,
                text: text.trim(),
                pri,
                cat: cat === NO_CAT ? undefined : cat,
                brand: brand || undefined,
                done: initial?.done,
                src: initial?.src,
                link: link.trim() || undefined,
                files: files.length ? files : undefined,
                fileUrl: undefined,
                fileName: undefined,
                dueDate: dueDate || undefined,
                sortOrder: initial?.sortOrder,
                pinned: initial?.pinned,
                checklist: checklist.length ? checklist : undefined,
              })
            }
            style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}
          >
            {initial ? "저장" : "추가"}
          </button>
        </div>
      </div>
    </div>
  );
}
