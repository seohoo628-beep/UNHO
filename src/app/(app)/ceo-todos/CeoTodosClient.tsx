"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { CEO_TODOS, PRI_ORDER, PRI_TONE, CATS, NO_CAT, type CeoTodo, type Pri } from "./data";
import { uploadAttachment } from "@/lib/uploadAttachment";
import { upsertCeoTodo, toggleCeoTodo, deleteCeoTodo, importCeoTodos } from "./actions";

const PASSWORD = "010100";
const UNLOCK_KEY = "ceo-unlock-v1";
const DATA_KEY = "ceo-todos-v1";

const SYNC_SQL = `create table if not exists public.ceo_todos (
  id text primary key, no int, cat text, text text not null,
  pri text not null default '최우선', done boolean not null default false,
  link text, files jsonb not null default '[]'::jsonb, src text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.ceo_todos enable row level security;
drop policy if exists ceo_todos_owner on public.ceo_todos;
create policy ceo_todos_owner on public.ceo_todos for all to authenticated
  using (public.current_app_role() = 'owner') with check (public.current_app_role() = 'owner');`;

export default function CeoTodosClient({ dbReady, initial }: { dbReady: boolean; initial: CeoTodo[] }) {
  const [unlocked, setUnlocked] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(UNLOCK_KEY) === "1") setUnlocked(true);
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  if (!ready) return null;
  if (!unlocked) return <Gate onUnlock={() => setUnlocked(true)} />;
  return <TodoBoard onLock={() => setUnlocked(false)} dbReady={dbReady} initial={initial} />;
}

// ── 비밀번호 게이트 ───────────────────────────────
function Gate({ onUnlock }: { onUnlock: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pw === PASSWORD) {
      try {
        sessionStorage.setItem(UNLOCK_KEY, "1");
      } catch {
        /* ignore */
      }
      onUnlock();
    } else {
      setErr(true);
      setPw("");
    }
  };
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "60vh" }}>
      <form onSubmit={submit} className="card" style={{ padding: 28, width: "100%", maxWidth: 360, textAlign: "center" }}>
        <div style={{ fontSize: 34 }}>🔒</div>
        <h2 style={{ margin: "10px 0 4px" }}>CEO 투두</h2>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>비밀번호를 입력하세요</p>
        <input
          autoFocus
          type="password"
          inputMode="numeric"
          value={pw}
          onChange={(e) => { setPw(e.target.value); setErr(false); }}
          placeholder="● ● ● ● ● ●"
          style={{ width: "100%", padding: "11px 12px", fontSize: 18, textAlign: "center", letterSpacing: 4, border: `1px solid ${err ? "var(--owner)" : "var(--line-2)"}`, borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--ink)", marginBottom: 10 }}
        />
        {err && <div style={{ color: "var(--owner)", fontSize: 12.5, marginBottom: 10 }}>비밀번호가 올바르지 않습니다.</div>}
        <button type="submit" className="btn" style={{ width: "100%", background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}>잠금 해제</button>
      </form>
    </div>
  );
}

// ── 투두 보드 ─────────────────────────────────────
function TodoBoard({ onLock, dbReady, initial }: { onLock: () => void; dbReady: boolean; initial: CeoTodo[] }) {
  const [items, setItems] = useState<CeoTodo[]>(dbReady ? initial : CEO_TODOS);
  const [hydrated, setHydrated] = useState(dbReady);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [migrateN, setMigrateN] = useState(0);
  const [q, setQ] = useState("");
  const [groupBy, setGroupBy] = useState<"pri" | "cat">("pri");
  const [filterVal, setFilterVal] = useState<string>("전체");
  const [showDone, setShowDone] = useState(false);
  const [modal, setModal] = useState<CeoTodo | "new" | null>(null);

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
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="btn" onClick={() => setModal("new")} style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}>+ 추가</button>
          <button className="btn" onClick={onLock} title="다시 잠그기">🔒 잠금</button>
        </div>
      </div>

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
      </div>

      {/* 그룹별 목록 */}
      {dimValues.map((dv) => {
        const rows = filtered.filter((i) => dimOf(i) === dv);
        if (rows.length === 0) return null;
        const tone = groupBy === "pri" ? PRI_TONE[dv as Pri] : "";
        return (
          <div key={dv} style={{ marginBottom: 20 }}>
            <div className="section-title" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span className={`badge ${tone && tone !== "muted" ? tone : ""}`}>{dv}</span>
              <span className="muted" style={{ fontSize: 12 }}>{rows.length}건</span>
            </div>
            <div className="card" style={{ overflow: "hidden" }}>
              {rows.map((i, idx) => (
                <div key={i.id} style={{ display: "flex", gap: 10, padding: "10px 14px", borderTop: idx === 0 ? "none" : "1px solid var(--line)", alignItems: "flex-start", opacity: i.done ? 0.5 : 1 }}>
                  <input type="checkbox" checked={!!i.done} onChange={() => toggle(i.id)} style={{ marginTop: 3, flexShrink: 0, width: 17, height: 17, cursor: "pointer" }} />
                  <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => setModal(i)} title="눌러서 수정">
                    <div style={{ fontSize: 14, lineHeight: 1.5, textDecoration: i.done ? "line-through" : "none" }}>{i.text}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                      {i.cat && <span className="badge" style={{ fontSize: 11 }}>{i.cat}</span>}
                      {groupBy === "cat" && <span className={`badge ${PRI_TONE[i.pri] !== "muted" ? PRI_TONE[i.pri] : ""}`} style={{ fontSize: 11 }}>{i.pri}</span>}
                      {i.no != null && <span className="muted" style={{ fontSize: 11 }}>No.{i.no}</span>}
                      {i.link && <a href={i.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="badge accent" style={{ fontSize: 11, textDecoration: "none" }}>🔗 링크</a>}
                      {(i.files && i.files.length ? i.files : i.fileUrl ? [{ url: i.fileUrl, name: i.fileName ?? "파일" }] : []).map((f, fi, arr) => (
                        <a key={fi} href={f.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="badge accent" style={{ fontSize: 11, textDecoration: "none" }} title={f.name}>📎 {arr.length > 1 ? fi + 1 : "파일"}</a>
                      ))}
                    </div>
                  </div>
                  <button className="btn" onClick={() => setModal(i)} title="수정" style={{ padding: "3px 9px", fontSize: 12, flexShrink: 0 }}>수정</button>
                  <button className="btn" onClick={() => { if (confirm("삭제할까요?")) remove(i.id); }} title="삭제" style={{ padding: "3px 8px", fontSize: 12, color: "var(--owner)", flexShrink: 0 }}>✕</button>
                </div>
              ))}
            </div>
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
    </>
  );
}

function TodoModal({ initial, onClose, onSave }: { initial: CeoTodo | null; onClose: () => void; onSave: (t: CeoTodo) => void }) {
  const [text, setText] = useState(initial?.text ?? "");
  const [pri, setPri] = useState<Pri>(initial?.pri ?? "최우선");
  const [cat, setCat] = useState<string>(initial?.cat ?? NO_CAT);
  const [link, setLink] = useState(initial?.link ?? "");
  const [files, setFiles] = useState<{ url: string; name: string }[]>(
    initial?.files && initial.files.length ? initial.files : initial?.fileUrl ? [{ url: initial.fileUrl, name: initial.fileName ?? "파일" }] : []
  );
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
                done: initial?.done,
                src: initial?.src,
                link: link.trim() || undefined,
                files: files.length ? files : undefined,
                fileUrl: undefined,
                fileName: undefined,
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
