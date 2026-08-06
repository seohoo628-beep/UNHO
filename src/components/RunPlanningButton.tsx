"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runAllMarketerNow } from "@/app/(app)/approvals/actions";

// 대표 전용: 지금 즉시 전 브랜드 자동기획 실행.
export default function RunPlanningButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();

  const run = () => {
    if (!confirm("지금 ai_enabled 전 브랜드에 대해 마케터 자동기획을 생성합니다.\n(브랜드 수만큼 AI를 호출하므로 20~40초 걸릴 수 있어요) 계속할까요?")) return;
    setMsg(null);
    start(async () => {
      const r = await runAllMarketerNow();
      if (!r.ok) {
        setMsg({ ok: false, text: r.error ?? "실행 실패" });
        return;
      }
      setMsg({
        ok: true,
        text: `완료 · 브랜드 ${r.brands}개 → 통과 ${r.queued} · 검수보류 ${r.blocked}${r.errored ? ` · 오류 ${r.errored}` : ""}`,
      });
      router.refresh();
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <button
        className="btn"
        onClick={run}
        disabled={pending}
        title="크론을 기다리지 않고 지금 전 브랜드 자동기획 생성"
        style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}
      >
        {pending ? "생성 중… (최대 40초)" : "⚡ 지금 전 브랜드 자동기획 실행"}
      </button>
      {msg && (
        <span style={{ fontSize: 12, color: msg.ok ? "var(--ok, #16a34a)" : "var(--owner, #b91c1c)" }}>{msg.text}</span>
      )}
    </div>
  );
}
