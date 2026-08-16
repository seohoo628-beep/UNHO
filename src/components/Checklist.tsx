"use client";

import { useState } from "react";

export type ChecklistItem = { id: string; text: string; done: boolean };

const genId = () => Math.random().toString(36).slice(2, 9) + Math.random().toString(36).slice(2, 5);

export function normalizeChecklist(raw: unknown): ChecklistItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r: any) => ({ id: String(r?.id ?? genId()), text: String(r?.text ?? "").trim(), done: !!r?.done }))
    .filter((r) => r.text);
}

export function checklistProgress(items: ChecklistItem[]): { done: number; total: number } {
  return { done: items.filter((i) => i.done).length, total: items.length };
}

// 편집용: 항목 추가/삭제/이름변경/체크. onChange로 전체 배열을 넘긴다.
export function ChecklistEditor({ value, onChange }: { value: ChecklistItem[]; onChange: (v: ChecklistItem[]) => void }) {
  const [text, setText] = useState("");
  const add = () => {
    const t = text.trim();
    if (!t) return;
    onChange([...value, { id: genId(), text: t, done: false }]);
    setText("");
  };
  const upd = (id: string, patch: Partial<ChecklistItem>) => onChange(value.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const del = (id: string) => onChange(value.filter((i) => i.id !== id));

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {value.map((i) => (
          <div key={i.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={i.done} onChange={() => upd(i.id, { done: !i.done })} style={{ flexShrink: 0 }} />
            <input
              value={i.text}
              onChange={(e) => upd(i.id, { text: e.target.value })}
              style={{ flex: 1, minWidth: 0, padding: "5px 8px", border: "1px solid var(--line-2)", borderRadius: 6, background: "var(--surface)", color: "var(--ink)", fontSize: 13, textDecoration: i.done ? "line-through" : "none" }}
            />
            <button type="button" className="btn sm" onClick={() => del(i.id)} style={{ color: "var(--owner)", flexShrink: 0 }}>×</button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="+ 하위 체크리스트 추가 후 Enter"
          style={{ flex: 1, minWidth: 0, padding: "6px 9px", border: "1px solid var(--line-2)", borderRadius: 6, background: "var(--surface)", color: "var(--ink)", fontSize: 13 }}
        />
        <button type="button" className="btn sm" onClick={add} disabled={!text.trim()}>추가</button>
      </div>
    </div>
  );
}

// 카드 표시용: 진행바 + 접기/펴기, 각 항목 체크 즉시 저장(onToggle).
export function ChecklistView({ items, onToggle, busy }: { items: ChecklistItem[]; onToggle: (id: string, done: boolean) => void; busy?: boolean }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  const { done, total } = checklistProgress(items);
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div style={{ marginTop: 6 }}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: 0, width: "100%", textAlign: "left", color: "var(--ink)" }}>
        <span style={{ fontSize: 11, color: "var(--ink-2)", transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>▸</span>
        <span style={{ flex: 1, maxWidth: 160, height: 5, borderRadius: 3, background: "var(--border,#e5e7eb)", overflow: "hidden" }}>
          <span style={{ display: "block", width: `${pct}%`, height: "100%", background: done === total ? "var(--ok,#16a34a)" : "var(--accent,#6366f1)" }} />
        </span>
        <span className="muted" style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>체크리스트 {done}/{total}</span>
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6, paddingLeft: 4 }}>
          {items.map((i) => (
            <label key={i.id} style={{ display: "flex", gap: 7, alignItems: "flex-start", fontSize: 13, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
              <input type="checkbox" checked={i.done} disabled={busy} onChange={() => onToggle(i.id, !i.done)} style={{ marginTop: 2 }} />
              <span style={{ textDecoration: i.done ? "line-through" : "none", color: i.done ? "var(--ink-2)" : "var(--ink)" }}>{i.text}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
