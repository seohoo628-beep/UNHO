"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveAllMarketer } from "@/app/(app)/approvals/actions";

// 대기 중인 마케터 산출물 전체를 썸네일 생성 + 승인 + 결과물 완료.
export default function ApproveAllButton({ count }: { count: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  const run = () => {
    if (count === 0) return;
    if (!confirm(`대기 중인 ${count}건을 전부 썸네일 생성 + 승인하고 콘텐츠 결과물로 완료할까요?`)) return;
    setMsg(null);
    start(async () => {
      const r = await approveAllMarketer();
      if (!r.ok) { setMsg("실패: " + (r.error ?? "")); return; }
      const failNote = r.thumbFailed ? ` (썸네일 ${r.thumbFailed}건은 생성 실패, 승인은 완료)` : "";
      setMsg(`✅ ${r.approved}건 승인·완료${failNote}`);
      router.refresh();
    });
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button className="btn primary" disabled={pending || count === 0} onClick={run} title="전부 승인·생성">
        {pending ? "처리 중…" : "⚡ 전부 승인생성"}
      </button>
      {msg && <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{msg}</span>}
    </span>
  );
}
