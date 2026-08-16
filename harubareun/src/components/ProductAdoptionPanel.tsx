"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAdoption } from "@/app/(app)/product-dev/actions";

const FILTERS = [
  "객단가 3만원↑ · 1인 구매액 5만원↑",
  "재구매 발생 (주기 2주~2개월)",
  "재구매 없으면 SKU 확장(맛·용량·색상) 가능",
  "메인 쇼핑 키워드 검색량 월 10만↑",
  "카테고리 1~3위가 프리미엄 (가격 안 깨짐)",
  "중·소형 키워드로도 확장 가능",
  "유통기한 1~2년·상온·저파손·소부피 (수출 전제)",
  "패키지가 경쟁 대비 눈에 띔",
];

function classify(rate: number | null): { label: string; color: string; note: string } | null {
  if (rate == null) return null;
  if (rate <= 35) return { label: "메인 제품", color: "#10b981", note: "수익·광고 여력 충분 (원가율 30% 내외 목표)" };
  if (rate >= 45 && rate <= 58) return { label: "서브(기획) 제품", color: "#f59e0b", note: "객단가 인상용 (원가율 50% 내외)" };
  if (rate >= 62) return { label: "미끼 제품", color: "#8b5cf6", note: "신규 유입·첫 구매 전환용 (원가율 70% 내외)" };
  return { label: "광고룸 주의", color: "#ef4444", note: "메인/기획/미끼 어느 역할도 아님 — 사양·가격 재검토" };
}

export default function ProductAdoptionPanel({
  id,
  initialFlags,
  initialCost,
  initialPrice,
  canEdit,
}: {
  id: string;
  initialFlags: boolean[] | null;
  initialCost: number | null;
  initialPrice: number | null;
  canEdit: boolean;
}) {
  const base = Array.from({ length: 8 }, (_, i) => !!(initialFlags && initialFlags[i]));
  const [open, setOpen] = useState(false);
  const [flags, setFlags] = useState<boolean[]>(base);
  const [cost, setCost] = useState<string>(initialCost != null ? String(initialCost) : "");
  const [price, setPrice] = useState<string>(initialPrice != null ? String(initialPrice) : "");
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  const score = flags.filter(Boolean).length;
  const c = cost === "" ? null : Number(cost.replace(/[, ]/g, ""));
  const p = price === "" ? null : Number(price.replace(/[, ]/g, ""));
  const rate = c != null && p != null && p > 0 ? Math.round((c / p) * 1000) / 10 : null;
  const room = c != null && p != null ? p - c : null;
  const roleInfo = classify(rate);
  const scoreColor = score >= 6 ? "#4ade80" : score >= 4 ? "#fbbf24" : "#f87171";

  const save = () =>
    start(async () => {
      await updateAdoption(id, flags, c, p);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      router.refresh();
    });

  return (
    <div style={{ marginTop: 4 }}>
      <button
        className="btn sm"
        onClick={() => setOpen((v) => !v)}
        style={{ fontWeight: 700 }}
        title="제품 채택 8필터 + 원가율/판매가 손익"
      >
        🧮 채택기준·손익 <span style={{ color: scoreColor, fontWeight: 800 }}>{score}/8</span>
        {rate != null && <span className="muted"> · 원가율 {rate}%</span>}
      </button>

      {open && (
        <div className="card" style={{ padding: 12, marginTop: 8, background: "rgba(148,163,184,.05)" }}>
          <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: 6 }}>제품 채택 기준 — 통과 못 하면 만들지 않는다</div>
          <div style={{ display: "grid", gap: 4 }}>
            {FILTERS.map((f, i) => (
              <label key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, cursor: canEdit ? "pointer" : "default" }}>
                <input
                  type="checkbox"
                  checked={flags[i]}
                  disabled={!canEdit || pending}
                  onChange={(e) => setFlags((arr) => arr.map((v, j) => (j === i ? e.target.checked : v)))}
                  style={{ marginTop: 2, accentColor: "var(--accent, #6366f1)" }}
                />
                <span>{f}</span>
              </label>
            ))}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginTop: 12, borderTop: "1px solid var(--line-2, rgba(148,163,184,.2))", paddingTop: 10 }}>
            <label className="field" style={{ marginBottom: 0 }}>
              <span>원가(원)</span>
              <input value={cost} onChange={(e) => setCost(e.target.value)} inputMode="numeric" disabled={!canEdit} style={{ width: 120 }} />
            </label>
            <label className="field" style={{ marginBottom: 0 }}>
              <span>판매가(원)</span>
              <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" disabled={!canEdit} style={{ width: 120 }} />
            </label>
            <div style={{ fontSize: 13 }}>
              <div className="muted" style={{ fontSize: 11 }}>원가율 / 마진(광고룸)</div>
              <div style={{ fontWeight: 700 }}>
                {rate != null ? `${rate}%` : "-"}
                {room != null && <span className="muted" style={{ fontWeight: 500 }}> · {room.toLocaleString("ko-KR")}원</span>}
              </div>
            </div>
            {roleInfo && (
              <span style={{ fontSize: 11.5, fontWeight: 800, padding: "3px 9px", borderRadius: 999, background: `${roleInfo.color}22`, color: roleInfo.color }}>
                {roleInfo.label}
              </span>
            )}
          </div>
          {roleInfo && <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>{roleInfo.note}</div>}

          {canEdit && (
            <div style={{ marginTop: 10 }}>
              <button className="btn primary sm" onClick={save} disabled={pending}>
                {pending ? "저장 중..." : saved ? "저장됨 ✓" : "저장"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
