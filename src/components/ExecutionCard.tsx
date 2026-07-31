"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startExecution, completeExecution, reopenExecution } from "@/app/(app)/execute/actions";

export type ExecItem = {
  id: string;
  title: string;
  brandName: string;
  category: string | null;
  status: string;
  agentType: string | null;
  body: string | null;
  execChannel: string | null;
  execLink: string | null;
  execNote: string | null;
};

const CHANNEL_HINT: Record<string, string> = {
  marketer: "SNS·블로그 등에 게시한 뒤 게시물 링크를 남기세요.",
  md: "셀러·바이어에게 발송한 뒤 대상/결과를 남기세요.",
  designer: "문서를 전달·보관한 뒤 파일 링크를 남기세요.",
};

export default function ExecutionCard({ item }: { item: ExecItem }) {
  const [channel, setChannel] = useState(item.execChannel ?? "");
  const [link, setLink] = useState(item.execLink ?? "");
  const [note, setNote] = useState(item.execNote ?? "");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const done = item.status === "완료";

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "처리 실패");
      else router.refresh();
    });
  }

  async function copyBody() {
    try {
      await navigator.clipboard.writeText(item.body ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("복사 실패 — 원문을 직접 선택해 복사하세요.");
    }
  }

  return (
    <div className="card" style={{ marginBottom: 14, opacity: done ? 0.75 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
        <div>
          <span className="badge accent">{item.brandName}</span>{" "}
          <strong>{item.title.replace(/^\[집행\]\s*/, "")}</strong>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            {item.category ?? "기타"} · {CHANNEL_HINT[item.agentType ?? ""] ?? "집행 후 결과 링크를 남기세요."}
          </div>
        </div>
        <span className={`badge ${done ? "ok" : item.status === "진행" ? "accent" : ""}`}>{item.status}</span>
      </div>

      {/* 승인된 원문 (복사해서 집행) */}
      {item.body && (
        <>
          <div className="divider" />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span className="lbl" style={{ fontSize: 12, color: "var(--ink-2)" }}>승인된 원문</span>
            <button className="btn sm" onClick={copyBody} disabled={pending}>
              {copied ? "복사됨 ✓" : "원문 복사"}
            </button>
          </div>
          <div className="pre" style={{ maxHeight: done ? 120 : 260, overflow: "auto" }}>{item.body}</div>
        </>
      )}

      <div className="divider" />

      {/* 집행 결과 입력 */}
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <label className="field" style={{ marginBottom: 0, flex: "1 1 160px" }}>
          <span>집행 채널</span>
          <input
            type="text"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            placeholder="예: 인스타그램, 스마트스토어"
            disabled={done && !pending}
          />
        </label>
        <label className="field" style={{ marginBottom: 0, flex: "2 1 240px" }}>
          <span>결과 링크</span>
          <input
            type="text"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="게시물·발송·문서 URL"
            disabled={done && !pending}
          />
        </label>
      </div>
      <label className="field" style={{ marginTop: 8 }}>
        <span>집행 메모</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="집행 대상·시점·특이사항"
          style={{ minHeight: 56 }}
          disabled={done && !pending}
        />
      </label>

      {error && <p style={{ color: "var(--owner)", fontSize: 13, marginTop: 0 }}>{error}</p>}

      <div className="btn-row">
        {!done ? (
          <>
            {item.status === "예정" && (
              <button className="btn" disabled={pending} onClick={() => run(() => startExecution(item.id))}>
                집행 시작
              </button>
            )}
            <button
              className="btn approve"
              disabled={pending}
              onClick={() => run(() => completeExecution(item.id, { channel, link, note }))}
            >
              집행 완료
            </button>
          </>
        ) : (
          <>
            {item.execLink && (
              <a className="btn" href={item.execLink} target="_blank" rel="noreferrer">
                결과 열기
              </a>
            )}
            <button className="btn" disabled={pending} onClick={() => run(() => reopenExecution(item.id))}>
              다시 열기
            </button>
          </>
        )}
      </div>
    </div>
  );
}
