"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export type ChecklistItem = { text: string; done: boolean };

// 상위 업무의 하위 체크리스트. 저장 함수는 부모가 바인딩해 넘긴다(todos / launch_checklist 공용).
export default function SubChecklist({
  initial,
  onSave,
  canEdit,
  compact,
}: {
  initial: ChecklistItem[] | null | undefined;
  onSave: (items: ChecklistItem[]) => Promise<{ ok: boolean; error?: string }>;
  canEdit: boolean;
  compact?: boolean;
}) {
  const [items, setItems] = useState<ChecklistItem[]>(Array.isArray(initial) ? initial : []);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  const done = items.filter((i) => i.done).length;
  const total = items.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const persist = (next: ChecklistItem[]) => {
    setItems(next);
    start(async () => { await onSave(next); router.refresh(); });
  };
  const toggle = (i: number) => persist(items.map((it, j) => (j === i ? { ...it, done: !it.done } : it)));
  const remove = (i: number) => persist(items.filter((_, j) => j !== i));
  const add = () => {
    const t = text.trim();
    if (!t) return;
    persist([...items, { text: t, done: false }]);
    setText("");
  };

  return (
    <div style={{ marginTop: 6 }}>
      <button
        className="btn sm"
        onClick={() => setOpen((v) => !v)}
        style={{ fontWeight: 700, fontSize: compact ? 11.5 : 12.5 }}
        title="하위 체크리스트"
      >
        ☑ 체크리스트 {total > 0 ? <span style={{ color: pct === 100 ? "#4ade80" : "var(--ink-2)" }}>{done}/{total}</span> : <span className="muted">추가</span>}
      </button>

      {open && (
        <div className="card" style={{ padding: 10, marginTop: 6, background: "rgba(148,163,184,.05)" }}>
          {total > 0 && (
            <div style={{ height: 5, borderRadius: 999, background: "rgba(148,163,184,.18)", overflow: "hidden", marginBottom: 8 }}>
              <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg,#6366f1,#818cf8)" }} />
            </div>
          )}
          <div style={{ display: "grid", gap: 4 }}>
            {items.map((it, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                <input type="checkbox" checked={it.done} disabled={!canEdit || pending} onChange={() => toggle(i)} style={{ accentColor: "var(--accent, #6366f1)" }} />
                <span style={{ flex: 1, textDecoration: it.done ? "line-through" : "none", opacity: it.done ? 0.6 : 1 }}>{it.text}</span>
                {canEdit && <button className="btn sm" disabled={pending} onClick={() => remove(i)} title="삭제" style={{ padding: "1px 7px" }}>✕</button>}
              </div>
            ))}
            {total === 0 && <div className="muted" style={{ fontSize: 12 }}>하위 항목이 없습니다.</div>}
          </div>
          {canEdit && (
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
                placeholder="하위 항목 추가 후 Enter"
                style={{ flex: 1, padding: "6px 9px", border: "1px solid var(--line-2)", borderRadius: 6, background: "var(--surface)", color: "var(--ink)", fontSize: 12.5 }}
              />
              <button className="btn sm" disabled={pending || !text.trim()} onClick={add}>추가</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
