"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTodo, setTodoStatus, deleteTodo, reorderTodos, setTodoPinned, setTodoProgress, setTodoChecklist, createTodo, moveTodoChecklistItem, demoteTodoToChecklist } from "@/app/(app)/todos/actions";
import { setChecklistDnd, type ChecklistDnd } from "@/lib/dndChecklist";
import AssigneePicker from "@/components/AssigneePicker";
import AttachmentPicker from "@/components/AttachmentPicker";
import TodoComments from "@/components/TodoComments";
import { ChecklistEditor, CardChecklist, type ChecklistItem } from "@/components/Checklist";

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
  first,
  moveTargets,
}: {
  todo: TodoData;
  brands: Opt[];
  users: Opt[];
  reorderIds?: string[]; // 같은 그룹·우선순위 형제들의 순서(있으면 위/아래 이동 버튼 노출)
  first?: boolean; // 카드 내 첫 행이면 상단 구분선 제거
  moveTargets?: { id: string; label: string }[]; // 체크리스트 항목 이동 대상(다른 업무들)
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignees, setAssignees] = useState<string[]>(todo.assigneeIds);
  const [progress, setProgress] = useState<number>(todo.progress ?? 0);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(todo.checklist ?? []);
  const [pending, start] = useTransition();
  const router = useRouter();

  // 카드에서 하위 체크리스트 변경(체크·추가·삭제) → 즉시 저장.
  const saveChecklist = (next: ChecklistItem[]) => {
    start(async () => {
      const r = await setTodoChecklist(todo.id, next);
      if (!r.ok) setError(r.error ?? "저장 실패");
      else router.refresh();
    });
  };
  // 체크리스트 항목을 상위 업무로 승격: 브랜드·중요도를 물려받아 새 상위 업무 생성 + 체크리스트에서 제거.
  const promoteItem = (item: ChecklistItem) => {
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("title", item.text);
      if (todo.brandId) fd.set("brand_id", todo.brandId);
      fd.set("priority", todo.priority || "보통");
      const r = await createTodo(fd);
      if (!r.ok) { setError(r.error ?? "상위 업무 생성 실패"); return; }
      const r2 = await setTodoChecklist(todo.id, (todo.checklist ?? []).filter((x) => x.id !== item.id));
      if (!r2.ok) { setError(r2.error ?? "체크리스트 저장 실패"); return; }
      router.refresh();
    });
  };

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
        const r3 = await setTodoChecklist(todo.id, checklist);
        if (!r3.ok) return r3;
        return { ok: true };
      },
      () => setEditing(false)
    );
  }

  if (editing) {
    return (
      <div style={{ padding: 12, background: "var(--surface-2, #fafbfc)", borderTop: first ? "none" : "1px solid var(--line)" }}>
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
            <div className="field" style={{ marginTop: 10 }}>
              <span>하위 체크리스트</span>
              <ChecklistEditor
                value={checklist}
                onChange={setChecklist}
                onPromote={(item) => { promoteItem(item); setChecklist((cl) => cl.filter((x) => x.id !== item.id)); }}
              />
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

  return (
    <div
      className="card"
      draggable
      onDragStart={() => { if (dragOk) dragTodoId = todo.id; setChecklistDnd({ kind: "parent", parentId: todo.id }); }}
      onDragOver={dragOk ? (e) => e.preventDefault() : undefined}
      onDrop={dragOk ? onDropRow : undefined}
      onDragEnd={() => { setChecklistDnd(null); }}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "11px 13px",
        marginBottom: 8,
        ...(todo.pinned ? { borderLeft: "3px solid var(--accent)", background: "var(--accent-bg)" } : {}),
      }}
    >
      {/* 본문: 업무명 + 배지들 */}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        {dragOk && <span title="드래그해서 순서 이동" style={{ cursor: "grab", color: "var(--ink-2)", userSelect: "none", paddingTop: 2 }}>⠿</span>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.5, wordBreak: "break-word" }}>{todo.title}</div>
          {todo.note ? <div className="muted" style={{ fontSize: 12.5, marginTop: 2, wordBreak: "break-word" }}>{todo.note}</div> : null}
          {typeof todo.progress === "number" && todo.progress > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
              <div style={{ flex: 1, maxWidth: 160, height: 5, borderRadius: 3, background: "var(--border, #e5e7eb)", overflow: "hidden" }}>
                <div style={{ width: `${todo.progress}%`, height: "100%", background: "var(--accent, #6366f1)" }} />
              </div>
              <span className="muted" style={{ fontSize: 11 }}>{todo.progress}%</span>
            </div>
          )}
          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
            {todo.brandName && <span className="badge accent" style={{ fontSize: 11 }}>{todo.brandName}</span>}
            <span className="badge" style={{ fontSize: 11 }}>👤 {todo.assigneeNames.length ? todo.assigneeNames.join(", ") : "미지정"}</span>
            <span className={`badge ${PRIO_BADGE[todo.priority] ?? ""}`} style={{ fontSize: 11 }}>{todo.priority}</span>
            {todo.dueDate && <span className={`badge ${todo.overdue ? "owner" : ""}`} style={{ fontSize: 11 }}>📅 {todo.dueLabel}{todo.overdue ? " 지연" : ""}</span>}
            {todo.refLink && <a href={todo.refLink} target="_blank" rel="noreferrer" className="badge accent" style={{ fontSize: 11, textDecoration: "none" }}>🔗 링크</a>}
            {todo.files.map((f, i) => (
              <a key={i} href={f.url} target="_blank" rel="noreferrer" className="badge accent" style={{ fontSize: 11, textDecoration: "none" }} title={f.name}>📎 {todo.files.length > 1 ? i + 1 : "파일"}</a>
            ))}
          </div>
          <CardChecklist
            items={todo.checklist ?? []}
            onSave={saveChecklist}
            onPromote={promoteItem}
            parentId={todo.id}
            onExternalDrop={(d: ChecklistDnd) => {
              if (d.parentId === todo.id) return;
              if (d.kind === "item") run(() => moveTodoChecklistItem(d.parentId, todo.id, d.itemId));
              else run(() => demoteTodoToChecklist(d.parentId, todo.id));
            }}
            moveTargets={(moveTargets ?? []).filter((t) => t.id !== todo.id)}
            onMoveTo={(item, targetId) => run(() => moveTodoChecklistItem(todo.id, targetId, item.id))}
            brands={brands.map((b) => b.name)}
            busy={pending}
          />
          {todo.checklist && todo.checklist.length > 0 && (
            <span className="muted" style={{ fontSize: 11, marginLeft: 4 }}>· {todo.checklist.length}개 하위항목</span>
          )}
        </div>
      </div>

      {/* 컨트롤: 진행상태 + 고정·이동·댓글·수정·삭제 */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <select
          defaultValue={todo.status}
          disabled={pending}
          onChange={(e) => run(() => setTodoStatus(todo.id, e.target.value))}
          style={{ maxWidth: 96 }}
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
              <button className="btn sm" disabled={pending || pos <= 0} title="맨 위로" style={{ padding: "3px 7px" }} onClick={() => run(() => reorderTodos(toTop()))}>⤒</button>
              <button className="btn sm" disabled={pending || pos <= 0} title="위로" style={{ padding: "3px 8px" }} onClick={() => run(() => reorderTodos(swap(pos, pos - 1)))}>↑</button>
              <button className="btn sm" disabled={pending || pos < 0 || pos === reorderIds.length - 1} title="아래로" style={{ padding: "3px 8px" }} onClick={() => run(() => reorderTodos(swap(pos, pos + 1)))}>↓</button>
            </>
          );
        })()}
        <TodoComments todoId={todo.id} title={todo.title} users={users} count={todo.commentCount} />
        <button className="btn sm" disabled={pending} onClick={() => { setAssignees(todo.assigneeIds); setProgress(todo.progress ?? 0); setChecklist(todo.checklist ?? []); setEditing(true); }}>수정</button>
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
      </div>
      {error && <div style={{ color: "var(--owner)", fontSize: 12 }}>{error}</div>}
    </div>
  );
}
