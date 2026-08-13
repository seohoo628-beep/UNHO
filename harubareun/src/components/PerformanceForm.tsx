"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordPerformance } from "@/app/(app)/reports/actions";

type Opt = { id: string; name: string };
type Output = { id: string; label: string };

export default function PerformanceForm({
  brands,
  outputs,
}: {
  brands: Opt[];
  outputs: Output[];
}) {
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
      const res = await recordPerformance(fd);
      if (!res.ok) setError(res.error ?? "실패");
      else {
        ref.current?.reset();
        setOpen(false);
        router.refresh();
      }
    });
  }

  if (!open)
    return (
      <button className="btn primary no-print" onClick={() => setOpen(true)}>
        성과 기록
      </button>
    );

  return (
    <div className="card no-print" style={{ marginBottom: 14 }}>
      <form ref={ref} onSubmit={onSubmit}>
        <div className="row">
          <label className="field">
            <span>브랜드 *</span>
            <select name="brand_id" defaultValue="">
              <option value="">선택</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>대상 산출물 (선택)</span>
            <select name="ai_output_id" defaultValue="">
              <option value="">(없음)</option>
              {outputs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>채널</span>
            <input name="channel" placeholder="인스타·유튜브·스마트스토어" />
          </label>
        </div>
        <div className="row">
          <label className="field">
            <span>도달</span>
            <input name="reach" inputMode="numeric" />
          </label>
          <label className="field">
            <span>전환</span>
            <input name="conversions" inputMode="numeric" />
          </label>
          <label className="field">
            <span>매출(원) — 대표 확정값</span>
            <input name="revenue" inputMode="numeric" />
          </label>
        </div>
        <label className="field">
          <span>비고</span>
          <input name="note" />
        </label>
        {error && <p style={{ color: "var(--owner)", fontSize: 13 }}>{error}</p>}
        <div className="btn-row">
          <button className="btn primary" disabled={pending}>
            {pending ? "저장 중..." : "저장"}
          </button>
          <button type="button" className="btn" onClick={() => setOpen(false)}>
            취소
          </button>
        </div>
      </form>
    </div>
  );
}
