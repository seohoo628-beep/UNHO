"use client";

import { Fragment, useEffect, useState } from "react";
import { getChecklistDnd, setChecklistDnd, type ChecklistDnd } from "@/lib/dndChecklist";

// 폴더 툴바용: 모든 카드 인라인 체크리스트를 한 번에 펼치기/접기.
export function ChecklistExpandAllButtons() {
  const fire = (open: boolean) => {
    try { localStorage.setItem("checklist-open-default", open ? "1" : "0"); } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent("checklist-toggle-all", { detail: { open } }));
  };
  return (
    <span style={{ display: "inline-flex", gap: 6 }}>
      <button type="button" className="btn sm" onClick={() => fire(true)} title="모든 체크리스트 펼치기">☑ 모두 펼치기</button>
      <button type="button" className="btn sm" onClick={() => fire(false)} title="모든 체크리스트 접기">모두 접기</button>
    </span>
  );
}

export type ChecklistItem = { id: string; text: string; done: boolean; pinned?: boolean; brand?: string; due?: string };

const genId = () => Math.random().toString(36).slice(2, 9) + Math.random().toString(36).slice(2, 5);

// 마감일 문자열(YYYY-MM-DD)만 허용.
export const normDue = (v: unknown): string | undefined => {
  const s = typeof v === "string" ? v.trim() : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
};

export function normalizeChecklist(raw: unknown): ChecklistItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r: any) => ({ id: String(r?.id ?? genId()), text: String(r?.text ?? "").trim(), done: !!r?.done, pinned: !!r?.pinned, brand: r?.brand ? String(r.brand) : undefined, due: normDue(r?.due) }))
    .filter((r) => r.text);
}

// 마감일 배지: 지남(빨강)·오늘/임박(노랑)·여유(회색). 완료 항목은 흐리게.
function DueBadge({ due, done }: { due: string; done?: boolean }) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
  const dd = Math.round((new Date(due + "T00:00:00+09:00").getTime() - new Date(today + "T00:00:00+09:00").getTime()) / 86400000);
  const late = dd < 0;
  const label = late ? `${-dd}일 지남` : dd === 0 ? "오늘 마감" : dd === 1 ? "내일" : `D-${dd}`;
  const tone = done
    ? { bg: "var(--line)", fg: "var(--ink-2)" }
    : late
      ? { bg: "var(--owner-bg,#fdecea)", fg: "var(--owner,#b3261e)" }
      : dd <= 2
        ? { bg: "var(--warn-bg,#fdf3e2)", fg: "var(--warn,#b26a00)" }
        : { bg: "var(--line)", fg: "var(--ink-2)" };
  return <span className="badge" style={{ fontSize: 10, marginLeft: 4, verticalAlign: "middle", background: tone.bg, color: tone.fg, fontWeight: 700 }}>📅 {due.slice(5)} · {label}</span>;
}

// 정렬 우선순위(순수 함수 — 테스트 대상): (1)미완료 위·완료 아래, (2)고정(📌) 우선,
// (3)마감일 있는 항목 먼저(날짜 오름차순 = 임박 우선), 마감일 없는 항목은 수동 순서 유지.
export const checklistOrd = (a: ChecklistItem, b: ChecklistItem): number => {
  const d = (a.done ? 1 : 0) - (b.done ? 1 : 0); if (d) return d;
  const p = (a.pinned ? 0 : 1) - (b.pinned ? 0 : 1); if (p) return p;
  const ad = a.due ? 0 : 1, bd = b.due ? 0 : 1; if (ad !== bd) return ad - bd;
  if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
  return 0;
};

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
    if (from === to || from < 0 || to < 0 || to > value.length - 1) return;
    const next = [...value]; const [m] = next.splice(from, 1); next.splice(to, 0, m); onChange(next);
  };
  const togglePin = (idx: number) => {
    const it = value[idx]; if (!it) return;
    if (!it.pinned) { const next = [...value]; next.splice(idx, 1); next.unshift({ ...it, pinned: true }); onChange(next); }
    else onChange(value.map((x) => (x.id === it.id ? { ...x, pinned: false } : x)));
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
            style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", opacity: dragIdx === idx ? 0.4 : 1, ...(i.pinned ? { background: "var(--accent-bg)", borderLeft: "3px solid var(--accent)", borderRadius: 6, padding: "3px 5px" } : {}) }}
          >
            <span title="드래그로 순서 이동" style={{ cursor: "grab", color: "var(--ink-2)", flexShrink: 0, fontSize: 13, userSelect: "none" }}>{i.pinned ? "📌" : "⠿"}</span>
            <input type="checkbox" checked={i.done} onChange={() => upd(i.id, { done: !i.done })} style={{ flexShrink: 0 }} />
            <textarea
              value={i.text}
              rows={1}
              onChange={(e) => upd(i.id, { text: e.target.value })}
              style={{ flex: "1 1 110px", minWidth: 90, padding: "5px 8px", border: i.pinned ? "1px solid var(--accent)" : "1px solid var(--line-2)", borderRadius: 6, background: "var(--surface)", color: i.pinned ? "var(--accent)" : "var(--ink)", fontWeight: i.pinned ? 700 : 400, fontSize: 13, textDecoration: i.done ? "line-through" : "none", resize: "vertical", fontFamily: "inherit" }}
            />
            <span style={{ display: "inline-flex", gap: 2, marginLeft: "auto", flexShrink: 0 }}>
              <button type="button" className="btn sm" disabled={idx === 0} onClick={() => moveTo(idx, 0)} title="맨 위로" style={{ padding: "1px 5px", fontSize: 11 }}>⤒</button>
              <button type="button" className="btn sm" disabled={idx === 0} onClick={() => moveTo(idx, idx - 1)} title="위로" style={{ padding: "1px 5px", fontSize: 11 }}>↑</button>
              <button type="button" className="btn sm" disabled={idx === value.length - 1} onClick={() => moveTo(idx, idx + 1)} title="아래로" style={{ padding: "1px 5px", fontSize: 11 }}>↓</button>
              <button type="button" className="btn sm" onClick={() => togglePin(idx)} title={i.pinned ? "고정 해제" : "상단 고정"} style={{ padding: "1px 5px", fontSize: 11, ...(i.pinned ? { background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" } : {}) }}>📌</button>
              {onPromote && <button type="button" className="btn sm" onClick={() => onPromote(i)} title="이 항목을 상위 업무로 올리기" style={{ padding: "1px 5px", fontSize: 11 }}>⤴</button>}
              <button type="button" className="btn sm" onClick={() => del(i.id)} title="삭제" style={{ color: "var(--owner)", padding: "1px 6px", fontSize: 11 }}>×</button>
            </span>
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
// parentId+onExternalDrop이 있으면 다른 상위의 체크리스트 항목/상위 자체를 이 체크리스트로 끌어와 넣을 수 있다.
export function CardChecklist({ items, onSave, busy, onPromote, parentId, onExternalDrop, moveTargets, onMoveTo, onBulkMoveTo, brands, crossFolder }: { items: ChecklistItem[]; onSave: (v: ChecklistItem[]) => void; busy?: boolean; onPromote?: (item: ChecklistItem) => void; parentId?: string; onExternalDrop?: (d: ChecklistDnd) => void; moveTargets?: { id: string; label: string }[]; onMoveTo?: (item: ChecklistItem, targetId: string) => void; onBulkMoveTo?: (items: ChecklistItem[], targetId: string) => void; brands?: string[]; crossFolder?: { label: string; onMove: (item: ChecklistItem) => void; onBulkMove?: (items: ChecklistItem[]) => void } }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropHot, setDropHot] = useState(false);
  const [moveId, setMoveId] = useState<string | null>(null);
  const [brandId, setBrandId] = useState<string | null>(null); // 브랜드 선택 열린 항목
  const [dueId, setDueId] = useState<string | null>(null); // 마감일 입력 열린 항목
  const setDue = (id: string, due: string) => { commit(items.map((x) => (x.id === id ? { ...x, due: due || undefined } : x))); };
  const [showDone, setShowDone] = useState(false); // 완료 항목은 기본 숨김
  const [selectMode, setSelectMode] = useState(false); // 다중선택 모드
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBrandOpen, setBulkBrandOpen] = useState(false);
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const setBrand = (id: string, brand: string) => commit(items.map((x) => (x.id === id ? { ...x, brand: brand || undefined } : x)));
  // 카드별 펼침 상태를 기억(localStorage). 없으면 전역 기본값 사용.
  const persistOpen = (v: boolean) => { try { if (parentId) localStorage.setItem("checklist-open:" + parentId, v ? "1" : "0"); } catch { /* ignore */ } };
  const toggleOpen = () => setOpen((o) => { const n = !o; persistOpen(n); return n; });
  useEffect(() => {
    try {
      const per = parentId ? localStorage.getItem("checklist-open:" + parentId) : null;
      if (per === "1") setOpen(true);
      else if (per === "0") setOpen(false);
      else if (localStorage.getItem("checklist-open-default") === "1") setOpen(true);
    } catch { /* ignore */ }
    const h = (e: Event) => { const o = !!(e as CustomEvent).detail?.open; setOpen(o); persistOpen(o); };
    window.addEventListener("checklist-toggle-all", h);
    return () => window.removeEventListener("checklist-toggle-all", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 외부(다른 상위)에서 온 드래그면 이 체크리스트로 받는다.
  const takeExternal = (): boolean => {
    const d = getChecklistDnd();
    if (d && onExternalDrop && (d.kind === "parent" || d.parentId !== parentId)) { onExternalDrop(d); setChecklistDnd(null); return true; }
    return false;
  };
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const { done, total } = checklistProgress(items);
  const genId2 = () => Math.random().toString(36).slice(2, 9) + Math.random().toString(36).slice(2, 5);
  const ord = checklistOrd;
  const view = [...items].sort(ord);
  const firstDone = view.findIndex((i) => i.done);
  const commit = (next: ChecklistItem[]) => onSave([...next].sort(ord));
  const add = () => { const t = text.trim(); if (!t) return; commit([...items, { id: genId2(), text: t, done: false }]); setText(""); };
  const startEdit = (i: ChecklistItem) => { setEditId(i.id); setEditText(i.text); };
  const commitEdit = () => {
    if (editId === null) return;
    const t = editText.trim();
    if (t) commit(items.map((x) => (x.id === editId ? { ...x, text: t } : x)));
    setEditId(null); setEditText("");
  };
  const toggle = (id: string) => commit(items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  const del = (id: string) => commit(items.filter((i) => i.id !== id));
  const moveTo = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || to > view.length - 1) return;
    const next = [...view]; const [m] = next.splice(from, 1); next.splice(to, 0, m); commit(next);
  };
  const togglePin = (idx: number) => {
    const it = view[idx]; if (!it) return;
    commit(items.map((x) => (x.id === it.id ? { ...x, pinned: !it.pinned } : x)));
  };

  // ── 다중선택(일괄 처리) ──
  const selectedItems = items.filter((i) => selected.has(i.id));
  const selCount = selected.size;
  const toggleSel = (id: string) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); setBulkBrandOpen(false); setBulkMoveOpen(false); };
  const visibleIds = view.filter((i) => !i.done || showDone).map((i) => i.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(visibleIds));
  const bulkBrand = (brand: string) => { commit(items.map((x) => (selected.has(x.id) ? { ...x, brand: brand || undefined } : x))); setBulkBrandOpen(false); };
  const bulkPin = (pinned: boolean) => commit(items.map((x) => (selected.has(x.id) ? { ...x, pinned } : x)));
  const bulkDone = (dn: boolean) => commit(items.map((x) => (selected.has(x.id) ? { ...x, done: dn } : x)));
  const bulkDelete = () => { if (!confirm(`선택한 ${selCount}개 항목을 삭제할까요?`)) return; commit(items.filter((x) => !selected.has(x.id))); exitSelect(); };
  const bulkMoveTo = (targetId: string) => {
    if (!targetId) return;
    if (onBulkMoveTo) onBulkMoveTo(selectedItems, targetId);
    else if (onMoveTo) selectedItems.forEach((it) => onMoveTo(it, targetId));
    setBulkMoveOpen(false); exitSelect();
  };
  const bulkCross = () => {
    if (!crossFolder || selCount === 0) return;
    if (!confirm(`선택한 ${selCount}개 항목을 '${crossFolder.label}'(으)로 옮길까요?`)) return;
    if (crossFolder.onBulkMove) crossFolder.onBulkMove(selectedItems);
    else selectedItems.forEach((it) => crossFolder.onMove(it));
    exitSelect();
  };

  return (
    <div
      style={{ marginTop: 6, ...(dropHot ? { outline: "2px dashed var(--accent)", outlineOffset: 2, borderRadius: 8 } : {}) }}
      onDragOver={onExternalDrop ? (e) => { const d = getChecklistDnd(); if (d && (d.kind === "parent" || d.parentId !== parentId)) { e.preventDefault(); e.stopPropagation(); setDropHot(true); } } : undefined}
      onDragLeave={onExternalDrop ? () => setDropHot(false) : undefined}
      onDrop={onExternalDrop ? (e) => { const d = getChecklistDnd(); if (d && (d.kind === "parent" || d.parentId !== parentId)) { e.preventDefault(); e.stopPropagation(); setDropHot(false); if (!open) setOpen(true); takeExternal(); } } : undefined}
    >
      <button
        type="button"
        onClick={toggleOpen}
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

              {/* 다중선택 토글 */}
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
                <button type="button" className="btn sm" disabled={busy} onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
                  style={selectMode ? { background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)", padding: "1px 8px", fontSize: 11 } : { padding: "1px 8px", fontSize: 11 }}>
                  {selectMode ? "선택 취소" : "☑ 다중선택"}
                </button>
              </div>

              {/* 일괄 처리 바 */}
              {selectMode && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", padding: "7px 9px", marginBottom: 8, border: "1px solid var(--accent)", borderRadius: 8, background: "var(--accent-bg)" }}>
                  <button type="button" className="btn sm" onClick={toggleAll} style={{ padding: "1px 7px", fontSize: 11 }}>{allSelected ? "전체해제" : "전체선택"}</button>
                  <span style={{ fontSize: 12, fontWeight: 800, color: "var(--accent)" }}>{selCount}개 선택</span>
                  {selCount > 0 && <>
                    {(brands?.length ?? 0) > 0 && (
                      <span style={{ position: "relative" }}>
                        <button type="button" className="btn sm" onClick={() => setBulkBrandOpen((v) => !v)} style={{ padding: "1px 7px", fontSize: 11 }}>🏷 브랜드</button>
                        {bulkBrandOpen && (
                          <span style={{ position: "absolute", top: "110%", left: 0, zIndex: 20, display: "flex", flexDirection: "column", gap: 2, padding: 6, background: "var(--surface)", border: "1px solid var(--line-2)", borderRadius: 8, minWidth: 130, boxShadow: "0 4px 14px rgba(0,0,0,0.12)" }}>
                            <button type="button" className="btn sm" onClick={() => bulkBrand("")} style={{ fontSize: 11, textAlign: "left" }}>브랜드 없음</button>
                            {(brands ?? []).map((b) => <button key={b} type="button" className="btn sm" onClick={() => bulkBrand(b)} style={{ fontSize: 11, textAlign: "left" }}>{b}</button>)}
                          </span>
                        )}
                      </span>
                    )}
                    <button type="button" className="btn sm" onClick={() => bulkPin(true)} style={{ padding: "1px 7px", fontSize: 11 }}>📌 고정</button>
                    <button type="button" className="btn sm" onClick={() => bulkPin(false)} style={{ padding: "1px 7px", fontSize: 11 }}>고정해제</button>
                    <button type="button" className="btn sm" onClick={() => bulkDone(true)} style={{ padding: "1px 7px", fontSize: 11 }}>✓ 완료</button>
                    <button type="button" className="btn sm" onClick={() => bulkDone(false)} style={{ padding: "1px 7px", fontSize: 11 }}>완료해제</button>
                    {onMoveTo && (moveTargets?.length ?? 0) > 0 && (
                      <span style={{ position: "relative" }}>
                        <button type="button" className="btn sm" onClick={() => setBulkMoveOpen((v) => !v)} style={{ padding: "1px 7px", fontSize: 11 }}>↪ 이동</button>
                        {bulkMoveOpen && (
                          <span style={{ position: "absolute", top: "110%", left: 0, zIndex: 20, display: "flex", flexDirection: "column", gap: 2, padding: 6, background: "var(--surface)", border: "1px solid var(--line-2)", borderRadius: 8, minWidth: 160, maxHeight: 220, overflow: "auto", boxShadow: "0 4px 14px rgba(0,0,0,0.12)" }}>
                            {(moveTargets ?? []).map((t) => <button key={t.id} type="button" className="btn sm" onClick={() => bulkMoveTo(t.id)} style={{ fontSize: 11, textAlign: "left" }}>{t.label.length > 30 ? t.label.slice(0, 30) + "…" : t.label}</button>)}
                          </span>
                        )}
                      </span>
                    )}
                    {crossFolder && <button type="button" className="btn sm" onClick={bulkCross} style={{ padding: "1px 7px", fontSize: 11 }}>→{crossFolder.label}</button>}
                    <button type="button" className="btn sm" onClick={bulkDelete} style={{ padding: "1px 7px", fontSize: 11, color: "var(--owner)" }}>🗑 삭제</button>
                  </>}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {view.map((i, idx) => (
                  <Fragment key={i.id}>
                  {idx === firstDone && firstDone !== -1 && (
                    <button type="button" onClick={() => setShowDone((s) => !s)} title={showDone ? "완료 항목 숨기기" : "완료 항목 보기"}
                      style={{ display: "flex", alignItems: "center", gap: 6, margin: "4px 0 2px", color: "var(--ink-2)", fontSize: 11, fontWeight: 700, background: "none", border: "none", cursor: "pointer", padding: "2px 0", width: "100%" }}>
                      <span style={{ fontSize: 10 }}>{showDone ? "▾" : "▸"}</span>✓ 완료 {done}<span style={{ flex: 1, height: 1, background: "var(--line)" }} />
                    </button>
                  )}
                  {(!i.done || showDone) && (
                  <div
                    draggable={!busy && editId !== i.id}
                    onDragStart={(e) => { e.stopPropagation(); setDragIdx(idx); if (parentId) setChecklistDnd({ kind: "item", parentId, itemId: i.id }); }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const d = getChecklistDnd(); if (d?.kind === "item" && d.parentId === parentId && dragIdx !== null) moveTo(dragIdx, idx); else takeExternal(); setDragIdx(null); }}
                    onDragEnd={() => { setDragIdx(null); setChecklistDnd(null); }}
                    style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", opacity: dragIdx === idx ? 0.4 : i.done ? 0.55 : 1, ...(i.pinned ? { background: "var(--accent-bg)", borderLeft: "3px solid var(--accent)", borderRadius: 6, padding: "3px 5px" } : {}) }}
                  >
                    {selectMode && <input type="checkbox" checked={selected.has(i.id)} onChange={() => toggleSel(i.id)} title="선택" style={{ flexShrink: 0, width: 16, height: 16, accentColor: "var(--accent)" }} />}
                    <span title="드래그로 순서 이동" style={{ cursor: "grab", color: "var(--ink-2)", flexShrink: 0, fontSize: 12, userSelect: "none" }}>⠿</span>
                    <input type="checkbox" checked={i.done} disabled={busy} onChange={() => toggle(i.id)} style={{ flexShrink: 0 }} />
                    {editId === i.id ? (
                      <textarea
                        autoFocus
                        rows={2}
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commitEdit(); } else if (e.key === "Escape") { setEditId(null); setEditText(""); } }}
                        placeholder="Enter로 줄바꿈 · Ctrl(⌘)+Enter 저장"
                        style={{ flex: "1 1 110px", minWidth: 90, padding: "3px 7px", border: "1px solid var(--accent)", borderRadius: 6, background: "var(--surface)", color: "var(--ink)", fontSize: 13, resize: "vertical", fontFamily: "inherit" }}
                      />
                    ) : (
                      <span onClick={() => !busy && startEdit(i)} title="눌러서 수정" style={{ flex: "1 1 110px", minWidth: 90, fontSize: 13, cursor: "text", fontWeight: i.pinned ? 700 : 400, textDecoration: i.done ? "line-through" : "none", color: i.done ? "var(--ink-2)" : i.pinned ? "var(--accent)" : "var(--ink)", wordBreak: "break-word", whiteSpace: "pre-wrap" }}>{i.pinned ? "📌 " : ""}{i.brand && <span className="badge accent" style={{ fontSize: 10, marginRight: 4, verticalAlign: "middle" }}>{i.brand}</span>}{i.text}{i.due && <DueBadge due={i.due} done={i.done} />}</span>
                    )}
                    <span style={{ display: "inline-flex", gap: 2, marginLeft: "auto", flexShrink: 0 }}>
                      <button type="button" className="btn sm" disabled={busy || idx === 0} onClick={() => moveTo(idx, 0)} title="맨 위로" style={{ padding: "1px 5px", fontSize: 11 }}>⤒</button>
                      <button type="button" className="btn sm" disabled={busy || idx === 0} onClick={() => moveTo(idx, idx - 1)} title="위로" style={{ padding: "1px 5px", fontSize: 11 }}>↑</button>
                      <button type="button" className="btn sm" disabled={busy || idx === view.length - 1} onClick={() => moveTo(idx, idx + 1)} title="아래로" style={{ padding: "1px 5px", fontSize: 11 }}>↓</button>
                      <button type="button" className="btn sm" disabled={busy} onClick={() => togglePin(idx)} title={i.pinned ? "고정 해제" : "상단 고정"} style={{ padding: "1px 5px", fontSize: 11, ...(i.pinned ? { background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" } : {}) }}>📌</button>
                      {(brands?.length ?? 0) > 0 && <button type="button" className="btn sm" disabled={busy} onClick={() => setBrandId((m) => (m === i.id ? null : i.id))} title="브랜드 선택" style={{ padding: "1px 5px", fontSize: 11 }}>🏷</button>}
                      <button type="button" className="btn sm" disabled={busy} onClick={() => setDueId((m) => (m === i.id ? null : i.id))} title="마감일" style={{ padding: "1px 5px", fontSize: 11, ...(i.due ? { background: "var(--accent-bg)", borderColor: "var(--accent)" } : {}) }}>📅</button>
                      {onPromote && <button type="button" className="btn sm" disabled={busy} onClick={() => onPromote(i)} title="이 항목을 상위 업무로 올리기" style={{ padding: "1px 5px", fontSize: 11 }}>⤴</button>}
                      {onMoveTo && (moveTargets?.length ?? 0) > 0 && <button type="button" className="btn sm" disabled={busy} onClick={() => setMoveId((m) => (m === i.id ? null : i.id))} title="다른 상위로 이동" style={{ padding: "1px 5px", fontSize: 11 }}>↪</button>}
                      {crossFolder && <button type="button" className="btn sm" disabled={busy} onClick={() => { if (confirm(`이 항목을 '${crossFolder.label}'(으)로 옮길까요?`)) crossFolder.onMove(i); }} title={`${crossFolder.label}(으)로 이동`} style={{ padding: "1px 5px", fontSize: 11 }}>→{crossFolder.label}</button>}
                      <button type="button" className="btn sm" disabled={busy} onClick={() => del(i.id)} title="삭제" style={{ color: "var(--owner)", padding: "1px 6px", fontSize: 11 }}>×</button>
                    </span>
                    {onMoveTo && moveId === i.id && (
                      <div style={{ flexBasis: "100%", display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
                        <select
                          autoFocus
                          defaultValue=""
                          onChange={(e) => { const t = e.target.value; if (t) { onMoveTo(i, t); setMoveId(null); } }}
                          style={{ flex: 1, minWidth: 0, padding: "4px 6px", border: "1px solid var(--accent)", borderRadius: 6, background: "var(--surface)", color: "var(--ink)", fontSize: 12 }}
                        >
                          <option value="">↪ 이동할 상위 선택…</option>
                          {(moveTargets ?? []).map((t) => <option key={t.id} value={t.id}>{t.label.length > 40 ? t.label.slice(0, 40) + "…" : t.label}</option>)}
                        </select>
                        <button type="button" className="btn sm" onClick={() => setMoveId(null)} style={{ padding: "2px 7px", fontSize: 11 }}>취소</button>
                      </div>
                    )}
                    {(brands?.length ?? 0) > 0 && brandId === i.id && (
                      <div style={{ flexBasis: "100%", display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
                        <select
                          autoFocus
                          value={i.brand ?? ""}
                          onChange={(e) => { setBrand(i.id, e.target.value); setBrandId(null); }}
                          style={{ flex: 1, minWidth: 0, padding: "4px 6px", border: "1px solid var(--accent)", borderRadius: 6, background: "var(--surface)", color: "var(--ink)", fontSize: 12 }}
                        >
                          <option value="">🏷 브랜드 없음</option>
                          {(brands ?? []).map((b) => <option key={b} value={b}>{b}</option>)}
                        </select>
                        <button type="button" className="btn sm" onClick={() => setBrandId(null)} style={{ padding: "2px 7px", fontSize: 11 }}>취소</button>
                      </div>
                    )}
                    {dueId === i.id && (
                      <div style={{ flexBasis: "100%", display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
                        <span style={{ fontSize: 11, color: "var(--ink-2)" }}>📅 마감일</span>
                        <input
                          autoFocus
                          type="date"
                          value={i.due ?? ""}
                          onChange={(e) => setDue(i.id, e.target.value)}
                          style={{ flex: 1, minWidth: 0, padding: "3px 6px", border: "1px solid var(--accent)", borderRadius: 6, background: "var(--surface)", color: "var(--ink)", fontSize: 12 }}
                        />
                        {i.due && <button type="button" className="btn sm" onClick={() => { setDue(i.id, ""); setDueId(null); }} style={{ padding: "2px 7px", fontSize: 11, color: "var(--owner)" }}>지우기</button>}
                        <button type="button" className="btn sm" onClick={() => setDueId(null)} style={{ padding: "2px 7px", fontSize: 11 }}>완료</button>
                      </div>
                    )}
                  </div>
                  )}
                  </Fragment>
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
