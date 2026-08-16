"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createReminder, updateReminder, toggleReminder, deleteReminder, setReminderPinned, reorderReminders, setReminderChecklist, proposeReminderReorg, applyReminderReorg, type ReminderReorgGroup } from "./actions";
import RevisionHistoryModal from "@/components/RevisionHistoryModal";
import { CardChecklist, type ChecklistItem } from "@/components/Checklist";
import FolderHistoryButton from "@/components/FolderHistoryButton";

export type Reminder = { id: string; text: string; cat: string; brand: string; done: boolean; pinned: boolean; sortOrder: number; checklist?: ChecklistItem[] };

const CATS = ["제품·브랜드", "개인·건강", "F&B 운영", "투자·자금", "유통·영업", "원칙·전략", "마케팅·콘텐츠", "인맥·네트워크", "의료·병원", "해외사업"];
const NO_CAT = "미분류";
// 브랜드 선택 목록 — 맨 앞은 '브랜드전체'(특정 브랜드 없이 전체 대상).
const BRANDS = ["리앤밤", "뷰티밤", "주당의비결", "슈퍼릴라", "신미집", "대운목장", "청담 오리닭", "엣지라인"];
const ALL_BRAND = "브랜드전체";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 11px", border: "1px solid var(--line-2)",
  borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--ink)",
};

function AddForm() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [cat, setCat] = useState("");
  const [brand, setBrand] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const submit = () => {
    setErr(null);
    start(async () => {
      const r = await createReminder(text, cat, brand);
      if (!r.ok) return setErr(r.error ?? "저장 실패");
      setText(""); setCat(""); setBrand(""); setOpen(false); router.refresh();
    });
  };

  if (!open) return <button className="btn primary" onClick={() => setOpen(true)}>+ 리마인드 추가</button>;
  return (
    <div className="card" style={{ padding: 14, marginBottom: 16 }}>
      <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="기억할 내용" style={{ ...inputStyle, resize: "vertical" }} />
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <select value={brand} onChange={(e) => setBrand(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
          <option value="">{ALL_BRAND}</option>
          {BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={cat} onChange={(e) => setCat(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
          <option value="">(분류 없음)</option>
          {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      {err && <div style={{ color: "var(--owner)", fontSize: 12, marginTop: 8 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button className="btn primary" onClick={submit} disabled={pending || !text.trim()}>{pending ? "저장 중…" : "저장"}</button>
        <button className="btn" onClick={() => { setOpen(false); setText(""); setCat(""); setBrand(""); }} disabled={pending}>취소</button>
      </div>
    </div>
  );
}

function Row({
  r, idx, total, onMove, onDragStart, onDragOver, onDrop, dragging,
}: {
  r: Reminder; idx: number; total: number;
  onMove: (id: string, dir: "top" | "up" | "down") => void;
  onDragStart: (id: string) => void; onDragOver: (e: React.DragEvent) => void; onDrop: (id: string) => void; dragging: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [hist, setHist] = useState(false);
  const [text, setText] = useState(r.text);
  const [cat, setCat] = useState(r.cat);
  const [brand, setBrand] = useState(r.brand);
  const [pending, start] = useTransition();
  const router = useRouter();

  const save = () => start(async () => { const res = await updateReminder(r.id, text, cat, brand); if (res.ok) { setEditing(false); router.refresh(); } });
  const toggle = () => start(async () => { await toggleReminder(r.id, !r.done); router.refresh(); });
  const remove = () => { if (!confirm("삭제할까요?")) return; start(async () => { await deleteReminder(r.id); router.refresh(); }); };
  const pin = () => start(async () => { await setReminderPinned(r.id, !r.pinned); router.refresh(); });
  const saveChecklist = (next: ChecklistItem[]) => start(async () => { const res = await setReminderChecklist(r.id, next); if (res.ok) router.refresh(); });

  if (editing) {
    return (
      <div className="card" style={{ padding: 12 }}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <select value={brand} onChange={(e) => setBrand(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
            <option value="">{ALL_BRAND}</option>
            {BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <select value={cat} onChange={(e) => setCat(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
            <option value="">(분류 없음)</option>
            {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button className="btn primary" onClick={save} disabled={pending || !text.trim()}>저장</button>
          <button className="btn" onClick={() => { setEditing(false); setText(r.text); setCat(r.cat); setBrand(r.brand); }}>취소</button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="card"
      draggable
      onDragStart={() => onDragStart(r.id)}
      onDragOver={onDragOver}
      onDrop={() => onDrop(r.id)}
      style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8, opacity: dragging ? 0.4 : r.done ? 0.55 : 1, borderLeft: r.pinned ? "3px solid var(--accent)" : undefined }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
      <span title="드래그로 이동" style={{ cursor: "grab", color: "var(--ink-2)", fontSize: 15, lineHeight: 1.6, userSelect: "none" }}>⠿</span>
      <input type="checkbox" checked={r.done} onChange={toggle} disabled={pending} style={{ marginTop: 4, width: 18, height: 18, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 2 }}>
          {r.pinned && <span className="badge" style={{ background: "var(--accent)", color: "var(--accent-ink)" }}>📌 고정</span>}
          {r.brand && <span className="badge" style={{ background: "#eef2ff", color: "#3730a3" }}>{r.brand}</span>}
          {r.cat && <span className="badge" style={{ background: "var(--line)", color: "var(--ink-2)" }}>{r.cat}</span>}
        </div>
        <span style={{ fontSize: 14, whiteSpace: "pre-wrap", textDecoration: r.done ? "line-through" : "none" }}>{r.text}</span>
        <div onDragStart={(e) => e.stopPropagation()}>
          <CardChecklist items={r.checklist ?? []} onSave={saveChecklist} busy={pending} />
        </div>
      </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn sm" title={r.pinned ? "고정 해제" : "상단 고정"} onClick={pin} disabled={pending} style={r.pinned ? { background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" } : undefined}>📌</button>
        <button className="btn sm" title="최상단으로" onClick={() => onMove(r.id, "top")} disabled={idx === 0}>⤒</button>
        <button className="btn sm" title="위로" onClick={() => onMove(r.id, "up")} disabled={idx === 0}>▲</button>
        <button className="btn sm" title="아래로" onClick={() => onMove(r.id, "down")} disabled={idx === total - 1}>▼</button>
        <button className="btn sm" onClick={() => setEditing(true)}>수정</button>
        <button className="btn sm" title="버전 기록·복원" onClick={() => setHist(true)}>🕘</button>
        <button className="btn sm" onClick={remove} disabled={pending} style={{ color: "var(--owner)" }}>삭제</button>
      </div>
      {hist && (
        <RevisionHistoryModal
          entity="reminders"
          recordId={r.id}
          title={r.text}
          preview={(s) => `${s?.text ?? ""}${s?.brand ? ` [${s.brand}]` : ""}${s?.cat ? ` · ${s.cat}` : ""}`}
          onClose={() => setHist(false)}
        />
      )}
    </div>
  );
}

export default function RemindersClient({ items, dbReady }: { items: Reminder[]; dbReady: boolean }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [cat, setCat] = useState("전체");
  const [order, setOrder] = useState<Reminder[]>(items);
  const [dragId, setDragId] = useState<string | null>(null);
  const [reorg, setReorg] = useState<ReminderReorgGroup[] | null>(null);
  const [reorgBusy, setReorgBusy] = useState(false);
  const [reorgMsg, setReorgMsg] = useState<string | null>(null);

  const runReorg = () => {
    setReorgMsg("🧹 AI가 분야별로 정리 중입니다… (10~30초)");
    setReorgBusy(true);
    (async () => {
      try {
        const r = await proposeReminderReorg();
        if (!r || !r.ok || !r.groups) { setReorgMsg((r && r.error) || "정리 실패. 다시 시도해 주세요."); return; }
        setReorgMsg(null); setReorg(r.groups);
      } catch (e) {
        setReorgMsg("정리 중 오류: " + (e instanceof Error ? e.message : "네트워크/시간초과"));
      } finally { setReorgBusy(false); }
    })();
  };
  const confirmReorg = () => {
    if (!reorg) return;
    if (!confirm("이대로 반영할까요?\n\n분야별 상위 리마인드가 새로 생기고, 여기에 묶인 기존 항목은 삭제됩니다. (되돌리기 버튼으로 복구 가능)")) return;
    setReorgBusy(true);
    (async () => {
      try {
        const r = await applyReminderReorg(reorg);
        if (!r.ok) { setReorgMsg(r.error ?? "반영 실패"); return; }
        setReorg(null); setReorgMsg(`✅ 정리 완료 · 카테고리 ${r.created ?? 0}개 · 기존 ${r.removed ?? 0}건 정리`);
        router.refresh();
      } finally { setReorgBusy(false); }
    })();
  };

  // 서버 데이터가 바뀌면 반영.
  useEffect(() => { setOrder(items); }, [items]);

  const cats = useMemo(() => {
    const set = new Set<string>();
    items.forEach((r) => set.add(r.cat || NO_CAT));
    return ["전체", ...CATS.filter((c) => set.has(c)), ...(set.has(NO_CAT) ? [NO_CAT] : [])];
  }, [items]);

  const visible = useMemo(() => order.filter((r) => cat === "전체" || (r.cat || NO_CAT) === cat), [order, cat]);
  const remaining = items.filter((r) => !r.done).length;

  // 새 순서를 서버에 저장(고정 항목은 위쪽 유지되게 pinned 우선 정렬 후 sort_order 부여).
  const persist = (next: Reminder[]) => {
    const sorted = [...next].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    setOrder(sorted);
    const payload = sorted.map((r, i) => ({ id: r.id, sortOrder: i }));
    start(async () => { await reorderReminders(payload); router.refresh(); });
  };

  const move = (id: string, dir: "top" | "up" | "down") => {
    const arr = [...order];
    const i = arr.findIndex((r) => r.id === id);
    if (i < 0) return;
    const [it] = arr.splice(i, 1);
    if (dir === "top") arr.unshift(it);
    else if (dir === "up") arr.splice(Math.max(0, i - 1), 0, it);
    else arr.splice(Math.min(arr.length, i + 1), 0, it);
    persist(arr);
  };

  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); return; }
    const arr = [...order];
    const from = arr.findIndex((r) => r.id === dragId);
    const to = arr.findIndex((r) => r.id === targetId);
    if (from < 0 || to < 0) { setDragId(null); return; }
    const [it] = arr.splice(from, 1);
    arr.splice(to, 0, it);
    setDragId(null);
    persist(arr);
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>🔔 리마인드</h1>
          <p>대표님만 보는 상시 리마인드 · 남은 항목 {remaining}개 · 고정/드래그/위·아래로 정렬</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn" onClick={runReorg} disabled={reorgBusy || !dbReady} title="분야별 상위 카테고리+하위 체크리스트로 재구성하고 문구를 다듬습니다(미리보기 후 확정)">{reorgBusy && !reorg ? "정리 중…" : "🧹 자동 정리"}</button>
          <FolderHistoryButton entity="reminders" label="리마인드" />
          <AddForm />
        </div>
      </div>

      {reorgMsg && <div className="card" style={{ padding: 10, marginBottom: 12, fontSize: 13, color: "var(--accent)" }}>{reorgMsg}</div>}

      {reorg && (
        <div onMouseDown={() => !reorgBusy && setReorg(null)} style={{ position: "fixed", inset: 0, background: "rgba(16,20,24,0.5)", display: "grid", placeItems: "center", zIndex: 160, padding: 16 }}>
          <div className="card" onMouseDown={(e) => e.stopPropagation()} style={{ padding: 18, width: "100%", maxWidth: 620, maxHeight: "88vh", overflow: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 8, flexWrap: "wrap" }}>
              <h3 style={{ margin: 0 }}>🧹 자동 정리 <b style={{ color: "var(--warn,#b45309)" }}>미리보기</b> <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>· 카테고리 {reorg.length}개 · 아직 반영 안 됨</span></h3>
              <button className="btn sm" onClick={() => setReorg(null)} disabled={reorgBusy}>닫기</button>
            </div>
            <p className="muted" style={{ fontSize: 12, margin: "4px 0 12px" }}>확정하면 아래 상위 카테고리들이 새 리마인드로 생기고(각 항목은 하위 체크리스트), 묶인 기존 항목은 삭제됩니다. 되돌리기 버튼으로 복구할 수 있어요.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {reorg.map((g, gi) => (
                <div key={gi} className="card" style={{ padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>📁 {g.title} <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>· {g.items.length}개</span></div>
                    <button className="btn sm" onClick={() => setReorg((prev) => prev ? prev.filter((_, i) => i !== gi) : prev)} style={{ color: "var(--owner)" }}>제외</button>
                  </div>
                  <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
                    {g.items.map((it, ii) => <li key={ii}>{it.text}</li>)}
                  </ul>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
              <button className="btn" onClick={() => setReorg(null)} disabled={reorgBusy}>취소</button>
              <button className="btn" onClick={confirmReorg} disabled={reorgBusy || reorg.length === 0} style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}>{reorgBusy ? "반영 중…" : "확정하고 반영"}</button>
            </div>
          </div>
        </div>
      )}

      {!dbReady && (
        <div className="card" style={{ padding: 14, marginBottom: 14 }}>
          <div className="empty">테이블이 아직 준비되지 않았습니다. 마이그레이션(0069·0070)을 적용해 주세요.</div>
        </div>
      )}

      {cats.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {cats.map((c) => (
            <button key={c} className={`btn sm${cat === c ? " primary" : ""}`} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="card"><div className="empty">{dbReady ? "리마인드가 없습니다. “+ 리마인드 추가”로 시작하세요." : ""}</div></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {visible.map((r) => (
            <Row
              key={r.id} r={r}
              idx={order.findIndex((o) => o.id === r.id)} total={order.length}
              onMove={move}
              onDragStart={setDragId}
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              dragging={dragId === r.id}
            />
          ))}
          {cat !== "전체" && <div className="muted" style={{ fontSize: 12 }}>※ 순서 이동은 &lsquo;전체&rsquo; 필터에서 사용하세요.</div>}
        </div>
      )}
    </div>
  );
}
