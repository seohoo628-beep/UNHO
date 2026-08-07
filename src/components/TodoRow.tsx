"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTodo, setTodoStatus, deleteTodo, reorderTodos } from "@/app/(app)/todos/actions";
import AssigneePicker from "@/components/AssigneePicker";
import AttachmentPicker from "@/components/AttachmentPicker";

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
    run(() => updateTodo(todo.id, fd), () => setEditing(false));
  }

  if (editing) {
    return (
      <tr>
        <td colSpan={7} style={{ background: "#fafbfc" }}>
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
        </td>
      </tr>
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

  return (
    <tr
      draggable={dragOk}
      onDragStart={dragOk ? () => { dragTodoId = todo.id; } : undefined}
      onDragOver={dragOk ? (e) => e.preventDefault() : undefined}
      onDrop={dragOk ? onDropRow : undefined}
    >
      <td>{todo.brandName ?? "-"}</td>
      <td>
        {todo.title}
        {todo.note ? <div className="muted" style={{ fontSize: 12 }}>{todo.note}</div> : null}
      </td>
      <td>{todo.assigneeNames.length ? todo.assigneeNames.join(", ") : "미지정"}</td>
      <td>
        <span className={`badge ${PRIO_BADGE[todo.priority] ?? ""}`}>{todo.priority}</span>
      </td>
      <td style={{ whiteSpace: "nowrap" }}>
        {todo.dueLabel}
        {todo.overdue && <span className="badge owner" style={{ marginLeft: 6 }}>지연</span>}
      </td>
      <td>
        <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
          {todo.refLink && (
            <a href={todo.refLink} target="_blank" rel="noreferrer" className="btn sm">🔗 링크</a>
          )}
          {todo.files.map((f, i) => (
            <a key={i} href={f.url} target="_blank" rel="noreferrer" className="btn sm" title={f.name}>📎 {todo.files.length > 1 ? i + 1 : "파일"}</a>
          ))}
          {!todo.refLink && todo.files.length === 0 && "-"}
        </span>
      </td>
      <td>
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <select
            defaultValue={todo.status}
            disabled={pending}
            onChange={(e) => run(() => setTodoStatus(todo.id, e.target.value))}
            style={{ maxWidth: 92 }}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
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
          <button className="btn sm" disabled={pending} onClick={() => { setAssignees(todo.assigneeIds); setEditing(true); }}>수정</button>
          <button
            className="btn sm"
            disabled={pending}
            onClick={() => {
              if (!confirm("이 할 일을 삭제할까요?")) return;
              run(() => deleteTodo(todo.id));
            }}
          >
            삭제
          </button>
        </span>
        {error && <div style={{ color: "var(--owner)", fontSize: 12, marginTop: 4 }}>{error}</div>}
      </td>
    </tr>
  );
}
