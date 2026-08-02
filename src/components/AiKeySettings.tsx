"use client";

import { useState, useTransition } from "react";
import { saveAnthropicKey, testAnthropic } from "@/app/(app)/settings/ai-actions";

export default function AiKeySettings({ configured, fromEnv }: { configured: boolean; fromEnv: boolean }) {
  const [key, setKey] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = () =>
    start(async () => {
      const r = await saveAnthropicKey(key);
      setMsg({ ok: r.ok, text: r.message ?? (r.ok ? "저장됨" : "오류") });
      if (r.ok) setKey("");
    });

  const test = () =>
    start(async () => {
      setMsg({ ok: true, text: "연결 확인 중…" });
      const r = await testAnthropic();
      setMsg({ ok: r.ok, text: r.message ?? "" });
    });

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span className={`badge ${configured ? "ok" : "owner"}`}>{configured ? "연결됨" : "미연결"}</span>
        <span className="muted" style={{ fontSize: 12.5 }}>
          {fromEnv ? "환경변수(ANTHROPIC_API_KEY)로 연결되어 있습니다." : configured ? "설정에 저장된 키로 연결됩니다." : "AI 정리·AI 직원 기능을 쓰려면 키가 필요합니다."}
        </span>
      </div>

      {fromEnv ? (
        <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
          환경변수가 우선 적용됩니다. 아래 입력은 환경변수가 없을 때만 사용됩니다.
        </p>
      ) : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sk-ant-... (Anthropic API 키 붙여넣기)"
          autoComplete="off"
          style={{
            flex: 1,
            minWidth: 260,
            padding: "9px 11px",
            border: "1px solid var(--line-2)",
            borderRadius: "var(--radius)",
            background: "var(--surface)",
            color: "var(--ink)",
            fontFamily: "var(--mono, monospace)",
          }}
        />
        <button className="btn" onClick={save} disabled={pending || !key.trim()} style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}>
          저장
        </button>
        <button className="btn" onClick={test} disabled={pending || !configured}>
          연결 테스트
        </button>
      </div>

      {msg && (
        <div style={{ marginTop: 10, fontSize: 13, color: msg.ok ? "var(--ok, #16a34a)" : "var(--owner, #b91c1c)" }}>
          {msg.text}
        </div>
      )}

      <p className="muted" style={{ fontSize: 11.5, marginTop: 10, marginBottom: 0, lineHeight: 1.6 }}>
        키는 <b>console.anthropic.com → API Keys</b>에서 발급합니다. 저장된 키는 서버(DB)에만 보관되고 화면에는 다시 표시되지 않습니다.
        사용량에 따라 Anthropic 요금이 청구됩니다.
      </p>
    </div>
  );
}
