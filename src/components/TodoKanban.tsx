"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTodoStatus, setTodoProgress } from "@/app/(app)/todos/actions";
import TodoComments from "@/components/TodoComments";

type Opt = { id: string; name: string };

export type KanbanCard = {
  id: string;
  title: string;
  brandName: string | null;
  assigneeNames: string[];
  priority: string;
  dueLabel: string;
  overdue: boolean;
  status: string;
  progress: number;
  commentCount: number;
};

const COLUMNS = ["예정", "진행", "보류", "완료"];
const COL_COLOR: Record<string, string> = { 예정: "#94a3b8", 진행: "#6366f1", 보류: "#f59e0b", 완료: "#10b981" };
const PRIO_BADGE: Record<string, string> = { 높음: "owner", 보통: "", 낮음: "muted" };

// 행 간 공유 드래그 상태(HTML5). 데스크톱에서 컬럼 간 이동.
let dragCardId: string | null = null;

export default function TodoKanban({ cards, users }: { cards: KanbanCard[]; users: Opt[] }) {
  const [pending, start] = useTransition();
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const router = useRouter();

  // 모바일 손가락 드래그(pointer). 핸들에서 시작 → 손가락 아래 컬럼 감지 → 놓으면 이동.
  const touchDrag = useRef<{ id: string; status: string } | null>(null);
  const [touchId, setTouchId] = useState<string | null>(null);
  const [hoverCol, setHoverCol] = useState<string | null>(null);

  const onPointerDown = (e: React.PointerEvent, card: KanbanCard) => {
    if (e.pointerType === "mouse") return; // PC는 HTML5 드래그 사용
    touchDrag.current = { id: card.id, status: card.status };
    setTouchId(card.id);
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!touchDrag.current) return;
    e.preventDefault();
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const colEl = el?.closest("[data-col]") as HTMLElement | null;
    setHoverCol(colEl?.getAttribute("data-col") ?? null);
  };
  const onPointerUp = () => {
    const d = touchDrag.current;
    const target = hoverCol;
    touchDrag.current = null;
    setTouchId(null);
    setHoverCol(null);
    if (d && target && target !== d.status) move(d.id, target);
  };

  const move = (id: string, status: string) => {
    start(async () => {
      await setTodoStatus(id, status);
      router.refresh();
    });
  };

  const bump = (id: string, progress: number) => {
    start(async () => {
      await setTodoProgress(id, progress);
      router.refresh();
    });
  };

  const grouped = new Map<string, KanbanCard[]>();
  for (const c of COLUMNS) grouped.set(c, []);
  for (const card of cards) {
    // 완료 외 상태는 예정/진행/보류로, 취소는 제외(활성 목록에서 안 옴)
    const col = COLUMNS.includes(card.status) ? card.status : "예정";
    grouped.get(col)!.push(card);
  }

  return (
    <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8, scrollSnapType: "x proximity", WebkitOverflowScrolling: "touch" }}>
      {COLUMNS.map((col) => {
        const list = grouped.get(col)!;
        const color = COL_COLOR[col];
        const isOver = dragOverCol === col || hoverCol === col;
        return (
          <div
            key={col}
            data-col={col}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverCol(col);
            }}
            onDragLeave={() => setDragOverCol((c) => (c === col ? null : c))}
            onDrop={() => {
              setDragOverCol(null);
              const id = dragCardId;
              dragCardId = null;
              if (id) move(id, col);
            }}
            style={{
              flex: "0 0 260px",
              minWidth: 260,
              scrollSnapAlign: "start",
              background: isOver ? `${color}18` : "var(--surface-2, #f5f6f8)",
              borderRadius: 12,
              padding: 10,
              border: isOver ? `2px dashed ${color}` : "2px solid transparent",
              transition: "background .15s, border-color .15s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 4px 10px", fontWeight: 700, fontSize: 13.5 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: color }} />
              {col}
              <span className="muted" style={{ fontWeight: 400 }}>{list.length}</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {list.length === 0 ? (
                <div className="muted" style={{ fontSize: 12, textAlign: "center", padding: "14px 0", opacity: 0.6 }}>
                  비어 있음
                </div>
              ) : (
                list.map((card) => (
                  <div
                    key={card.id}
                    draggable
                    onDragStart={() => {
                      dragCardId = card.id;
                    }}
                    className="card"
                    style={{ padding: 10, cursor: "grab", margin: 0, borderLeft: `3px solid ${color}`, opacity: touchId === card.id ? 0.4 : 1 }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                      <span
                        onPointerDown={(e) => onPointerDown(e, card)}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        title="드래그해서 이동"
                        style={{ cursor: "grab", color: "var(--ink-2)", fontSize: 15, userSelect: "none", touchAction: "none", lineHeight: 1.2, flexShrink: 0 }}
                      >
                        ⠿
                      </span>
                      <div style={{ fontWeight: 600, fontSize: 13.5, lineHeight: 1.35, flex: 1 }}>{card.title}</div>
                    </div>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center", marginTop: 5 }}>
                      {card.brandName && <span className="badge" style={{ fontSize: 10.5 }}>{card.brandName}</span>}
                      <span className={`badge ${PRIO_BADGE[card.priority] ?? ""}`} style={{ fontSize: 10.5 }}>{card.priority}</span>
                      {card.dueLabel && card.dueLabel !== "-" && (
                        <span className={`badge ${card.overdue ? "owner" : ""}`} style={{ fontSize: 10.5 }}>
                          {card.overdue ? "지연 " : ""}{card.dueLabel}
                        </span>
                      )}
                    </div>
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                      {card.assigneeNames.length ? card.assigneeNames.join(", ") : "미지정"}
                    </div>

                    {/* 진행률 바 */}
                    <div style={{ marginTop: 7 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--ink-2)", marginBottom: 2 }}>
                        <span>진행률</span>
                        <span>{card.progress}%</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 4, background: "var(--border, #e5e7eb)", overflow: "hidden" }}>
                        <div style={{ width: `${card.progress}%`, height: "100%", background: color, transition: "width .2s" }} />
                      </div>
                      <div style={{ display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap" }}>
                        {[0, 25, 50, 75, 100].map((p) => (
                          <button
                            key={p}
                            className="btn sm"
                            disabled={pending}
                            onClick={() => bump(card.id, p)}
                            style={{ padding: "1px 6px", fontSize: 10.5, ...(card.progress === p ? { background: color, color: "#fff", borderColor: color } : {}) }}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 5, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <TodoComments todoId={card.id} title={card.title} users={users} count={card.commentCount} />
                      {/* 모바일용 상태 이동 드롭다운(드래그 대체) */}
                      <select
                        value={card.status}
                        disabled={pending}
                        onChange={(e) => move(card.id, e.target.value)}
                        style={{ fontSize: 11.5, padding: "2px 4px", maxWidth: 84 }}
                      >
                        {["예정", "진행", "보류", "완료", "취소"].map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
