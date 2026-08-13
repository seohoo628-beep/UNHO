"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTask } from "@/app/(app)/tasks/actions";

type Opt = { id: string; name: string };

const CATEGORIES = [
  "콘텐츠 제작",
  "광고 집행",
  "셀러 아웃리치",
  "입점 협의",
  "거래처 관리",
  "발주·물류",
  "CS",
  "정산",
  "채용",
  "문서 작성",
  "기타",
];
const STATUSES = ["예정", "진행", "완료", "지연", "보류", "취소"];

export default function NewTaskForm({
  brands,
  users,
}: {
  brands: Opt[];
  users: Opt[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createTask(fd);
      if (!res.ok) setError(res.error ?? "등록 실패");
      else {
        formRef.current?.reset();
        setOpen(false);
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <button className="btn primary" onClick={() => setOpen(true)}>
        업무 등록
      </button>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <form ref={formRef} onSubmit={onSubmit}>
        <label className="field">
          <span>업무 내용 *</span>
          <input type="text" name="title" required placeholder="예: 리앤밤 8월 1주 릴스 촬영 준비" />
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
            <span>담당자</span>
            <select name="assignee_user_id" defaultValue="">
              <option value="">(미지정)</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>카테고리</span>
            <select name="category" defaultValue="콘텐츠 제작">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="row">
          <label className="field">
            <span>상태</span>
            <select name="status" defaultValue="예정">
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>완료 목표일</span>
            <input type="date" name="due_date" />
          </label>
          <label className="field">
            <span>대기 대상 (예: 대표)</span>
            <input type="text" name="wait_target" placeholder="회신을 기다리는 대상" />
          </label>
        </div>

        <label className="field">
          <span>대기 사유</span>
          <input type="text" name="wait_reason" placeholder="무엇을 기다리는지" />
        </label>

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
