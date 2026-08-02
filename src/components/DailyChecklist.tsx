"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toggleDailyCheck } from "@/app/(app)/hub/actions";

type Item = { key: string; label: string; href?: string };
type Group = { group: string; items: Item[] };

export const CHECKLIST: Group[] = [
  {
    group: "운영",
    items: [
      { key: "todos_update", label: "업무투두 최신화", href: "/todos" },
      { key: "daily_sheets", label: "일일확인시트별 점검", href: "/drive" },
      { key: "vendor_kakao", label: "거래처별 단체톡 팔로업" },
      { key: "manager_log", label: "경영지원 업무일지 작성", href: "/manager-log" },
    ],
  },
  {
    group: "콘텐츠·마케팅",
    items: [
      { key: "content_plan", label: "콘텐츠 기획·발행 (자동기획 실행)", href: "/approvals" },
      { key: "review_reply", label: "리뷰 답글 (채널별)" },
      { key: "qna_check", label: "Q&A·문의 체크" },
      { key: "detail_page", label: "채널별 상세페이지 점검" },
    ],
  },
  {
    group: "SEO 최적화",
    items: [
      { key: "seo_title", label: "제목·키워드 점검" },
      { key: "seo_meta", label: "메타·설명문 점검" },
      { key: "seo_img", label: "이미지 alt·파일명" },
      { key: "seo_keyword", label: "상세페이지 키워드 반영" },
      { key: "seo_link", label: "내부링크·연관상품 연결" },
    ],
  },
  {
    group: "매장(F&B)",
    items: [
      { key: "fnb_check", label: "F&B 매장 체크(위생·재고·예약)", href: "/fnb" },
      { key: "dining_check", label: "신미집·대운목장 체크", href: "/dining" },
    ],
  },
  {
    group: "재무·CS",
    items: [
      { key: "cash_check", label: "입출금·미수/미지급 확인", href: "/receivables" },
      { key: "cs_check", label: "CS·클레임 처리 확인" },
    ],
  },
];

export const ALL_KEYS = CHECKLIST.flatMap((g) => g.items.map((i) => i.key));

export default function DailyChecklist({ today, initialDone }: { today: string; initialDone: Record<string, boolean> }) {
  const [done, setDone] = useState<Record<string, boolean>>(initialDone);
  const [, start] = useTransition();

  const total = ALL_KEYS.length;
  const doneCount = ALL_KEYS.filter((k) => done[k]).length;
  const pct = Math.round((doneCount / total) * 100);

  const toggle = (key: string) => {
    const next = !done[key];
    setDone((d) => ({ ...d, [key]: next })); // 낙관적 업데이트(로컬 상태가 기준)
    start(async () => {
      const r = await toggleDailyCheck(today, key, next);
      if (!r.ok) setDone((d) => ({ ...d, [key]: !next })); // 서버 실패 시에만 롤백
    });
  };

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <strong style={{ fontSize: 15 }}>✅ 오늘의 체크리스트</strong>
        <span className="muted" style={{ fontSize: 12.5 }}>{doneCount}/{total} 완료 · {pct}%</span>
      </div>
      <div style={{ height: 6, background: "var(--line)", borderRadius: 999, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: pct === 100 ? "var(--ok, #16a34a)" : "var(--accent)", transition: "width .2s" }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
        {CHECKLIST.map((g) => (
          <div key={g.group}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "var(--ink-2)", marginBottom: 6, letterSpacing: "0.02em" }}>{g.group}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {g.items.map((it) => (
                <label key={it.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 4px", cursor: "pointer", borderRadius: 6, fontSize: 13.5, opacity: done[it.key] ? 0.55 : 1 }}>
                  <input type="checkbox" checked={!!done[it.key]} onChange={() => toggle(it.key)} style={{ width: 17, height: 17, flexShrink: 0 }} />
                  <span style={{ textDecoration: done[it.key] ? "line-through" : "none" }}>{it.label}</span>
                  {it.href && (
                    <Link href={it.href} onClick={(e) => e.stopPropagation()} style={{ marginLeft: "auto", fontSize: 11, color: "var(--accent)", textDecoration: "none" }}>이동 ↗</Link>
                  )}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="muted" style={{ fontSize: 11.5, marginTop: 12, marginBottom: 0 }}>체크는 날짜별로 저장됩니다. 매일 아침 새로 시작돼요.</p>
    </div>
  );
}
