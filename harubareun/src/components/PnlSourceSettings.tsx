"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { savePnlSource } from "@/app/(app)/settings/pnl-actions";

export default function PnlSourceSettings({ gid, brands = [] }: { gid: string; brands?: { slug: string; name: string }[] }) {
  const [url, setUrl] = useState("");
  const [target, setTarget] = useState("all");
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
        붙여넣고 저장하세요. 브랜드별로 시트가 다르면 <b>대상 브랜드</b>를 골라 각각 저장하면, 상단
        브랜드 선택에 따라 해당 시트가 표시됩니다(공통은 선택 없을 때 사용).
      </p>
      {brands.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 12.5, marginRight: 8 }}>대상</label>
          <select className="input" value={target} onChange={(e) => setTarget(e.target.value)} style={{ maxWidth: 200 }}>
            <option value="all">공통(전체)</option>
            {brands.map((b) => (
              <option key={b.slug} value={b.slug}>{b.name}</option>
            ))}
          </select>
        </div>
      )}
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
              const r = await savePnlSource(url.trim(), target);
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
