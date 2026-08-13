"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTodo } from "@/app/(app)/todos/actions";
import AssigneePicker from "@/components/AssigneePicker";
import AttachmentPicker from "@/components/AttachmentPicker";

type Opt = { id: string; name: string };
const PRIORITIES = ["높음", "보통", "낮음"];
const STATUSES = ["예정", "진행", "보류", "완료"];

export default function TodoForm({ brands, users }: { brands: Opt[]; users: Opt[] }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createTodo(fd);
      if (!res.ok) setError(res.error ?? "등록 실패");
      else {
        formRef.current?.reset();
        setAssignees([]);
        setOpen(false);
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <button className="btn primary" onClick={() => setOpen(true)}>
        할 일 추가
      </button>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <form ref={formRef} onSubmit={onSubmit}>
        <label className="field">
          <span>업무 *</span>
          <input type="text" name="title" required placeholder="예: 뷰티밤 8월 공구 상세페이지 검토" />
        </label>

        <div className="row">
          <label className="field">
            <span>브랜드</span>
            <select name="brand_id" defaultValue="">
              <option value="">브랜드전체</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>중요도</span>
            <select name="priority" defaultValue="보통">
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="row">
          <label className="field">
            <span>마감기한</span>
            <input type="date" name="due_date" />
          </label>
          <label className="field">
            <span>진행상태</span>
            <select name="status" defaultValue="예정">
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>참고 링크</span>
            <input type="text" name="ref_link" placeholder="시트·문서·게시물 URL" />
          </label>
        </div>

        <label className="field">
          <span>메모</span>
          <input type="text" name="note" placeholder="선택 입력" />
        </label>

        <div className="field">
          <span>담당자 (여러 명 선택 가능)</span>
          <AssigneePicker users={users} value={assignees} onChange={setAssignees} />
        </div>

        <div className="field">
          <span>파일 첨부 (선택)</span>
          <AttachmentPicker />
        </div>

        {error && <p style={{ color: "var(--owner)", fontSize: 13 }}>{error}</p>}

        <div className="btn-row">
          <button className="btn primary" disabled={pending}>
            {pending ? "등록 중..." : "등록"}
          </button>
          <button type="button" className="btn" onClick={() => setOpen(false)}>
            취소
          </button>
        </div>
      </form>
    </div>
  );
}
