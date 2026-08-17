"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export type ChecklistItem = { text: string; done: boolean };
export type MoveTarget = { id: string; title: string };

// 상위 업무의 하위 체크리스트. 저장/승격/이동 함수는 부모가 바인딩해 넘긴다(todos / launch_checklist 공용).
// - 드래그 앤 드롭(가장자리 자동 스크롤) + ↑/↓ 버튼으로 순서 이동
// - onPromote 제공 시 '⬆ 상위로' 버튼으로 하위 항목을 상위(독립) 항목으로 승격
// - onMoveTo + moveTargets 제공 시 '➡' 버튼으로 다른 업무의 체크리스트로 이동
export default function SubChecklist({
  initial,
  onSave,
  onPromote,
  onMoveTo,
  moveTargets,
  canEdit,
  compact,
}: {
  initial: ChecklistItem[] | null | undefined;
  onSave: (items: ChecklistItem[]) => Promise<{ ok: boolean; error?: string }>;
  onPromote?: (text: string) => Promise<{ ok: boolean; error?: string }>;
  onMoveTo?: (item: ChecklistItem, targetId: string) => Promise<{ ok: boolean; error?: string }>;
  moveTargets?: MoveTarget[];
  canEdit: boolean;
  compact?: boolean;
}) {
  const [items, setItems] = useState<ChecklistItem[]>(Array.isArray(initial) ? initial : []);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [dragI, setDragI] = useState<number | null>(null);
  const [editI, setEditI] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [moveI, setMoveI] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  // 드래그 중 화면 가장자리 근처면 자동 스크롤(긴 목록에서 위/아래로 옮기기 편하게).
  useEffect(() => {
    if (dragI === null) return;
    let y = 0;
    const onOver = (e: DragEvent) => { y = e.clientY; };
    window.addEventListener("dragover", onOver);
    let raf = 0;
    const EDGE = 96, MAX = 20;
    const tick = () => {
      const h = window.innerHeight;
      if (y > 0 && y < EDGE) window.scrollBy(0, -Math.ceil(MAX * (1 - y / EDGE)));
      else if (y > h - EDGE) window.scrollBy(0, Math.ceil(MAX * (1 - (h - y) / EDGE)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { window.removeEventListener("dragover", onOver); cancelAnimationFrame(raf); };
  }, [dragI]);

  const done = items.filter((i) => i.done).length;
  const total = items.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const persist = (next: ChecklistItem[]) => {
    setItems(next);
    start(async () => { await onSave(next); router.refresh(); });
  };
  const toggle = (i: number) => persist(items.map((it, j) => (j === i ? { ...it, done: !it.done } : it)));
  const remove = (i: number) => persist(items.filter((_, j) => j !== i));
  const startEdit = (i: number) => { setEditI(i); setEditText(items[i].text); };
  const commitEdit = () => {
    if (editI === null) return;
    const t = editText.trim();
    const cur = editI;
    setEditI(null);
    if (t && t !== items[cur]?.text) persist(items.map((it, j) => (j === cur ? { ...it, text: t } : it)));
  };
  const add = () => {
    const t = text.trim();
    if (!t) return;
    persist([...items, { text: t, done: false }]);
    setText("");
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    const a = [...items];
    const [x] = a.splice(from, 1);
    a.splice(to, 0, x);
    persist(a);
  };
  const promote = (i: number) => {
    if (!onPromote) return;
    start(async () => {
      const r = await onPromote(items[i].text);
      if (r.ok) { const next = items.filter((_, j) => j !== i); setItems(next); await onSave(next); }
      router.refresh();
    });
  };
  const moveTo = (i: number, targetId: string) => {
    if (!onMoveTo || !targetId) { setMoveI(null); return; }
    const item = items[i];
    setMoveI(null);
    start(async () => {
      const r = await onMoveTo(item, targetId);
      if (r.ok) { const next = items.filter((_, j) => j !== i); setItems(next); await onSave(next); }
      router.refresh();
    });
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
              <div
                key={i}
                draggable={canEdit && !pending}
                onDragStart={() => setDragI(i)}
                onDragOver={(e) => { if (dragI !== null) e.preventDefault(); }}
                onDrop={() => { if (dragI !== null && dragI !== i) move(dragI, i); setDragI(null); }}
                onDragEnd={() => setDragI(null)}
                style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, padding: "2px 0", borderRadius: 6, background: dragI === i ? "rgba(99,102,241,.12)" : "transparent" }}
              >
                {canEdit && <span title="드래그해서 순서 이동" style={{ cursor: "grab", color: "var(--ink-2)", userSelect: "none", fontSize: 13 }}>⠿</span>}
                <input type="checkbox" checked={it.done} disabled={!canEdit || pending} onChange={() => toggle(i)} style={{ accentColor: "var(--accent, #6366f1)" }} />
                {editI === i ? (
                  <input
                    value={editText}
                    autoFocus
                    disabled={pending}
                    onChange={(e) => setEditText(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitEdit(); } if (e.key === "Escape") setEditI(null); }}
                    style={{ flex: 1, minWidth: 0, padding: "3px 7px", border: "1px solid var(--line-2)", borderRadius: 6, background: "var(--surface)", color: "var(--ink)", fontSize: 13 }}
                  />
                ) : (
                  <span
                    onClick={() => canEdit && startEdit(i)}
                    title={canEdit ? "클릭해서 수정" : undefined}
                    style={{ flex: 1, textDecoration: it.done ? "line-through" : "none", opacity: it.done ? 0.6 : 1, minWidth: 0, cursor: canEdit ? "text" : "default" }}
                  >
                    {it.text}
                  </span>
                )}
                {canEdit && (
                  <>
                    <button className="btn sm" disabled={pending || i === 0} onClick={() => move(i, i - 1)} title="위로" style={{ padding: "1px 6px" }}>↑</button>
                    <button className="btn sm" disabled={pending || i === items.length - 1} onClick={() => move(i, i + 1)} title="아래로" style={{ padding: "1px 6px" }}>↓</button>
                    {onMoveTo && moveTargets && moveTargets.length > 0 && (
                      moveI === i ? (
                        <select
                          autoFocus
                          disabled={pending}
                          defaultValue=""
                          onChange={(e) => moveTo(i, e.target.value)}
                          onBlur={() => setMoveI(null)}
                          title="이동할 체크리스트 선택"
                          style={{ maxWidth: 160, padding: "2px 4px", border: "1px solid var(--line-2)", borderRadius: 6, background: "var(--surface)", color: "var(--ink)", fontSize: 12 }}
                        >
                          <option value="">이동할 업무…</option>
                          {moveTargets.map((m) => (
                            <option key={m.id} value={m.id}>{m.title.length > 40 ? m.title.slice(0, 40) + "…" : m.title}</option>
                          ))}
                        </select>
                      ) : (
                        <button className="btn sm" disabled={pending} onClick={() => setMoveI(i)} title="다른 체크리스트로 이동" style={{ padding: "1px 7px" }}>➡ 이동</button>
                      )
                    )}
                    {onPromote && <button className="btn sm" disabled={pending} onClick={() => promote(i)} title="상위(독립) 항목으로 올리기" style={{ padding: "1px 7px", fontWeight: 700 }}>⬆ 상위로</button>}
                    <button className="btn sm" disabled={pending} onClick={() => remove(i)} title="삭제" style={{ padding: "1px 7px" }}>✕</button>
                  </>
                )}
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
          {canEdit && (onPromote || onMoveTo) && (
            <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
              드래그(⠿)·↑↓로 순서 이동{onMoveTo ? " · ‘➡ 이동’으로 다른 업무 체크리스트로" : ""}{onPromote ? " · ‘⬆ 상위로’로 독립 항목 승격" : ""}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
