"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createReminder, updateReminder, toggleReminder, deleteReminder } from "./actions";

export type Reminder = { id: string; text: string; cat: string; done: boolean };

const CATS = ["제품·브랜드", "개인·건강", "F&B 운영", "투자·자금", "유통·영업", "원칙·전략", "마케팅·콘텐츠", "인맥·네트워크", "의료·병원", "해외사업"];
const NO_CAT = "미분류";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 11px", border: "1px solid var(--line-2)",
  borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--ink)",
};

function AddForm() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [cat, setCat] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const submit = () => {
    setErr(null);
    start(async () => {
      const r = await createReminder(text, cat);
      if (!r.ok) return setErr(r.error ?? "저장 실패");
      setText(""); setCat(""); setOpen(false); router.refresh();
    });
  };

  if (!open) return <button className="btn primary" onClick={() => setOpen(true)}>+ 리마인드 추가</button>;
  return (
    <div className="card" style={{ padding: 14, marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="기억할 내용" style={{ ...inputStyle, flex: 1, minWidth: 240, resize: "vertical" }} />
        <select value={cat} onChange={(e) => setCat(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
          <option value="">(분류 없음)</option>
          {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      {err && <div style={{ color: "var(--owner)", fontSize: 12, marginTop: 8 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button className="btn primary" onClick={submit} disabled={pending || !text.trim()}>{pending ? "저장 중…" : "저장"}</button>
        <button className="btn" onClick={() => { setOpen(false); setText(""); setCat(""); }} disabled={pending}>취소</button>
      </div>
    </div>
  );
}

function Row({ r }: { r: Reminder }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(r.text);
  const [cat, setCat] = useState(r.cat);
  const [pending, start] = useTransition();
  const router = useRouter();

  const save = () => start(async () => { const res = await updateReminder(r.id, text, cat); if (res.ok) { setEditing(false); router.refresh(); } });
  const toggle = () => start(async () => { await toggleReminder(r.id, !r.done); router.refresh(); });
  const remove = () => { if (!confirm("삭제할까요?")) return; start(async () => { await deleteReminder(r.id); router.refresh(); }); };

  if (editing) {
    return (
      <div className="card" style={{ padding: 12 }}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <select value={cat} onChange={(e) => setCat(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
            <option value="">(분류 없음)</option>
            {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button className="btn primary" onClick={save} disabled={pending || !text.trim()}>저장</button>
          <button className="btn" onClick={() => { setEditing(false); setText(r.text); setCat(r.cat); }}>취소</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 12, display: "flex", alignItems: "flex-start", gap: 10, opacity: r.done ? 0.55 : 1 }}>
      <input type="checkbox" checked={r.done} onChange={toggle} disabled={pending} style={{ marginTop: 3, width: 18, height: 18, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {r.cat && <span className="badge" style={{ background: "var(--line)", color: "var(--ink-2)", marginRight: 6 }}>{r.cat}</span>}
        <span style={{ fontSize: 14, whiteSpace: "pre-wrap", textDecoration: r.done ? "line-through" : "none" }}>{r.text}</span>
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button className="btn sm" onClick={() => setEditing(true)}>수정</button>
        <button className="btn sm" onClick={remove} disabled={pending} style={{ color: "var(--owner)" }}>삭제</button>
      </div>
    </div>
  );
}

export default function RemindersClient({ items, dbReady }: { items: Reminder[]; dbReady: boolean }) {
  const [cat, setCat] = useState("전체");

  const cats = useMemo(() => {
    const set = new Set<string>();
    items.forEach((r) => set.add(r.cat || NO_CAT));
    return ["전체", ...CATS.filter((c) => set.has(c)), ...(set.has(NO_CAT) ? [NO_CAT] : [])];
  }, [items]);

  const filtered = useMemo(() => items.filter((r) => cat === "전체" || (r.cat || NO_CAT) === cat), [items, cat]);
  const remaining = items.filter((r) => !r.done).length;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>🔔 리마인드</h1>
          <p>대표님만 보는 상시 리마인드 · 남은 항목 {remaining}개</p>
        </div>
        <AddForm />
      </div>

      {!dbReady && (
        <div className="card" style={{ padding: 14, marginBottom: 14 }}>
          <div className="empty">테이블이 아직 준비되지 않았습니다. 마이그레이션(0069_reminders)을 적용해 주세요.</div>
        </div>
      )}

      {cats.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {cats.map((c) => (
            <button key={c} className={`btn sm${cat === c ? " primary" : ""}`} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="card"><div className="empty">{dbReady ? "리마인드가 없습니다. “+ 리마인드 추가”로 시작하세요." : ""}</div></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((r) => <Row key={r.id} r={r} />)}
        </div>
      )}
    </div>
  );
}
