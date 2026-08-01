"use client";

import { useEffect, useMemo, useState } from "react";
import { CEO_TODOS, PRI_ORDER, PRI_TONE, type CeoTodo, type Pri } from "./data";

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
  const [cat, setCat] = useState<string>("전체");
  const [hideDone, setHideDone] = useState(false);
  const [adding, setAdding] = useState(false);

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

  const cats = useMemo(() => {
    const s = new Set<string>();
    items.forEach((i) => i.cat && s.add(i.cat));
    return ["전체", ...Array.from(s)];
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (cat !== "전체" && i.cat !== cat) return false;
      if (hideDone && i.done) return false;
      if (q && !i.text.toLowerCase().includes(q.toLowerCase()) && !(i.cat ?? "").includes(q)) return false;
      return true;
    });
  }, [items, cat, hideDone, q]);

  const total = items.length;
  const done = items.filter((i) => i.done).length;

  const toggle = (id: string) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  const remove = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

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
          <button className="btn" onClick={() => setAdding(true)}>+ 추가</button>
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
        <select
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          style={{ padding: "8px 11px", border: "1px solid var(--line-2)", borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--ink)" }}
        >
          {cats.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
          완료 숨기기
        </label>
      </div>

      {/* 우선순위별 그룹 */}
      {PRI_ORDER.map((p) => {
        const rows = filtered.filter((i) => i.pri === p);
        if (rows.length === 0) return null;
        return (
          <div key={p} style={{ marginBottom: 20 }}>
            <div className="section-title" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span className={`badge ${PRI_TONE[p] === "muted" ? "" : PRI_TONE[p]}`}>{p}</span>
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
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, lineHeight: 1.5, textDecoration: i.done ? "line-through" : "none" }}>
                      {i.text}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                      {i.cat && <span className="badge" style={{ fontSize: 11 }}>{i.cat}</span>}
                      {i.no != null && <span className="muted" style={{ fontSize: 11 }}>No.{i.no}</span>}
                    </div>
                  </div>
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

      {adding && (
        <AddModal
          onClose={() => setAdding(false)}
          onAdd={(t) => {
            setItems((prev) => [t, ...prev]);
            setAdding(false);
          }}
        />
      )}
    </>
  );
}

function AddModal({ onClose, onAdd }: { onClose: () => void; onAdd: (t: CeoTodo) => void }) {
  const [text, setText] = useState("");
  const [pri, setPri] = useState<Pri>("최우선");
  const [cat, setCat] = useState("");

  return (
    <div
      onMouseDown={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(16,20,24,0.5)", display: "grid", placeItems: "center", zIndex: 100, padding: 20 }}
    >
      <div className="card" onMouseDown={(e) => e.stopPropagation()} style={{ padding: 20, width: "100%", maxWidth: 460 }}>
        <h3 style={{ marginTop: 0 }}>투두 추가</h3>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="할 일"
          rows={3}
          style={{ width: "100%", padding: 10, border: "1px solid var(--line-2)", borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--ink)", resize: "vertical", marginBottom: 10 }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <select value={pri} onChange={(e) => setPri(e.target.value as Pri)} style={{ padding: "8px 10px", border: "1px solid var(--line-2)", borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--ink)" }}>
            {PRI_ORDER.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <input value={cat} onChange={(e) => setCat(e.target.value)} placeholder="분류(선택)" style={{ flex: 1, padding: "8px 10px", border: "1px solid var(--line-2)", borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--ink)" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={onClose}>취소</button>
          <button
            className="btn"
            disabled={!text.trim()}
            onClick={() => onAdd({ id: "u_" + Math.random().toString(36).slice(2, 9), text: text.trim(), pri, cat: cat.trim() || undefined })}
            style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}
          >
            추가
          </button>
        </div>
      </div>
    </div>
  );
}
