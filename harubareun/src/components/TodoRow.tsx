"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTodo, setTodoStatus, deleteTodo, reorderTodos, setTodoPinned, setTodoProgress } from "@/app/(app)/todos/actions";
import AssigneePicker from "@/components/AssigneePicker";
import AttachmentPicker from "@/components/AttachmentPicker";
import TodoComments from "@/components/TodoComments";

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
};

export default function TodoRow({
  todo,
  brands,
  users,
  reorderIds,
}: {
  todo: TodoData;
  brands: Opt[];
  users: Opt[];
  reorderIds?: string[]; // 같은 그룹·우선순위 형제들의 순서(있으면 위/아래 이동 버튼 노출)
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignees, setAssignees] = useState<string[]>(todo.assigneeIds);
  const [progress, setProgress] = useState<number>(todo.progress ?? 0);
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
              <input type="text" name="note" defaultValue={todo.note ?? ""} />
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

  const done = todo.status === "완료";
  const toggleDone = () => run(() => setTodoStatus(todo.id, done ? "예정" : "완료"));

  return (
    <div
      className="card"
      draggable={dragOk}
      onDragStart={dragOk ? () => { dragTodoId = todo.id; } : undefined}
      onDragOver={dragOk ? (e) => e.preventDefault() : undefined}
      onDrop={dragOk ? onDropRow : undefined}
      style={{ padding: "11px 13px", marginBottom: 8, ...(todo.pinned ? { borderLeft: "3px solid var(--accent, #6366f1)" } : {}) }}
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
          {todo.note ? <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{todo.note}</div> : null}
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
            if (!confirm("이 할 일을 삭제할까요?")) return;
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
