"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createLead, updateLeadStage, setFollowUp } from "@/app/(app)/crm/actions";

const STAGES = ["발굴", "제안", "회신", "협의", "성사", "실패", "보류"];

export function LeadStageSelect({ leadId, stage }: { leadId: string; stage: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <select
      defaultValue={stage}
      disabled={pending}
      onChange={(e) => {
        const v = e.target.value;
        start(async () => {
          await updateLeadStage(leadId, v);
          router.refresh();
        });
      }}
      style={{ maxWidth: 110 }}
    >
      {STAGES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}

export function FollowUpCell({ leadId, value }: { leadId: string; value: string | null }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <input
      type="date"
      defaultValue={value ?? ""}
      disabled={pending}
      onChange={(e) => {
        const v = e.target.value;
        start(async () => {
          await setFollowUp(leadId, v);
          router.refresh();
        });
      }}
      style={{ maxWidth: 150 }}
    />
  );
}

export function LeadForm({ brands }: { brands: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await createLead(fd);
      if (!res.ok) setError(res.error ?? "등록 실패");
      else {
        ref.current?.reset();
        setOpen(false);
        router.refresh();
      }
    });
  }

  if (!open)
    return (
      <button className="btn primary" onClick={() => setOpen(true)}>
        리드 등록
      </button>
    );

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <form ref={ref} onSubmit={onSubmit}>
        <div className="row">
          <label className="field">
            <span>구분</span>
            <select name="kind" defaultValue="seller">
              <option value="seller">셀러(공구)</option>
              <option value="buyer">바이어(입점)</option>
            </select>
          </label>
          <label className="field">
            <span>이름 *</span>
            <input name="name" required placeholder="셀러명 / 바이어사명" />
          </label>
          <label className="field">
            <span>브랜드</span>
            <select name="brand_id" defaultValue="">
              <option value="">(없음)</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="row">
          <label className="field">
            <span>핸들·채널</span>
            <input name="handle" placeholder="@instagram / 회사 도메인" />
          </label>
          <label className="field">
            <span>연락처·이메일</span>
            <input name="contact" />
          </label>
          <label className="field">
            <span>매칭 제품</span>
            <input name="product" />
          </label>
        </div>
        <div className="row">
          <label className="field">
            <span>단계</span>
            <select name="stage" defaultValue="발굴">
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>유입 경로</span>
            <input name="source" placeholder="셀러시트 / 박람회 / DM" />
          </label>
          <label className="field">
            <span>다음 팔로업일</span>
            <input type="date" name="next_follow_up" />
          </label>
        </div>
        <label className="field">
          <span>메모</span>
          <input name="note" />
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
