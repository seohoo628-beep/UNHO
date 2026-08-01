"use client";

import { useEffect, useMemo, useState } from "react";
import { CEO_TODOS, PRI_ORDER, PRI_TONE, CATS, NO_CAT, type CeoTodo, type Pri } from "./data";

const PASSWORD = "010100";
const UNLOCK_KEY = "ceo-unlock-v1";
const DATA_KEY = "ceo-todos-v1";

export default function CeoTodosPage() {
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
  return <TodoBoard onLock={() => setUnlocked(false)} />;
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
      <form
        onSubmit={submit}
        className="card"
        style={{ padding: 28, width: "100%", maxWidth: 360, textAlign: "center" }}
      >
        <div style={{ fontSize: 34 }}>🔒</div>
        <h2 style={{ margin: "10px 0 4px" }}>CEO 투두</h2>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          비밀번호를 입력하세요
        </p>
        <input
          autoFocus
          type="password"
          inputMode="numeric"
          value={pw}
          onChange={(e) => {
            setPw(e.target.value);
            setErr(false);
          }}
          placeholder="● ● ● ● ● ●"
          style={{
            width: "100%",
            padding: "11px 12px",
            fontSize: 18,
            textAlign: "center",
            letterSpacing: 4,
            border: `1px solid ${err ? "var(--owner)" : "var(--line-2)"}`,
            borderRadius: "var(--radius)",
            background: "var(--surface)",
            color: "var(--ink)",
            marginBottom: 10,
          }}
        />
        {err && (
          <div style={{ color: "var(--owner)", fontSize: 12.5, marginBottom: 10 }}>
            비밀번호가 올바르지 않습니다.
          </div>
        )}
        <button type="submit" className="btn" style={{ width: "100%", background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}>
          잠금 해제
        </button>
      </form>
    </div>
  );
}

// ── 투두 보드 ─────────────────────────────────────
function TodoBoard({ onLock }: { onLock: () => void }) {
  const [items, setItems] = useState<CeoTodo[]>(CEO_TODOS);
  const [hydrated, setHydrated] = useState(false);
  const [q, setQ] = useState("");
  const [groupBy, setGroupBy] = useState<"pri" | "cat">("pri");
  const [filterVal, setFilterVal] = useState<string>("전체");
  const [hideDone, setHideDone] = useState(false);
  const [modal, setModal] = useState<CeoTodo | "new" | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DATA_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(DATA_KEY, JSON.stringify(items));
    } catch {
      /* ignore */
    }
  }, [items, hydrated]);

  // 그룹 기준(우선순위/분류)에 따른 값 목록
  const dimValues = groupBy === "pri" ? PRI_ORDER : [...CATS, NO_CAT];
  const dimOf = (i: CeoTodo): string => (groupBy === "pri" ? i.pri : i.cat || NO_CAT);
  const filterOptions = ["전체", ...dimValues];

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (filterVal !== "전체" && dimOf(i) !== filterVal) return false;
      if (hideDone && i.done) return false;
      if (q && !i.text.toLowerCase().includes(q.toLowerCase()) && !(i.cat ?? "").includes(q)) return false;
      return true;
    });
  }, [items, filterVal, hideDone, q, groupBy]);

  const total = items.length;
  const done = items.filter((i) => i.done).length;

  const toggle = (id: string) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  const remove = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));
  const upsert = (t: CeoTodo) =>
    setItems((prev) => {
      const idx = prev.findIndex((x) => x.id === t.id);
      if (idx >= 0) {
        const cp = [...prev];
        cp[idx] = t;
        return cp;
      }
      return [t, ...prev];
    });

  const switchGroup = (g: "pri" | "cat") => {
    setGroupBy(g);
    setFilterVal("전체");
  };

  return (
    <>
      <div className="page-head" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>🔒 CEO 투두</h1>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
            최운호 대표 개인 마스터 투두 · 총 {total}개 · 완료 {done} · 남은 {total - done}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="btn" onClick={() => setModal("new")} style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}>+ 추가</button>
          <button className="btn" onClick={onLock} title="다시 잠그기">🔒 잠금</button>
        </div>
      </div>

      {/* 우선순위 요약 */}
      <div className="card" style={{ padding: 14, marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {PRI_ORDER.map((p) => {
          const cnt = items.filter((i) => i.pri === p && !i.done).length;
          return (
            <span key={p} className={`badge ${PRI_TONE[p] === "muted" ? "" : PRI_TONE[p]}`}>
              {p} {cnt}
            </span>
          );
        })}
      </div>

      {/* 필터 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="검색…"
          style={{ padding: "8px 11px", border: "1px solid var(--line-2)", borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--ink)", minWidth: 180 }}
        />
        {/* 분류 기준 전환: 우선순위 / 카테고리 */}
        <div style={{ display: "inline-flex", border: "1px solid var(--line-2)", borderRadius: "var(--radius)", overflow: "hidden" }}>
          {(["pri", "cat"] as const).map((g) => (
            <button
              key={g}
              onClick={() => switchGroup(g)}
              className="btn"
              style={{
                border: "none",
                borderRadius: 0,
                padding: "8px 12px",
                background: groupBy === g ? "var(--accent)" : "var(--surface)",
                color: groupBy === g ? "var(--accent-ink)" : "var(--ink-2)",
              }}
            >
              {g === "pri" ? "우선순위별" : "분류별"}
            </button>
          ))}
        </div>
        <select
          value={filterVal}
          onChange={(e) => setFilterVal(e.target.value)}
          style={{ padding: "8px 11px", border: "1px solid var(--line-2)", borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--ink)" }}
        >
          {filterOptions.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
          완료 숨기기
        </label>
      </div>

      {/* 그룹(우선순위/분류)별 목록 */}
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
                <div
                  key={i.id}
                  style={{
                    display: "flex",
                    gap: 10,
                    padding: "10px 14px",
                    borderTop: idx === 0 ? "none" : "1px solid var(--line)",
                    alignItems: "flex-start",
                    opacity: i.done ? 0.5 : 1,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!i.done}
                    onChange={() => toggle(i.id)}
                    style={{ marginTop: 3, flexShrink: 0, width: 17, height: 17, cursor: "pointer" }}
                  />
                  <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => setModal(i)} title="눌러서 수정">
                    <div style={{ fontSize: 14, lineHeight: 1.5, textDecoration: i.done ? "line-through" : "none" }}>
                      {i.text}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                      {i.cat && <span className="badge" style={{ fontSize: 11 }}>{i.cat}</span>}
                      {groupBy === "cat" && (
                        <span className={`badge ${PRI_TONE[i.pri] !== "muted" ? PRI_TONE[i.pri] : ""}`} style={{ fontSize: 11 }}>{i.pri}</span>
                      )}
                      {i.no != null && <span className="muted" style={{ fontSize: 11 }}>No.{i.no}</span>}
                    </div>
                  </div>
                  <button className="btn" onClick={() => setModal(i)} title="수정" style={{ padding: "3px 9px", fontSize: 12, flexShrink: 0 }}>수정</button>
                  <button
                    className="btn"
                    onClick={() => remove(i.id)}
                    title="삭제"
                    style={{ padding: "3px 8px", fontSize: 12, color: "var(--owner)", flexShrink: 0 }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {filtered.length === 0 && <div className="empty muted" style={{ padding: 40, textAlign: "center" }}>해당 조건의 항목이 없습니다.</div>}

      {modal && (
        <TodoModal
          initial={modal === "new" ? null : modal}
          onClose={() => setModal(null)}
          onSave={(t) => {
            upsert(t);
            setModal(null);
          }}
        />
      )}
    </>
  );
}

function TodoModal({ initial, onClose, onSave }: { initial: CeoTodo | null; onClose: () => void; onSave: (t: CeoTodo) => void }) {
  const [text, setText] = useState(initial?.text ?? "");
  const [pri, setPri] = useState<Pri>(initial?.pri ?? "최우선");
  const [cat, setCat] = useState<string>(initial?.cat ?? NO_CAT);

  const field: React.CSSProperties = { padding: "8px 10px", border: "1px solid var(--line-2)", borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--ink)" };

  return (
    <div
      onMouseDown={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(16,20,24,0.5)", display: "grid", placeItems: "center", zIndex: 100, padding: 20 }}
    >
      <div className="card" onMouseDown={(e) => e.stopPropagation()} style={{ padding: 20, width: "100%", maxWidth: 460 }}>
        <h3 style={{ marginTop: 0 }}>{initial ? "투두 수정" : "투두 추가"}</h3>
        <label style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginBottom: 4, fontWeight: 600 }}>할 일</label>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="할 일 내용"
          rows={3}
          style={{ width: "100%", padding: 10, border: "1px solid var(--line-2)", borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--ink)", resize: "vertical", marginBottom: 12 }}
        />
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginBottom: 4, fontWeight: 600 }}>우선순위</label>
            <select value={pri} onChange={(e) => setPri(e.target.value as Pri)} style={{ ...field, width: "100%" }}>
              {PRI_ORDER.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginBottom: 4, fontWeight: 600 }}>분류</label>
            <select value={cat} onChange={(e) => setCat(e.target.value)} style={{ ...field, width: "100%" }}>
              <option value={NO_CAT}>{NO_CAT}</option>
              {CATS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={onClose}>취소</button>
          <button
            className="btn"
            disabled={!text.trim()}
            onClick={() =>
              onSave({
                id: initial?.id ?? "u_" + Math.random().toString(36).slice(2, 9),
                no: initial?.no,
                text: text.trim(),
                pri,
                cat: cat === NO_CAT ? undefined : cat,
                done: initial?.done,
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
