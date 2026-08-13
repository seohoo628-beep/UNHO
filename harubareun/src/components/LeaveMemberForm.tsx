"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addMember } from "@/app/(app)/leave/actions";

export default function LeaveMemberForm() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await addMember(fd);
      if (!r.ok) setError(r.error ?? "등록 실패");
      else {
        formRef.current?.reset();
        setOpen(false);
        router.refresh();
      }
    });
  }

  if (!open) return <button className="btn primary" onClick={() => setOpen(true)}>직원 추가</button>;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <form ref={formRef} onSubmit={onSubmit}>
        <div className="row">
          <label className="field" style={{ marginBottom: 0 }}>
            <span>성명 *</span>
            <input type="text" name="name" required placeholder="예: 홍길동" />
          </label>
          <label className="field" style={{ marginBottom: 0 }}>
            <span>입사일 *</span>
            <input type="date" name="join_date" required />
          </label>
          <label className="field" style={{ marginBottom: 0 }}>
            <span>이월(전년 잔여)</span>
            <input type="number" step="0.5" name="carryover" placeholder="0" />
          </label>
        </div>
        <label className="field" style={{ marginTop: 10 }}>
          <span>비고</span>
          <input type="text" name="note" placeholder="선택" />
        </label>
        {error && <p style={{ color: "var(--owner)", fontSize: 13 }}>{error}</p>}
        <div className="btn-row">
          <button className="btn primary" disabled={pending}>{pending ? "등록 중..." : "등록"}</button>
          <button type="button" className="btn" onClick={() => setOpen(false)}>취소</button>
        </div>
      </form>
    </div>
  );
}
