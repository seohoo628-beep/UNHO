"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createApprovalRequest, decideApproval, deleteApprovalRequest } from "@/app/(app)/e-approval/actions";
import AttachmentPicker from "@/components/AttachmentPicker";

const KINDS = ["지출결의", "발주", "일반"];

export function ApprovalRequestForm() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await createApprovalRequest(fd);
      if (!r.ok) setError(r.tableMissing ? "결재 저장소가 아직 준비되지 않았습니다(DB 0045)." : r.error ?? "실패");
      else {
        ref.current?.reset();
        setOpen(false);
        router.refresh();
      }
    });
  };

  if (!open)
    return (
      <button className="btn primary" onClick={() => setOpen(true)}>
        + 결재 상신
      </button>
    );
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <form ref={ref} onSubmit={onSubmit}>
        <div className="row">
          <label className="field" style={{ marginBottom: 0 }}>
            <span>종류</span>
            <select name="kind" defaultValue="지출결의">
              {KINDS.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </label>
          <label className="field" style={{ marginBottom: 0, flex: 2 }}>
            <span>제목 *</span>
            <input name="title" required placeholder="예: 촬영 소품 구매" />
          </label>
          <label className="field" style={{ marginBottom: 0 }}>
            <span>금액(원)</span>
            <input name="amount" type="number" placeholder="예: 350000" />
          </label>
        </div>
        <label className="field" style={{ marginTop: 10 }}>
          <span>상세 내용</span>
          <textarea name="body" rows={3} placeholder="사유·내역을 적어주세요." />
        </label>
        <div className="field" style={{ marginTop: 10 }}>
          <span>첨부(견적서·영수증 등)</span>
          <AttachmentPicker />
        </div>
        {error && <p style={{ color: "var(--owner)", fontSize: 13 }}>{error}</p>}
        <div className="btn-row" style={{ marginTop: 10 }}>
          <button className="btn primary" disabled={pending}>{pending ? "상신 중..." : "상신"}</button>
          <button type="button" className="btn" onClick={() => setOpen(false)}>취소</button>
        </div>
      </form>
    </div>
  );
}

export function ApprovalDecideButtons({ id, isOwner }: { id: string; isOwner: boolean }) {
  const [mode, setMode] = useState<null | "reject">(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  if (!isOwner) return null;

  const run = (decision: "approved" | "rejected", n?: string) => {
    setError(null);
    start(async () => {
      const r = await decideApproval(id, decision, n);
      if (!r.ok) setError(r.error ?? "실패");
      else {
        setMode(null);
        setNote("");
        router.refresh();
      }
    });
  };

  if (mode === "reject") {
    return (
      <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="반려 사유" style={{ width: 140 }} autoFocus />
        <button className="btn sm" disabled={pending} onClick={() => run("rejected", note)}>반려 확정</button>
        <button className="btn sm" disabled={pending} onClick={() => { setMode(null); setNote(""); }}>취소</button>
        {error && <span style={{ color: "var(--owner)", fontSize: 12 }}>{error}</span>}
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
      <button className="btn sm primary" disabled={pending} onClick={() => run("approved")}>승인</button>
      <button className="btn sm" disabled={pending} onClick={() => setMode("reject")}>반려</button>
      {error && <span style={{ color: "var(--owner)", fontSize: 12 }}>{error}</span>}
    </span>
  );
}

export function ApprovalDeleteButton({ id, isOwner }: { id: string; isOwner: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!isOwner) return null;
  return (
    <button
      className="btn sm"
      disabled={pending}
      onClick={() => {
        start(async () => {
          await deleteApprovalRequest(id);
          router.refresh();
        });
      }}
    >
      삭제
    </button>
  );
}
