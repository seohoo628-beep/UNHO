"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addUsage, deleteUsage } from "@/app/(app)/leave/actions";

type Opt = { id: string; name: string };
const TYPES = ["연차", "반차(오전)", "반차(오후)"];

export function LeaveUsageForm({ members }: { members: Opt[] }) {
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
      const r = await addUsage(fd);
      if (!r.ok) setError(r.error ?? "등록 실패");
      else {
        formRef.current?.reset();
        setOpen(false);
        router.refresh();
      }
    });
  }

  if (!open) return <button className="btn primary" onClick={() => setOpen(true)}>연차 사용 기록</button>;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <form ref={formRef} onSubmit={onSubmit}>
        <div className="row">
          <label className="field" style={{ marginBottom: 0 }}>
            <span>대상자 *</span>
            <select name="member_id" required defaultValue="">
              <option value="" disabled>선택</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>
          <label className="field" style={{ marginBottom: 0 }}>
            <span>사용일자 *</span>
            <input type="date" name="use_date" required />
          </label>
          <label className="field" style={{ marginBottom: 0 }}>
            <span>구분</span>
            <select name="type" defaultValue="연차">
              {TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <label className="field" style={{ marginBottom: 0 }}>
            <span>승인</span>
            <input type="text" name="approver" defaultValue="대표" />
          </label>
          <label className="field" style={{ marginBottom: 0 }}>
            <span>비고</span>
            <input type="text" name="note" placeholder="선택" />
          </label>
        </div>
        {error && <p style={{ color: "var(--owner)", fontSize: 13 }}>{error}</p>}
        <div className="btn-row">
          <button className="btn primary" disabled={pending}>{pending ? "등록 중..." : "등록"}</button>
          <button type="button" className="btn" onClick={() => setOpen(false)}>취소</button>
        </div>
      </form>
    </div>
  );
}

export function DeleteUsageButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      className="btn sm"
      disabled={pending}
      onClick={() => {
        if (!confirm("이 사용 기록을 삭제할까요?")) return;
        start(async () => {
          await deleteUsage(id);
          router.refresh();
        });
      }}
    >
      삭제
    </button>
  );
}
