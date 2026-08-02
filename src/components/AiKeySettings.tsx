"use client";

import { useState, useTransition } from "react";
import { saveAnthropicKey, testAnthropic, saveOpenAIKey, testOpenAI } from "@/app/(app)/settings/ai-actions";

type Provider = "anthropic" | "openai";

const CFG: Record<Provider, { placeholder: string; save: (k: string) => Promise<{ ok: boolean; message?: string }>; test: () => Promise<{ ok: boolean; message?: string }>; help: string; useDesc: string }> = {
  anthropic: {
    placeholder: "sk-ant-... (Anthropic API 키)",
    save: saveAnthropicKey,
    test: testAnthropic,
    help: "키는 console.anthropic.com → API Keys에서 발급합니다.",
    useDesc: "AI 회의록 정리·AI 직원 등 텍스트 AI에 사용됩니다.",
  },
  openai: {
    placeholder: "sk-... (OpenAI API 키)",
    save: saveOpenAIKey,
    test: testOpenAI,
    help: "키는 platform.openai.com → API Keys에서 발급합니다.",
    useDesc: "첨부한 음성 파일을 텍스트로 변환(Whisper)하는 데 사용됩니다.",
  },
};

export default function AiKeySettings({
  configured,
  fromEnv,
  provider = "anthropic",
}: {
  configured: boolean;
  fromEnv: boolean;
  provider?: Provider;
}) {
  const cfg = CFG[provider];
  const [key, setKey] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = () =>
    start(async () => {
      const r = await cfg.save(key);
      setMsg({ ok: r.ok, text: r.message ?? (r.ok ? "저장됨" : "오류") });
      if (r.ok) setKey("");
    });

  const test = () =>
    start(async () => {
      setMsg({ ok: true, text: "연결 확인 중…" });
      const r = await cfg.test();
      setMsg({ ok: r.ok, text: r.message ?? "" });
    });

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <span className={`badge ${configured ? "ok" : "owner"}`}>{configured ? "연결됨" : "미연결"}</span>
        <span className="muted" style={{ fontSize: 12.5 }}>
          {fromEnv ? "환경변수로 연결되어 있습니다." : configured ? "설정에 저장된 키로 연결됩니다." : cfg.useDesc}
        </span>
      </div>

      {fromEnv && (
        <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
          환경변수가 우선 적용됩니다. 아래 입력은 환경변수가 없을 때만 사용됩니다.
        </p>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={cfg.placeholder}
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
        {cfg.help} 저장된 키는 서버(DB)에만 보관되고 화면에는 다시 표시되지 않습니다. 사용량에 따라 요금이 청구됩니다.
      </p>
    </div>
  );
}
