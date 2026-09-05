// 대표가 메모장에 적는 "나갈 돈" 목록을 지출계획 항목으로 변환한다.
// 예) "장효윤 약800 (10일)", "신동 모델료 4400(말일까지)", "도형 1500(10월이후)",
//     "10일 급여-신미집700, 대운1000,본사 800", "10일부터 박경배대표 매일 100만원씩 19회."

export type ParsedExpense = {
  name: string;
  amount: number;        // 원
  day: number | null;    // 지급일(null = 기본값 사용)
  lastDay: boolean;      // "말일"
  month: number | null;  // "(10월이후)" 처럼 달이 지정된 경우 1~12
  memo: string;
  raw: string;
};

export type ParseOptions = {
  unit?: "만원" | "원"; // 단위 없는 숫자의 단위 (기본 만원)
  defaultDay?: number;  // 날짜 없을 때 지급일 (기본 10)
};

const MULT: Record<string, number> = { 억: 100_000_000, 천만: 10_000_000, 백만: 1_000_000, 만: 10_000, 천: 1_000 };
// "약" 은 단어 앞(공백/줄 처음)에 있을 때만 "대략" 표시로 본다 ("경남제약 3000" 의 약은 이름의 일부).
const AMOUNT_RE = /(^약|\s약)?\s*([\d][\d,]*(?:\.\d+)?)\s*(억|천만|백만|만|천)?\s*(원)?/;

function toWon(num: string, unitTok: string | undefined, hasWon: boolean, unit: "만원" | "원"): number {
  const n = Number(num.replace(/,/g, ""));
  if (!Number.isFinite(n)) return 0;
  if (unitTok) return Math.round(n * MULT[unitTok]);
  if (hasWon) return Math.round(n);
  return Math.round(n * (unit === "만원" ? 10_000 : 1));
}

// 줄 안에서 "금액"으로 볼 숫자를 찾는다. "9월", "10일", "19회", "3명" 같은 숫자는 건너뛴다.
function findAmount(text: string): RegExpMatchArray | null {
  const re = new RegExp(AMOUNT_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (!m[2]) continue;
    const next = text.slice(m.index + m[0].length).trimStart();
    if (/^(월|일|회|시|명|개|번|차|%|층|호)/.test(next) && !m[3] && !m[4]) continue;
    // "4대보험", "3M" 처럼 숫자 뒤에 글자가 바로 붙으면 이름의 일부
    const tail = text.slice(m.index + m[0].length);
    if (!m[3] && !m[4] && /^[가-힣A-Za-z]/.test(tail)) continue;
    return m;
  }
  return null;
}

function parseParen(s: string): { day: number | null; lastDay: boolean; month: number | null; memo: string[] } {
  const out = { day: null as number | null, lastDay: false, month: null as number | null, memo: [] as string[] };
  const m = s.match(/(\d{1,2})\s*월\s*(이후|부터|말|초|중)?/);
  if (m) {
    const mo = Number(m[1]);
    if (mo >= 1 && mo <= 12) out.month = mo;
    if (m[2] === "말") out.lastDay = true;
  }
  const d = s.match(/(\d{1,2})\s*일/);
  if (d && !(m && m[0].includes(d[0]))) {
    const dd = Number(d[1]);
    if (dd >= 1 && dd <= 31) out.day = dd;
  }
  if (/말일/.test(s)) out.lastDay = true;
  out.memo.push(s.trim());
  return out;
}

function parseOne(seg: string, opts: Required<ParseOptions>, inherited: { day: number | null; memo: string[] }): ParsedExpense | null {
  let text = seg.trim().replace(/[.。]+$/, "");
  if (!text) return null;
  let day = inherited.day;
  let lastDay = false;
  let month: number | null = null;
  const memo: string[] = [...inherited.memo];

  // 괄호 안 날짜/메모
  text = text.replace(/[（(]([^()（）]*)[)）]/g, (_, inner: string) => {
    const p = parseParen(inner);
    if (p.day != null) day = p.day;
    if (p.lastDay) lastDay = true;
    if (p.month != null) month = p.month;
    memo.push(...p.memo);
    return " ";
  });

  // "매일 100만원씩 19회" → 100만 × 19
  let times = 1;
  const rep = text.match(/씩\s*(\d+)\s*회/);
  if (rep) {
    times = Number(rep[1]) || 1;
    memo.push(text.replace(/^.*?(매일|매주|매월)?\s*(\d[\d,]*\s*(?:억|천만|백만|만|천)?\s*원?\s*씩\s*\d+\s*회)/, "$1 $2").trim());
    text = text.replace(/씩\s*\d+\s*회.*$/, "");
  }

  const am = findAmount(text);
  if (!am || am.index == null) return null;
  const before = text.slice(0, am.index).trim();
  const after = text.slice(am.index + am[0].length).trim();
  let name = before.replace(/[\s:：\-–]+$/, "").replace(/\s*(매일|매주|매월)\s*$/, "").trim();
  if (!name && after) name = after; // "1000 리아이" 같은 역순
  if (!name) return null;

  const amount = toWon(am[2], am[3], !!am[4], opts.unit) * times;
  if (amount <= 0) return null;
  if (am[1]) memo.unshift("약");
  if (after && after !== name) memo.push(after);

  return {
    name,
    amount,
    day: lastDay ? null : day,
    lastDay,
    month,
    memo: Array.from(new Set(memo.filter(Boolean))).join(" · "),
    raw: seg.trim(),
  };
}

export function parseExpenseMemo(text: string, options: ParseOptions = {}): ParsedExpense[] {
  const opts: Required<ParseOptions> = { unit: options.unit ?? "만원", defaultDay: options.defaultDay ?? 10 };
  const out: ParsedExpense[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line) continue;
    if (!/\d/.test(line)) continue; // "9월 나갈곳" 같은 제목 줄

    // 줄 앞의 "10일 " / "10일부터 " → 이 줄(및 쉼표로 나뉜 항목 전체)의 지급일
    const inherited = { day: null as number | null, memo: [] as string[] };
    const lead = line.match(/^(\d{1,2})\s*일\s*(부터|까지)?\s*[:\-–]?\s*/);
    if (lead) {
      inherited.day = Number(lead[1]);
      if (lead[2]) inherited.memo.push(`${lead[1]}일${lead[2]}`);
      line = line.slice(lead[0].length);
    }

    // "급여-신미집700, 대운1000,본사 800" → 접두어 "급여" + 항목 3개
    // (단, "35,000" 같은 천 단위 쉼표는 분리하지 않는다)
    const protectedLine = line.replace(/(\d)[,，](?=\d{3}(?!\d))/g, "$1\u0001");
    const commaParts = protectedLine.split(/[,，]/).map((s) => s.replace(/\u0001/g, ",").trim()).filter(Boolean);
    let prefix = "";
    let parts = commaParts;
    if (commaParts.length > 1 && commaParts.every((p) => /\d/.test(p))) {
      const pm = commaParts[0].match(/^([^\d]+?)\s*[-–:：]\s*(.+)$/);
      if (pm) {
        prefix = pm[1].trim();
        parts = [pm[2], ...commaParts.slice(1)];
      }
    } else {
      parts = [protectedLine.replace(/\u0001/g, ",")];
    }

    for (const p of parts) {
      const item = parseOne(p, opts, inherited);
      if (!item) continue;
      if (prefix) item.name = `${prefix} - ${item.name}`;
      out.push(item);
    }
  }
  return out;
}

/** 파싱 결과 → 실제 저장 월/지급일 계산 */
export function resolveMonthDay(item: ParsedExpense, baseMonth: string, defaultDay = 10): { month: string; dueDay: number } {
  const [by, bm] = baseMonth.split("-").map(Number);
  let y = by, m = bm;
  if (item.month != null) {
    m = item.month;
    if (m < bm) y = by + 1; // 지난 달 번호면 내년
  }
  const month = `${y}-${String(m).padStart(2, "0")}`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dueDay = item.lastDay ? last : Math.min(last, Math.max(1, item.day ?? defaultDay));
  return { month, dueDay };
}
