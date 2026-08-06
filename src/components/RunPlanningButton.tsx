"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runAllMarketerNow, runMarketerForBrandNow } from "@/app/(app)/approvals/actions";

// 대표 전용: 지금 즉시 자동기획 실행(브랜드 하나 / 전 브랜드).
export default function RunPlanningButton({ brands }: { brands: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const router = useRouter();

  const statusLabel = (s?: string) =>
    s === "queued" ? "승인 큐에 올라감" : s === "blocked" ? "검수 미통과(큐에 표시됨)" : s === "skipped" ? "제외 브랜드" : s ?? "완료";

  const runOne = () => {
    if (!brandId) return;
    setMsg(null);
    start(async () => {
      const r = await runMarketerForBrandNow(brandId);
      if (!r.ok) { setMsg({ ok: false, text: r.error ?? "실행 실패" }); return; }
      setMsg({ ok: true, text: `${r.brand ?? "브랜드"} · ${statusLabel(r.status)}` });
      router.refresh();
    });
  };

  const runAll = () => {
    if (!confirm("지금 ai_enabled 전 브랜드에 대해 자동기획을 생성합니다.\n(브랜드 수만큼 AI 호출 · 20~40초 소요) 계속할까요?")) return;
    setMsg(null);
    start(async () => {
      const r = await runAllMarketerNow();
      if (!r.ok) { setMsg({ ok: false, text: r.error ?? "실행 실패" }); return; }
      setMsg({ ok: true, text: `완료 · 브랜드 ${r.brands}개 → 통과 ${r.queued} · 검수보류 ${r.blocked}${r.errored ? ` · 오류 ${r.errored}` : ""}` });
      router.refresh();
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end" }}>
        <select
          value={brandId}
          onChange={(e) => setBrandId(e.target.value)}
          disabled={pending}
          style={{ padding: "7px 9px", border: "1px solid var(--line-2)", borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--ink)", maxWidth: 160 }}
        >
          {brands.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <button className="btn" onClick={runOne} disabled={pending || !brandId} title="선택한 브랜드만 지금 생성">
          {pending ? "생성 중…" : "이 브랜드 실행"}
        </button>
        <button
          className="btn"
          onClick={runAll}
          disabled={pending}
          title="크론을 기다리지 않고 전 브랜드 생성"
          style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}
        >
          ⚡ 전 브랜드
        </button>
      </div>
      {msg && (
        <span style={{ fontSize: 12, color: msg.ok ? "var(--ok, #16a34a)" : "var(--owner, #b91c1c)" }}>{msg.text}</span>
      )}
    </div>
  );
}
