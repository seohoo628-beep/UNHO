import { parseCsv, toNum } from "@/lib/csv";
import { getSetting } from "@/lib/settings";
import { DEFAULT_SELLER_SHEET_ID } from "@/lib/sheets";

// 공구셀러 관리시트의 "셀러리스트" 탭을 읽어 파이프라인·집계를 만든다. 읽기 전용.
export const DEFAULT_GROUPBUY_SHEET_TAB = "셀러리스트";

export async function getGroupBuyConfig(): Promise<{ id: string; tab: string }> {
  return {
    id: (await getSetting("groupbuy_sheet_id")) || DEFAULT_SELLER_SHEET_ID,
    tab: (await getSetting("groupbuy_sheet_tab")) || DEFAULT_GROUPBUY_SHEET_TAB,
  };
}

export async function fetchGroupBuyRows(): Promise<{ ok: boolean; rows?: string[][]; error?: string }> {
  const cfg = await getGroupBuyConfig();
  // 탭 이름으로 지정(gid 불필요). range로 빈 행 이후까지 최대한 읽는다.
  const url = `https://docs.google.com/spreadsheets/d/${cfg.id}/gviz/tq?tqx=out:csv&headers=0&range=A1:BA5000&sheet=${encodeURIComponent(
    cfg.tab
  )}`;
  try {
    const res = await fetch(url, { redirect: "follow", cache: "no-store" });
    const text = await res.text();
    if (!res.ok || text.trim().startsWith("<")) {
      return {
        ok: false,
        error: '시트를 읽지 못했습니다. 공유를 "링크가 있는 모든 사용자 · 뷰어"로 설정하세요.',
      };
    }
    return { ok: true, rows: parseCsv(text) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "시트 읽기 실패" };
  }
}

const norm = (s: string) => (s ?? "").replace(/\s+/g, "").trim();

/** 헤더에서 이름으로 컬럼 인덱스를 찾는다(정확 일치 우선, 없으면 포함). */
function colIndex(header: string[], names: string[]): number {
  const h = header.map(norm);
  for (const name of names) {
    const n = norm(name);
    const exact = h.findIndex((c) => c === n);
    if (exact >= 0) return exact;
  }
  for (const name of names) {
    const n = norm(name);
    const inc = h.findIndex((c) => c.includes(n));
    if (inc >= 0) return inc;
  }
  return -1;
}

export type Seller = {
  no: string;
  manager: string;
  name: string;
  handle: string;
  channel: string;
  channelLink: string;
  field: string;
  product: string;
  followers: number | null;
  status: string;
  firstPitch: string;
  notion: string;
  revenue: number | null;
  profit: number | null;
  settle: string;
  regDate: string;
  proposalMonth: string;
};

// 제안현황 표준 순서(대시보드와 동일)
export const STATUS_ORDER = [
  "1차 제안",
  "2차 제안중",
  "조건 협의중",
  "진행 확정",
  "공구 진행중",
  "공구 완료",
  "미답변",
  "거절",
  "보류",
];

const CONFIRMED = new Set(["진행 확정", "공구 진행중", "공구 완료"]);

export type GroupBuyData = {
  sellers: Seller[];
  managers: string[];
  fields: string[];
  statusCounts: { status: string; count: number }[];
  kpi: {
    total: number;
    confirmed: number;
    noReply: number;
    convRate: number; // %
    revenue: number;
    profit: number;
  };
};

export function parseGroupBuy(rows: string[][]): GroupBuyData | null {
  // 헤더 행 = '셀러명'과 '제안현황'이 함께 있는 행.
  let hi = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i].map(norm);
    if (r.includes("셀러명") && r.some((c) => c.includes("제안현황"))) {
      hi = i;
      break;
    }
  }
  if (hi < 0) return null;

  const header = rows[hi];
  const idx = {
    no: colIndex(header, ["No"]),
    manager: colIndex(header, ["담당자"]),
    name: colIndex(header, ["셀러명"]),
    handle: colIndex(header, ["계정명(핸들)", "계정명", "핸들"]),
    channel: colIndex(header, ["활동채널", "채널"]),
    channelLink: colIndex(header, ["채널 링크", "채널링크"]),
    field: colIndex(header, ["분야"]),
    product: colIndex(header, ["진행제품"]),
    followers: colIndex(header, ["팔로워수"]),
    status: colIndex(header, ["제안현황"]),
    firstPitch: colIndex(header, ["1차 제안일"]),
    notion: colIndex(header, ["팔로업 노션 링크", "노션 링크", "노션"]),
    revenue: colIndex(header, ["공구 매출"]),
    profit: colIndex(header, ["본사이익"]),
    settle: colIndex(header, ["정산상태"]),
    regDate: colIndex(header, ["등록일"]),
    proposalMonth: colIndex(header, ["제안월"]),
  };

  const at = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");

  const sellers: Seller[] = [];
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i];
    const name = at(r, idx.name);
    if (!name) continue; // 셀러명 없으면 건너뜀
    sellers.push({
      no: at(r, idx.no),
      manager: at(r, idx.manager),
      name,
      handle: at(r, idx.handle),
      channel: at(r, idx.channel),
      channelLink: at(r, idx.channelLink),
      field: at(r, idx.field),
      product: at(r, idx.product),
      followers: toNum(at(r, idx.followers)),
      status: at(r, idx.status) || "미답변",
      firstPitch: at(r, idx.firstPitch),
      notion: at(r, idx.notion),
      revenue: toNum(at(r, idx.revenue)),
      profit: toNum(at(r, idx.profit)),
      settle: at(r, idx.settle),
      regDate: at(r, idx.regDate),
      proposalMonth: at(r, idx.proposalMonth),
    });
  }

  // 집계
  const countMap = new Map<string, number>();
  for (const s of sellers) countMap.set(s.status, (countMap.get(s.status) ?? 0) + 1);
  const statusCounts = [
    ...STATUS_ORDER.filter((s) => countMap.has(s)).map((s) => ({ status: s, count: countMap.get(s)! })),
    ...[...countMap.entries()]
      .filter(([s]) => !STATUS_ORDER.includes(s))
      .map(([status, count]) => ({ status, count })),
  ];

  const total = sellers.length;
  const confirmed = sellers.filter((s) => CONFIRMED.has(s.status)).length;
  const noReply = sellers.filter((s) => s.status === "미답변").length;
  const revenue = sellers.reduce((a, s) => a + (s.revenue ?? 0), 0);
  const profit = sellers.reduce((a, s) => a + (s.profit ?? 0), 0);
  const convRate = total > 0 ? Math.round((confirmed / total) * 1000) / 10 : 0;

  const managers = [...new Set(sellers.map((s) => s.manager).filter(Boolean))].sort();
  const fields = [...new Set(sellers.map((s) => s.field).filter(Boolean))].sort();

  return {
    sellers,
    managers,
    fields,
    statusCounts,
    kpi: { total, confirmed, noReply, convRate, revenue, profit },
  };
}
