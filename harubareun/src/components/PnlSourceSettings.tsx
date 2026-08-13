"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { savePnlSource } from "@/app/(app)/settings/pnl-actions";

export default function PnlSourceSettings({ gid }: { gid: string }) {
  const [url, setUrl] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="card">
      <div className="lbl" style={{ fontSize: 13, color: "var(--ink-2)", marginBottom: 8 }}>
        현재 연동 탭 gid: <span className="mono">{gid}</span>
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 10, lineHeight: 1.7 }}>
        구글 시트에서 <b>P&amp;L 표가 있는 탭</b>을 연 뒤, 브라우저 주소창의 URL을 통째로 복사해 아래에
        붙여넣고 저장하세요. 시트를 수정해 탭 주소(gid)가 바뀌어도 여기서 다시 붙여넣으면 됩니다.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          className="input"
          style={{ flex: 1, minWidth: 280 }}
          placeholder="https://docs.google.com/spreadsheets/d/.../edit?gid=..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button
          className="btn primary"
          disabled={pending || !url.trim()}
          onClick={() => {
            setMsg(null);
            setErr(null);
            start(async () => {
              const r = await savePnlSource(url.trim());
              if (!r.ok) setErr(r.error ?? "실패");
              else {
                setMsg(r.info ?? "저장됨");
                router.refresh();
              }
            });
          }}
        >
          {pending ? "확인 중..." : "P&L 탭 저장"}
        </button>
      </div>
      {msg && (
        <div className="flag" style={{ marginTop: 10, borderLeftColor: "var(--ok)", background: "var(--ok-bg)" }}>
          {msg}
        </div>
      )}
      {err && <div className="flag" style={{ marginTop: 10 }}>{err}</div>}
    </div>
  );
}
