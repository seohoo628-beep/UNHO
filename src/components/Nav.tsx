"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// 메뉴는 카테고리별로 묶어 표시한다. 숨김 폴더(리포트/브랜드/업무보드/셀러시트)는
// 페이지·데이터는 그대로 두고 메뉴에서만 제외한다(주소로는 접근 가능).
type Item = { href: string; label: string; badge?: boolean; owner?: boolean };
type Group = { title: string; items: Item[] };

const GROUPS: Group[] = [
  {
    title: "일일 업무",
    items: [
      { href: "/hub", label: "🏠 운영 현황" },
      { href: "/guide", label: "📖 플랫폼 사용법" },
      { href: "/search", label: "🔎 통합 검색" },
      { href: "/calendar", label: "📅 캘린더" },
      { href: "/todos", label: "📋 업무투두 전직원" },
      { href: "/drive", label: "📁 업무 시트들 (구글)" },
      { href: "/email", label: "📧 이메일 트래킹" },
      { href: "/ceo-todos", label: "🔒 CEO 투두", owner: true },
      { href: "/manager-log", label: "📓 경영지원매니저 업무일지" },
      { href: "/meetings", label: "📝 미팅·회의 일지" },
      { href: "/mall-links", label: "🛍 자사몰·광고채널 관리" },
    ],
  },
  {
    title: "인사·근태",
    items: [
      { href: "/leave", label: "🌴 연차관리" },
      { href: "/staff-directory", label: "🔒 직원관리" },
      { href: "/assignees", label: "🏷 담당자 관리" },
      { href: "/audit", label: "🕓 변경 이력", owner: true },
    ],
  },
  {
    title: "재무·정산",
    items: [
      { href: "/e-approval", label: "📑 전자결재" },
      { href: "/pnl", label: "🔒 P&L 현황(손익)" },
      { href: "/vendors", label: "📦 거래처·재고·발주 관리" },
      { href: "/receivables", label: "🔒 미수금 (받을 돈)" },
      { href: "/payables", label: "🔒 미지급금 (줄 돈)" },
      { href: "/accounts", label: "🔑 계정 ID·PW" },
    ],
  },
  {
    title: "상품·개발",
    items: [
      { href: "/inventory", label: "📦 재고관리" },
      { href: "/product-dev", label: "🧪 제품개발" },
    ],
  },
  {
    title: "콘텐츠·마케팅",
    items: [
      { href: "/approvals", label: "✅ 자동기획 콘텐츠 승인", badge: true },
      { href: "/dashboard", label: "🗂 콘텐츠 결과물" },
      { href: "/planning", label: "🧩 MD·디자이너 자동기획" },
      { href: "/assets", label: "🖼 제품 이미지·영상 자료" },
      { href: "/library", label: "🎬 제품 실제컷 삽입" },
    ],
  },
  {
    title: "영업·채널",
    items: [
      { href: "/groupbuy", label: "🛒 공구 트래킹" },
      { href: "/crm", label: "🤝 셀러·바이어 CRM" },
    ],
  },
  {
    title: "매장 운영",
    items: [
      { href: "/dining", label: "🔒 신미집·대운목장 관리" },
      { href: "/fnb", label: "🔒 청담 오리골·은우 더블랙 관리" },
    ],
  },
];

const groupTitleStyle: React.CSSProperties = {
  padding: "6px 11px 3px",
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: "0.06em",
  color: "#8a929b",
  textTransform: "uppercase",
};

export default function Nav({
  pendingCount,
  isOwner,
  counts,
}: {
  pendingCount: number;
  isOwner: boolean;
  counts?: Record<string, number>;
}) {
  const pathname = usePathname();
  // 폴더별 '지난 방문 이후 새로 추가된 항목 수'(빨간 숫자). 마지막으로 본 개수를 기기에 저장해 비교.
  const [unread, setUnread] = useState<Record<string, number>>({});
  // 카테고리(그룹) 접힘 상태.
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem("nav-collapsed-v1");
      if (raw) setCollapsedGroups(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  const toggleGroup = (title: string) =>
    setCollapsedGroups((prev) => {
      const n = { ...prev, [title]: !prev[title] };
      try {
        localStorage.setItem("nav-collapsed-v1", JSON.stringify(n));
      } catch {
        /* ignore */
      }
      return n;
    });

  useEffect(() => {
    const c = counts ?? {};
    const u: Record<string, number> = {};
    for (const href of Object.keys(c)) {
      let seen = 0;
      try {
        seen = Number(localStorage.getItem(`navseen:${href}`) ?? "0");
      } catch {
        /* ignore */
      }
      const delta = c[href] - (Number.isFinite(seen) ? seen : 0);
      if (delta > 0) u[href] = delta;
    }
    setUnread(u);
  }, [counts]);

  // 현재 열람 중인 폴더는 '봤음'으로 기록하고 배지 제거.
  useEffect(() => {
    const c = counts ?? {};
    const href = Object.keys(c).find((h) => pathname === h || pathname.startsWith(h + "/"));
    if (!href) return;
    try {
      localStorage.setItem(`navseen:${href}`, String(c[href]));
    } catch {
      /* ignore */
    }
    setUnread((prev) => {
      if (!(href in prev)) return prev;
      const n = { ...prev };
      delete n[href];
      return n;
    });
  }, [pathname, counts]);

  const groups: Group[] = isOwner
    ? [...GROUPS, { title: "설정", items: [{ href: "/settings", label: "⚙️ 설정" }] }]
    : GROUPS;

  return (
    <nav>
      {groups.map((g) => {
        const visible = g.items.filter((it) => !it.owner || isOwner);
        if (visible.length === 0) return null;
        // 현재 페이지가 속한 그룹은 접혀 있어도 펼쳐 보여준다.
        const hasActive = visible.some((it) => pathname.startsWith(it.href));
        const open = !collapsedGroups[g.title] || hasActive;
        // 접혔을 때 놓친 배지 합계.
        const hiddenBadge = visible.reduce((s, it) => s + (it.badge ? pendingCount : unread[it.href] ?? 0), 0);
        return (
          <div key={g.title} style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 12 }}>
            <button
              onClick={() => toggleGroup(g.title)}
              style={{ ...groupTitleStyle, display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none", cursor: "pointer", width: "100%", textAlign: "left" }}
            >
              <span style={{ display: "inline-block", transition: "transform .15s", transform: open ? "rotate(90deg)" : "none", fontSize: 9 }}>▸</span>
              <span style={{ flex: 1 }}>{g.title}</span>
              {!open && hiddenBadge > 0 && <span className="count">{hiddenBadge}</span>}
            </button>
            {open &&
              visible.map((it) => {
                const active = pathname.startsWith(it.href);
                const badgeNum = it.badge ? pendingCount : unread[it.href] ?? 0;
                return (
                  <Link key={it.href} href={it.href} className={`navlink${active ? " active" : ""}`}>
                    <span>{it.label}</span>
                    {badgeNum > 0 && <span className="count">{badgeNum}</span>}
                  </Link>
                );
              })}
          </div>
        );
      })}
    </nav>
  );
}
