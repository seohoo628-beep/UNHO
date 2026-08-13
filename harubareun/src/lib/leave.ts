// 연차 계산 — 시트 수식(근로기준법 제60조) 기준.
// 입사 당해년도: 월 개근 1일(첫해 최대 11일). 만 1년+: 15일, 3년 이상 매 2년 1일 가산(한도 25).
// 차감: 연차 1일, 반차 0.5일. 반차 2회 = 1일.

export const DEDUCT: Record<string, number> = {
  연차: 1,
  "반차(오전)": 0.5,
  "반차(오후)": 0.5,
};

function ymd(s: string) {
  return { y: +s.slice(0, 4), m: +s.slice(5, 7), d: +s.slice(8, 10) };
}

function daysBetween(aISO: string, bISO: string): number {
  const a = ymd(aISO);
  const b = ymd(bISO);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
}

/** 입사일부터 기준일까지 개근 완성 개월 수(월 1일 발생용). */
export function completedMonths(joinISO: string, asOfISO: string): number {
  const j = ymd(joinISO);
  const a = ymd(asOfISO);
  let months = (a.y - j.y) * 12 + (a.m - j.m);
  if (a.d < j.d) months -= 1;
  return Math.max(0, months);
}

/** 근속연수(해당 연도 연말 기준). */
export function tenureAtYearEnd(joinISO: string, year: number): number {
  return year - ymd(joinISO).y;
}

export type Grant = { kind: string; granted: number };

/** 기준연도·기준일에서 부여 구분과 부여일수(자동)를 계산. */
export function grantDays(joinISO: string, year: number, asOfISO: string): Grant {
  const tenure = tenureAtYearEnd(joinISO, year);
  // 기준일이 입사보다 이르면 아직 부여 없음.
  if (year < ymd(joinISO).y) return { kind: "입사 전", granted: 0 };
  const j = ymd(joinISO);
  if (tenure <= 0) {
    // 입사 당해년도: 월 개근 1일, 첫해 최대 11일.
    return { kind: "입사연도(월 개근 1일)", granted: Math.min(11, completedMonths(joinISO, asOfISO)) };
  }
  // 연도중 입사자의 다음 해: 비례연차 = 올림(15 × 전년 재직일수 ÷ 365).
  if (tenure === 1 && !(j.m === 1 && j.d === 1)) {
    const worked = daysBetween(joinISO, `${j.y}-12-31`) + 1; // 입사~연말(포함)
    const prorated = Math.ceil((15 * worked) / 365);
    return { kind: "비례연차(전년 입사)", granted: Math.min(15, prorated) };
  }
  // 만 1년 이상 정착: 15일 + 근속가산(3년 이상 매 2년 1일), 한도 25일.
  const gasan = tenure >= 3 ? Math.floor((tenure - 1) / 2) : 0;
  return { kind: "15일+근속가산", granted: Math.min(25, 15 + gasan) };
}

export type LeaveMember = { id: string; name: string; join_date: string; carryover: number; note: string | null };
export type LeaveUsage = { id: string; member_id: string; use_date: string; type: string };

export type LedgerRow = {
  id: string;
  name: string;
  joinDate: string;
  tenure: number;
  kind: string;
  granted: number;
  carryover: number;
  held: number; // 총 보유
  monthly: number[]; // [1월..12월] 사용
  used: number; // 사용 합계
  remaining: number; // 잔여
  note: string | null;
};

/** 대장 한 행을 계산(월별 사용 포함). */
export function computeLedger(
  members: LeaveMember[],
  usages: LeaveUsage[],
  year: number,
  asOfISO: string
): LedgerRow[] {
  return members.map((m) => {
    const { kind, granted } = grantDays(m.join_date, year, asOfISO);
    const held = granted + (m.carryover ?? 0);
    const monthly = new Array(12).fill(0);
    for (const u of usages) {
      if (u.member_id !== m.id) continue;
      if (+u.use_date.slice(0, 4) !== year) continue;
      const mon = +u.use_date.slice(5, 7);
      monthly[mon - 1] += DEDUCT[u.type] ?? 1;
    }
    const used = monthly.reduce((a, b) => a + b, 0);
    return {
      id: m.id,
      name: m.name,
      joinDate: m.join_date,
      tenure: tenureAtYearEnd(m.join_date, year),
      kind,
      granted,
      carryover: m.carryover ?? 0,
      held,
      monthly,
      used,
      remaining: held - used,
      note: m.note,
    };
  });
}
