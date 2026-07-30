"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveOutput, rejectOutput, requestRevision } from "@/app/(app)/approvals/actions";

type Finding = { phrase: string; reason: string; suggestion: string; rule: string };

export type ApprovalItem = {
  id: string;
  title: string | null;
  body: string | null;
  brandName: string;
  model: string | null;
  createdAt: string;
  findings: Finding[];
};

export default function ApprovalCard({
  item,
  canApprove,
}: {
  item: ApprovalItem;
  canApprove: boolean;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "처리 실패");
      else router.refresh();
    });
  }

  // 승인 → 서버에서 결정 기록 + 썸네일 생성. 생성 결과는 아래 "최근 생성 썸네일"에 뜬다.
  // 생성 실패 시에는 이유를 즉시 알린다(카드가 큐에서 사라지므로).
  function handleApprove() {
    setError(null);
    startTransition(async () => {
      const res = await approveOutput(item.id, reason);
      if (!res.ok) {
        setError(res.error ?? "승인 실패");
        return;
      }
      if (res.imageError) {
        window.alert("승인은 완료됐지만 썸네일 생성 실패:\n" + res.imageError);
      }
      router.refresh();
    });
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <span className="badge accent">{item.brandName}</span>{" "}
          <strong>{item.title}</strong>
        </div>
        <span className="badge ok">규제 검수 통과</span>
      </div>

      {/* 규제 검수 결과 — 통과 산출물이므로 지적 0건 */}
      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        규칙 기반 검수 통과 · 지적 {item.findings.length}건 · 모델 {item.model ?? "-"}
      </div>

      <div className="divider" />

      {/* 원문 */}
      <div className="pre">{item.body}</div>

      <div className="divider" />

      {/* 수정 요청 / 반려 사유 */}
      <label className="field">
        <span>사유 (반려·수정 요청 시 입력)</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="반려 또는 수정 요청 이유를 적습니다. 승인 시에는 비워도 됩니다."
        />
      </label>

      {error && (
        <p style={{ color: "var(--owner)", fontSize: 13, marginTop: 0 }}>{error}</p>
      )}

      <div className="btn-row">
        <button
          className="btn approve"
          disabled={pending || !canApprove}
          title={canApprove ? "" : "승인은 대표만 가능합니다."}
          onClick={handleApprove}
        >
          승인 (썸네일 생성)
        </button>
        <button
          className="btn reject"
          disabled={pending || !canApprove}
          title={canApprove ? "" : "반려는 대표만 가능합니다."}
          onClick={() => run(() => rejectOutput(item.id, reason))}
        >
          반려
        </button>
        <button
          className="btn"
          disabled={pending}
          onClick={() => run(() => requestRevision(item.id, reason))}
        >
          수정 요청
        </button>
      </div>
    </div>
  );
}
