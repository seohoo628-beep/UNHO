"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTodo, setTodoStatus, deleteTodo, reorderTodos, setTodoPinned, setTodoProgress } from "@/app/(app)/todos/actions";
import AssigneePicker from "@/components/AssigneePicker";
import AttachmentPicker from "@/components/AttachmentPicker";
import TodoComments from "@/components/TodoComments";
import { setTodoChecklist, promoteTodoChecklistItem, moveTodoChecklistItemToTodo, moveTodoChecklistItemsToTodo, moveChecklistItemBetweenTodos, demoteTodoToChecklist } from "@/app/(app)/todos/actions";
import SubChecklist, { type ChecklistItem, type MoveTarget } from "@/components/SubChecklist";

type Opt = { id: string; name: string };
// 행 간 공유되는 드래그 상태(HTML5 DnD). 데스크톱 드래그 정렬용.
let dragTodoId: string | null = null;
const PRIORITIES = ["높음", "보통", "낮음"];
const STATUSES = ["예정", "진행", "보류", "완료", "취소"];
const PRIO_BADGE: Record<string, string> = { 높음: "owner", 보통: "", 낮음: "muted" };

export type TodoData = {
  id: string;
  title: string;
  note: string | null;
  brandId: string | null;
  brandName: string | null;
  assigneeIds: string[];
  assigneeNames: string[];
  priority: string;
  dueDate: string | null;
  dueLabel: string;
  status: string;
  refLink: string | null;
  files: { url: string; name: string }[];
  overdue: boolean;
  pinned?: boolean;
  progress?: number;
  commentCount?: number;
  checklist?: ChecklistItem[];
};

export default function TodoRow({
  todo,
  brands,
  users,
  reorderIds,
  moveTargets,
}: {
  todo: TodoData;
  brands: Opt[];
  users: Opt[];
  reorderIds?: string[]; // 같은 그룹·우선순위 형제들의 순서(있으면 위/아래 이동 버튼 노출)
  moveTargets?: MoveTarget[]; // 체크리스트 항목을 옮길 수 있는 다른 업무 목록
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignees, setAssignees] = useState<string[]>(todo.assigneeIds);
  const [progress, setProgress] = useState<number>(todo.progress ?? 0);
  const [dropHi, setDropHi] = useState(false); // 체크리스트 항목을 이 업무 위로 드래그 중
  const [pending, start] = useTransition();
  const router = useRouter();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "실패");
      else {
        onOk?.();
        router.refresh();
      }
    });
  }

  function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    run(
      async () => {
        const r = await updateTodo(todo.id, fd);
        if (!r.ok) return r;
        if ((todo.progress ?? 0) !== progress) {
          const r2 = await setTodoProgress(todo.id, progress);
          if (!r2.ok) return r2;
        }
        return { ok: true };
      },
      () => setEditing(false)
    );
  }

  if (editing) {
    return (
      <div className="card" style={{ padding: 14, marginBottom: 8 }}>
          <form onSubmit={onSave}>
            <label className="field">
              <span>업무 *</span>
              <input type="text" name="title" required defaultValue={todo.title} />
            </label>
            <div className="row">
              <label className="field" style={{ marginBottom: 0 }}>
                <span>브랜드</span>
                <select name="brand_id" defaultValue={todo.brandId ?? ""}>
                  <option value="">(없음)</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </label>
              <label className="field" style={{ marginBottom: 0 }}>
                <span>중요도</span>
                <select name="priority" defaultValue={todo.priority}>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <label className="field" style={{ marginBottom: 0 }}>
                <span>마감기한</span>
                <input type="date" name="due_date" defaultValue={todo.dueDate ?? ""} />
              </label>
              <label className="field" style={{ marginBottom: 0 }}>
                <span>진행상태</span>
                <select name="status" defaultValue={todo.status}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="field" style={{ marginBottom: 0 }}>
                <span>참고 링크</span>
                <input type="text" name="ref_link" defaultValue={todo.refLink ?? ""} placeholder="URL" />
              </label>
            </div>
            <label className="field" style={{ marginTop: 10 }}>
              <span>진행률: {progress}%</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={progress}
                onChange={(e) => setProgress(Number(e.target.value))}
              />
            </label>
            <label className="field" style={{ marginTop: 10 }}>
              <span>메모</span>
              <textarea name="note" rows={3} defaultValue={todo.note ?? ""} style={{ resize: "vertical", fontFamily: "inherit" }} placeholder="줄바꿈 가능" />
            </label>
            <div className="field" style={{ marginTop: 10 }}>
              <span>담당자 (여러 명 선택 가능)</span>
              <AssigneePicker users={users} value={assignees} onChange={setAssignees} />
            </div>
            <div className="field" style={{ marginTop: 10 }}>
              <span>파일 첨부 (여러 개 가능)</span>
              <AttachmentPicker initial={todo.files} />
            </div>
            {error && <p style={{ color: "var(--owner)", fontSize: 13 }}>{error}</p>}
            <div className="btn-row">
              <button className="btn primary" disabled={pending}>
                {pending ? "저장 중..." : "저장"}
              </button>
              <button type="button" className="btn" onClick={() => setEditing(false)}>
                취소
              </button>
            </div>
          </form>
      </div>
    );
  }

  const dragOk = !!reorderIds && reorderIds.length > 1;
  const onDropRow = () => {
    const src = dragTodoId;
    dragTodoId = null;
    if (!src || !reorderIds || src === todo.id) return;
    if (!reorderIds.includes(src) || !reorderIds.includes(todo.id)) return; // 같은 그룹만
    const arr = reorderIds.filter((x) => x !== src);
    const at = arr.indexOf(todo.id);
    arr.splice(at, 0, src);
    run(() => reorderTodos(arr));
  };

  // 체크리스트 항목 / 상위업무-강등 드래그가 진행 중인지(dataTransfer 타입으로 판별)
  const dtTypes = (e: React.DragEvent) => { try { return Array.from(e.dataTransfer.types); } catch { return [] as string[]; } };
  const isItemDrag = (e: React.DragEvent) => { const t = dtTypes(e); return t.includes("application/x-checklist") || t.includes("application/x-todo-demote"); };
  const onRowDragOver = (e: React.DragEvent) => {
    if (isItemDrag(e)) { e.preventDefault(); if (!dropHi) setDropHi(true); return; }
    if (dragOk) e.preventDefault();
  };
  const onRowDragLeave = (e: React.DragEvent) => {
    // 자식으로의 이동은 무시(카드 밖으로 나갈 때만 해제)
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    if (dropHi) setDropHi(false);
  };
  const onRowDrop = (e: React.DragEvent) => {
    // 1) 체크리스트 항목 → 이 업무로
    let raw = "";
    try { raw = e.dataTransfer.getData("application/x-checklist"); } catch { /* ignore */ }
    if (raw) {
      setDropHi(false);
      try {
        const p = JSON.parse(raw) as { sourceTodoId?: string; text?: string; done?: boolean };
        if (p?.sourceTodoId && p.sourceTodoId !== todo.id && p.text) {
          run(() => moveChecklistItemBetweenTodos(p.sourceTodoId!, todo.id, { text: p.text!, done: !!p.done }));
        }
      } catch { /* ignore */ }
      return;
    }
    // 2) 상위 업무 → 이 업무의 체크리스트 항목으로 강등
    let rawT = "";
    try { rawT = e.dataTransfer.getData("application/x-todo-demote"); } catch { /* ignore */ }
    if (rawT) {
      setDropHi(false);
      try {
        const p = JSON.parse(rawT) as { sourceTodoId?: string; title?: string };
        if (p?.sourceTodoId && p.sourceTodoId !== todo.id) {
          run(() => demoteTodoToChecklist(p.sourceTodoId!, todo.id));
        }
      } catch { /* ignore */ }
      return;
    }
    // 3) 같은 그룹 순서 이동
    if (dragOk) onDropRow();
  };

  const done = todo.status === "완료";
  const toggleDone = () => run(() => setTodoStatus(todo.id, done ? "예정" : "완료"));

  return (
    <div
      className="card"
      draggable={dragOk}
      onDragStart={dragOk ? () => { dragTodoId = todo.id; } : undefined}
      onDragOver={onRowDragOver}
      onDragLeave={onRowDragLeave}
      onDrop={onRowDrop}
      style={{
        padding: "11px 13px",
        marginBottom: 8,
        ...(todo.pinned ? { borderLeft: "3px solid var(--accent, #6366f1)" } : {}),
        ...(dropHi ? { outline: "2px dashed var(--accent, #6366f1)", outlineOffset: 2, background: "rgba(99,102,241,.06)" } : {}),
      }}
    >
      {/* 본문: 체크박스 + 제목 + 메타 */}
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <input
          type="checkbox"
          checked={done}
          disabled={pending}
          onChange={toggleDone}
          title={done ? "완료 해제" : "완료 처리"}
          style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0, cursor: "pointer", accentColor: "var(--accent, #6366f1)" }}
        />
        <span
          draggable
          onDragStart={(e) => {
            e.stopPropagation(); // 카드(순서) 드래그와 분리
            try {
              e.dataTransfer.setData("application/x-todo-demote", JSON.stringify({ sourceTodoId: todo.id, title: todo.title }));
              e.dataTransfer.effectAllowed = "move";
            } catch { /* ignore */ }
          }}
          title="끌어다 다른 업무 위에 놓으면 그 업무의 체크리스트 항목으로 이동"
          style={{ cursor: "grab", color: "var(--ink-2)", fontSize: 14, userSelect: "none", marginTop: 1, flexShrink: 0, lineHeight: 1 }}
        >
          ⤵
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 3 }}>
            {todo.brandName && <span className="badge accent">{todo.brandName}</span>}
            <span className={`badge ${PRIO_BADGE[todo.priority] ?? ""}`}>{todo.priority}</span>
            {todo.dueLabel && todo.dueLabel !== "-" && (
              <span className="muted" style={{ fontSize: 11.5, fontWeight: 700 }}>~{todo.dueLabel}</span>
            )}
            {todo.overdue && <span className="badge owner">지연</span>}
          </div>
          <div style={{ fontWeight: 600, fontSize: 14.5, lineHeight: 1.4, textDecoration: done ? "line-through" : "none", opacity: done ? 0.6 : 1 }}>
            {todo.title}
          </div>
          {todo.note ? <div className="muted" style={{ fontSize: 12, marginTop: 2, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{todo.note}</div> : null}
          <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>
            담당 <b style={{ color: "var(--ink, inherit)" }}>{todo.assigneeNames.length ? todo.assigneeNames.join(", ") : "미지정"}</b>
          </div>
          {typeof todo.progress === "number" && todo.progress > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
              <div style={{ flex: 1, maxWidth: 160, height: 5, borderRadius: 3, background: "var(--border, #e5e7eb)", overflow: "hidden" }}>
                <div style={{ width: `${todo.progress}%`, height: "100%", background: "var(--accent, #6366f1)" }} />
              </div>
              <span className="muted" style={{ fontSize: 11 }}>{todo.progress}%</span>
            </div>
          )}
        </div>
      </div>

      <SubChecklist
        initial={todo.checklist}
        canEdit
        ownerId={todo.id}
        onSave={(items) => setTodoChecklist(todo.id, items)}
        onPromote={(text) => promoteTodoChecklistItem(todo.id, text)}
        onMoveTo={(item, targetId) => moveTodoChecklistItemToTodo(targetId, item)}
        onMoveMany={(items, targetId) => moveTodoChecklistItemsToTodo(targetId, items)}
        moveTargets={moveTargets?.filter((m) => m.id !== todo.id)}
      />

      {/* 액션바: 가로 한 줄(좁으면 줄바꿈) */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
        <select
          value={todo.status}
          disabled={pending}
          onChange={(e) => run(() => setTodoStatus(todo.id, e.target.value))}
          style={{ maxWidth: 96, fontSize: 12.5 }}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        {reorderIds && (
          <button className="btn sm" disabled={pending} title={todo.pinned ? "고정 해제" : "상단 고정"} style={{ padding: "3px 6px", ...(todo.pinned ? { background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" } : {}) }} onClick={() => run(() => setTodoPinned(todo.id, !todo.pinned))}>📌</button>
        )}
        {reorderIds && reorderIds.length > 1 && (() => {
          const pos = reorderIds.indexOf(todo.id);
          const swap = (a: number, b: number) => {
            const arr = [...reorderIds];
            [arr[a], arr[b]] = [arr[b], arr[a]];
            return arr;
          };
          const toTop = () => [todo.id, ...reorderIds.filter((x) => x !== todo.id)];
          return (
            <>
              <span title="드래그해서 순서 이동" style={{ cursor: "grab", color: "var(--ink-2)", userSelect: "none" }}>⠿</span>
              <button className="btn sm" disabled={pending || pos <= 0} title="맨 위로" style={{ padding: "3px 6px" }} onClick={() => run(() => reorderTodos(toTop()))}>⤒</button>
              <button className="btn sm" disabled={pending || pos <= 0} title="위로" style={{ padding: "3px 7px" }} onClick={() => run(() => reorderTodos(swap(pos, pos - 1)))}>↑</button>
              <button className="btn sm" disabled={pending || pos < 0 || pos === reorderIds.length - 1} title="아래로" style={{ padding: "3px 7px" }} onClick={() => run(() => reorderTodos(swap(pos, pos + 1)))}>↓</button>
            </>
          );
        })()}
        {todo.refLink && (
          <a href={todo.refLink} target="_blank" rel="noreferrer" className="btn sm" title="참고 링크">🔗</a>
        )}
        {todo.files.map((f, i) => (
          <a key={i} href={f.url} target="_blank" rel="noreferrer" className="btn sm" title={f.name}>📎{todo.files.length > 1 ? i + 1 : ""}</a>
        ))}
        <TodoComments todoId={todo.id} title={todo.title} users={users} count={todo.commentCount} />
        <button className="btn sm" disabled={pending} onClick={() => { setAssignees(todo.assigneeIds); setProgress(todo.progress ?? 0); setEditing(true); }}>수정</button>
        <button
          className="btn sm"
          disabled={pending}
          title="삭제"
          onClick={() => {
            run(() => deleteTodo(todo.id));
          }}
        >
          ✕
        </button>
      </div>
      {error && <div style={{ color: "var(--owner)", fontSize: 12, marginTop: 4 }}>{error}</div>}
    </div>
  );
}
