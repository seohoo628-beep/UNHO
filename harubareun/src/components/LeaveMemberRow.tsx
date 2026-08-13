"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateMember, deleteMember } from "@/app/(app)/leave/actions";

export type Member = { id: string; name: string; join_date: string; carryover: number; note: string | null };

export default function LeaveMemberRow({ member }: { member: Member }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await updateMember(member.id, fd);
      if (!r.ok) setError(r.error ?? "실패");
      else {
        setEditing(false);
        router.refresh();
      }
    });
  }

  function remove() {
    if (!confirm(`${member.name} 직원을 삭제할까요? (사용내역도 함께 삭제됩니다)`)) return;
    start(async () => {
      await deleteMember(member.id);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <tr>
        <td colSpan={5} style={{ background: "#fafbfc" }}>
          <form onSubmit={onSave}>
            <div className="row">
              <label className="field" style={{ marginBottom: 0 }}>
                <span>성명</span>
                <input type="text" name="name" required defaultValue={member.name} />
              </label>
              <label className="field" style={{ marginBottom: 0 }}>
                <span>입사일</span>
                <input type="date" name="join_date" required defaultValue={member.join_date} />
              </label>
              <label className="field" style={{ marginBottom: 0 }}>
                <span>이월</span>
                <input type="number" step="0.5" name="carryover" defaultValue={member.carryover} />
              </label>
            </div>
            <label className="field" style={{ marginTop: 10 }}>
              <span>비고</span>
              <input type="text" name="note" defaultValue={member.note ?? ""} />
            </label>
            {error && <p style={{ color: "var(--owner)", fontSize: 13 }}>{error}</p>}
            <div className="btn-row">
              <button className="btn primary" disabled={pending}>{pending ? "저장 중..." : "저장"}</button>
              <button type="button" className="btn" onClick={() => setEditing(false)}>취소</button>
            </div>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td>{member.name}</td>
      <td style={{ whiteSpace: "nowrap" }}>{member.join_date}</td>
      <td style={{ textAlign: "right" }}>{member.carryover}</td>
      <td>{member.note ?? "-"}</td>
      <td style={{ whiteSpace: "nowrap" }}>
        <button className="btn sm" disabled={pending} onClick={() => setEditing(true)}>수정</button>{" "}
        <button className="btn sm" disabled={pending} onClick={remove}>삭제</button>
      </td>
    </tr>
  );
}
