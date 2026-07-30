"use client";

import { useState } from "react";

export default function KakaoSettings({ linked }: { linked: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function test() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch("/api/notify/test", { method: "POST" });
      const json = await res.json();
      if (!res.ok) setErr(json.error ?? "발송 실패");
      else setMsg("테스트 메시지를 대표 카톡으로 보냈습니다.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "발송 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <strong>카카오톡 알림 (나에게 보내기)</strong>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            평일 09:00에 승인 대기·지연·발주 임박 요약을 대표 카톡으로 보냅니다.
          </div>
        </div>
        {linked ? (
          <span className="badge ok">연결됨</span>
        ) : (
          <span className="badge warn">미연결</span>
        )}
      </div>

      <div className="btn-row" style={{ marginTop: 14 }}>
        <a className="btn primary" href="/api/kakao/login">
          {linked ? "카카오 다시 연결" : "카카오 연결"}
        </a>
        <button className="btn" onClick={test} disabled={busy || !linked}>
          {busy ? "발송 중..." : "테스트 발송"}
        </button>
      </div>

      {msg && (
        <p className="badge ok" style={{ marginTop: 12, padding: "8px 12px" }}>
          {msg}
        </p>
      )}
      {err && <p style={{ color: "var(--owner)", fontSize: 13, marginTop: 12 }}>{err}</p>}
    </div>
  );
}
