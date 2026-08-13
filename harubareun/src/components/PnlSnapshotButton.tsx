"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { savePnlSnapshot } from "@/app/(app)/pnl/actions";

export default function PnlSnapshotButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  return (
    <span>
      <button
        className="btn primary"
        disabled={pending}
        onClick={() => {
          setMsg(null);
          setErr(null);
          start(async () => {
            const r = await savePnlSnapshot();
            if (!r.ok) setErr(r.error ?? "실패");
            else {
              setMsg("오늘자 스냅샷 저장됨");
              router.refresh();
            }
          });
        }}
      >
        {pending ? "수집 중..." : "지금 스냅샷 저장"}
      </button>
      {msg && <span className="badge ok" style={{ marginLeft: 8 }}>{msg}</span>}
      {err && <span style={{ color: "var(--owner)", marginLeft: 8, fontSize: 13 }}>{err}</span>}
    </span>
  );
}
