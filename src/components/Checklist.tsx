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

// 편집용: 항목 추가/삭제/이름변경/체크 + 드래그 정렬 + 상위 업무로 올리기.
// onChange로 전체 배열을 넘긴다. onPromote가 있으면 각 항목을 상위 업무로 승격할 수 있다.
export function ChecklistEditor({ value, onChange, onPromote }: { value: ChecklistItem[]; onChange: (v: ChecklistItem[]) => void; onPromote?: (item: ChecklistItem) => void }) {
  const [text, setText] = useState("");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const add = () => {
    const t = text.trim();
    if (!t) return;
    onChange([...value, { id: genId(), text: t, done: false }]);
    setText("");
  };
  const upd = (id: string, patch: Partial<ChecklistItem>) => onChange(value.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const del = (id: string) => onChange(value.filter((i) => i.id !== id));
  const moveTo = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    const next = [...value]; const [m] = next.splice(from, 1); next.splice(to, 0, m); onChange(next);
  };

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {value.map((i, idx) => (
          <div
            key={i.id}
            draggable
            onDragStart={() => setDragIdx(idx)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (dragIdx !== null) moveTo(dragIdx, idx); setDragIdx(null); }}
            onDragEnd={() => setDragIdx(null)}
            style={{ display: "flex", gap: 6, alignItems: "center", opacity: dragIdx === idx ? 0.4 : 1 }}
          >
            <span title="드래그로 순서 이동" style={{ cursor: "grab", color: "var(--ink-2)", flexShrink: 0, fontSize: 13, userSelect: "none" }}>⠿</span>
            <input type="checkbox" checked={i.done} onChange={() => upd(i.id, { done: !i.done })} style={{ flexShrink: 0 }} />
            <input
              value={i.text}
              onChange={(e) => upd(i.id, { text: e.target.value })}
              style={{ flex: 1, minWidth: 0, padding: "5px 8px", border: "1px solid var(--line-2)", borderRadius: 6, background: "var(--surface)", color: "var(--ink)", fontSize: 13, textDecoration: i.done ? "line-through" : "none" }}
            />
            {onPromote && <button type="button" className="btn sm" onClick={() => onPromote(i)} title="이 항목을 상위 업무로 올리기" style={{ flexShrink: 0, padding: "1px 7px" }}>⤴ 상위로</button>}
            <button type="button" className="btn sm" onClick={() => del(i.id)} style={{ color: "var(--owner)", flexShrink: 0 }}>×</button>
          </div>
        ))}
      </div>
      {onPromote && dragIdx !== null && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); if (dragIdx !== null && value[dragIdx]) onPromote(value[dragIdx]); setDragIdx(null); }}
          style={{ marginTop: 8, padding: "10px", border: "2px dashed var(--accent)", borderRadius: 8, textAlign: "center", color: "var(--accent)", fontSize: 12.5, fontWeight: 600 }}
        >⤴ 여기에 놓으면 상위 업무로 올라갑니다</div>
      )}
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

// 카드 인라인용: "☑ 체크리스트 N/M" 칩 + 펼치면 항목 체크·추가·삭제(즉시 저장).
// onPromote가 있으면 각 항목을 "⤴ 상위로" 버튼/드래그로 상위 업무로 올릴 수 있다.
export function CardChecklist({ items, onSave, busy, onPromote }: { items: ChecklistItem[]; onSave: (v: ChecklistItem[]) => void; busy?: boolean; onPromote?: (item: ChecklistItem) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const { done, total } = checklistProgress(items);
  const genId2 = () => Math.random().toString(36).slice(2, 9) + Math.random().toString(36).slice(2, 5);
  const add = () => { const t = text.trim(); if (!t) return; onSave([...items, { id: genId2(), text: t, done: false }]); setText(""); };
  const toggle = (id: string) => onSave(items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  const del = (id: string) => onSave(items.filter((i) => i.id !== id));
  const moveTo = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    const next = [...items]; const [m] = next.splice(from, 1); next.splice(to, 0, m); onSave(next);
  };

  return (
    <div style={{ marginTop: 6 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn sm"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 }}
      >
        <span style={{ fontSize: 10, transform: open ? "rotate(90deg)" : "none", transition: "transform .15s", color: "var(--ink-2)" }}>▸</span>
        {total > 0 ? `☑ 체크리스트 ${done}/${total}` : "☑ 체크리스트 추가"}
      </button>
      {open && (
        <div style={{ marginTop: 8, padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface-2, #fafbfc)" }}>
          {total > 0 && (
            <div style={{ marginBottom: total ? 8 : 0 }}>
              <div style={{ height: 5, borderRadius: 3, background: "var(--border,#e5e7eb)", overflow: "hidden", marginBottom: 8 }}>
                <div style={{ width: `${Math.round((done / total) * 100)}%`, height: "100%", background: done === total ? "var(--ok,#16a34a)" : "var(--accent,#6366f1)" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {items.map((i, idx) => (
                  <div
                    key={i.id}
                    draggable={!busy}
                    onDragStart={() => setDragIdx(idx)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); if (dragIdx !== null) moveTo(dragIdx, idx); setDragIdx(null); }}
                    onDragEnd={() => setDragIdx(null)}
                    style={{ display: "flex", gap: 7, alignItems: "center", opacity: dragIdx === idx ? 0.4 : 1 }}
                  >
                    <span title="드래그로 순서 이동" style={{ cursor: "grab", color: "var(--ink-2)", flexShrink: 0, fontSize: 12, userSelect: "none" }}>⠿</span>
                    <input type="checkbox" checked={i.done} disabled={busy} onChange={() => toggle(i.id)} style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, textDecoration: i.done ? "line-through" : "none", color: i.done ? "var(--ink-2)" : "var(--ink)", wordBreak: "break-word" }}>{i.text}</span>
                    {onPromote && <button type="button" className="btn sm" disabled={busy} onClick={() => onPromote(i)} title="이 항목을 상위 업무로 올리기" style={{ flexShrink: 0, padding: "1px 6px", fontSize: 11.5 }}>⤴ 상위로</button>}
                    <button type="button" className="btn sm" disabled={busy} onClick={() => del(i.id)} style={{ color: "var(--owner)", flexShrink: 0, padding: "1px 7px" }}>×</button>
                  </div>
                ))}
              </div>
              {onPromote && dragIdx !== null && (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); if (dragIdx !== null && items[dragIdx]) onPromote(items[dragIdx]); setDragIdx(null); }}
                  style={{ marginTop: 8, padding: "9px", border: "2px dashed var(--accent)", borderRadius: 8, textAlign: "center", color: "var(--accent)", fontSize: 12, fontWeight: 600 }}
                >⤴ 여기에 놓으면 상위 업무로 올라갑니다</div>
              )}
            </div>
          )}
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
              placeholder="+ 하위 항목 추가 후 Enter"
              disabled={busy}
              style={{ flex: 1, minWidth: 0, padding: "6px 9px", border: "1px solid var(--line-2)", borderRadius: 6, background: "var(--surface)", color: "var(--ink)", fontSize: 13 }}
            />
            <button type="button" className="btn sm" onClick={add} disabled={busy || !text.trim()}>추가</button>
          </div>
        </div>
      )}
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
