"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importPerformanceCsv } from "@/app/(app)/reports/actions";

export default function PerformanceImport() {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await importPerformanceCsv(fd);
      if (!res.ok) setErr(res.error ?? "업로드 실패");
      else {
        setMsg(`반영 ${res.inserted}건${res.skipped ? `, 매칭 실패 ${res.skipped}건` : ""}`);
        ref.current?.reset();
        router.refresh();
      }
    });
  }

  if (!open)
    return (
      <button className="btn no-print" onClick={() => setOpen(true)}>
        성과 CSV 업로드
      </button>
    );

  return (
    <div className="card no-print" style={{ marginBottom: 14 }}>
      <form ref={ref} onSubmit={onSubmit}>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          채널(스마트스토어·메타·인스타·GA 등)에서 내보낸 CSV를 올리면 성과에 자동 반영됩니다.
          헤더에 <b>일자, 브랜드, 채널, 도달, 전환, 매출</b> 열을 포함하세요(한/영 모두 인식).
          브랜드는 브랜드명 또는 약어(rb, jd 등)로 매칭합니다.
        </p>
        <label className="field">
          <span>CSV 파일</span>
          <input type="file" name="file" accept=".csv,text/csv" required />
        </label>
        {err && <p style={{ color: "var(--owner)", fontSize: 13 }}>{err}</p>}
        {msg && (
          <p className="badge ok" style={{ padding: "6px 10px" }}>
            {msg}
          </p>
        )}
        <div className="btn-row">
          <button className="btn primary" disabled={pending}>
            {pending ? "반영 중..." : "업로드"}
          </button>
          <button type="button" className="btn" onClick={() => setOpen(false)}>
            닫기
          </button>
        </div>
      </form>
    </div>
  );
}
