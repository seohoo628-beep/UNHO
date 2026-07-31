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
  complianceStatus: "pass" | "fail";
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

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <span className="badge accent">{item.brandName}</span>{" "}
          <strong>{item.title}</strong>
        </div>
        {item.complianceStatus === "pass" ? (
          <span className="badge ok">규제 검수 통과</span>
        ) : (
          <span className="badge owner">규제 검수 미통과</span>
        )}
      </div>

      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        규칙+AI 검수 · 지적 {item.findings.length}건 · 모델 {item.model ?? "-"}
      </div>

      {/* 미통과 시 지적 문구와 대체 제안을 크게 보여준다 — 대표가 보고 판단 */}
      {item.complianceStatus === "fail" && item.findings.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {item.findings.map((f, i) => (
            <div key={i} className="flag">
              <b>[{f.rule}] “{f.phrase}”</b> — {f.reason}
              <div className="fix">대체 제안: {f.suggestion}</div>
            </div>
          ))}
        </div>
      )}

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
          onClick={() => run(() => approveOutput(item.id, reason))}
        >
          승인 → 집행 센터로
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
