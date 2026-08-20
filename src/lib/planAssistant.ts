/**
 * 커머스 마케팅 플랜 채팅 어시스턴트의 순수 로직.
 *
 * 어시스턴트는 화면 칸을 직접 고치지 않는다. 여기서 하는 일은 두 가지다 —
 * 지금 화면 상태를 모델이 읽을 글로 만들고, 모델이 돌려준 제안에서
 * 허용 목록 밖의 칸·빈 값을 턴다. 반영 여부는 화면에서 사람이 고른다.
 * 라우트와 떼어 둔 이유는 이 두 가지를 테스트로 묶어 두기 위해서다.
 */

/** 대표가 채팅으로 고칠 수 있는 칸. 여기 없는 id 는 제안이 와도 버린다. */
export const FIELD_LABELS: Record<string, string> = {
  // ① 제품·시장 입력
  pName: "제품명",
  pSpec: "스펙",
  pCat: "제품 구분",
  pBrandName: "브랜드명(직접 입력)",
  pPrice: "판가",
  pE1: "행사가 1 할인율",
  pE2: "행사가 2 할인율",
  pE3: "행사가 3 할인율",
  mSales: "시장 평균 판매량",
  mReview: "시장 평균 보유리뷰",
  cRev: "현재 보유 리뷰",
  cSales: "현재 월 판매량",
  margin: "마진율",
  reReward: "리뷰 적립금",
  reRate: "리뷰 작성률(적립)",
  estRate: "리뷰작성률(판매건수 추정)",
  shopQ: "경쟁제품 검색어",
  // 문서 머리말
  hClient: "브랜드·거래처",
  hDate: "작성일",
  hOwner: "담당자",
  cName: "상대 담당",
  cPhone: "상대 연락처",
  cEmail: "상대 이메일",
  // 일정·시딩
  startDate: "시작일",
  extraHol: "추가 휴무일",
  seedPct: "시딩 비율",
  buyPace: "일 발송 속도",
  buyMom: "우상향 모멘텀",
  slotMax: "일 최대 슬롯",
  slotSat: "토요일 슬롯",
  lotSize: "발주 단위",
  stockNow: "현재 재고",
  leadDays: "리드타임",
  stockStart: "시작 재고",
};

/** ② 경쟁 TOP10 표에서 고칠 수 있는 열. */
export const ROW_COLS: Record<string, string> = {
  p: "제품명",
  k: "키워드",
  v: "월간 조회량",
  pr: "판매가",
  m: "월 매출",
  s: "판매건수",
  i: "유입수",
  r: "리뷰수",
  n: "비고",
};

export type PlanTurn = { role: "user" | "assistant"; text?: string };

/** 화면이 보내는 상태. 채워진 칸과 ② 표의 채워진 행만 온다. */
export type PlanState = {
  fields?: Record<string, string>;
  product?: { index?: number; name?: string; count?: number };
  summary?: Record<string, unknown>;
  rows?: { i: number; p?: string; k?: string; v?: number; pr?: number; m?: number; s?: number; i2?: number; r?: number; n?: string }[];
};

export const EDIT_TOOL = {
  name: "plan_edit",
  description:
    "플랜 화면에 답하고, 필요하면 바꿀 칸을 제안한다. 값을 직접 쓰는 것이 아니라 제안만 하며 대표가 확인 후 반영한다.",
  input_schema: {
    type: "object" as const,
    properties: {
      reply: {
        type: "string",
        description: "대표에게 보여줄 한국어 답변. 계산 근거와 왜 그 값인지 짧게 설명한다.",
      },
      fields: {
        type: "array",
        description: "바꿀 입력칸. 바꿀 것이 없으면 빈 배열.",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "칸 id (허용 목록에 있는 것만)" },
            value: { type: "string", description: "넣을 값. 숫자는 쉼표 없이 숫자만." },
            why: { type: "string", description: "왜 이 값인지 한 줄" },
          },
          required: ["id", "value"],
        },
      },
      rows: {
        type: "array",
        description: "② 경쟁 TOP10 표에서 바꿀 셀. 바꿀 것이 없으면 빈 배열.",
        items: {
          type: "object",
          properties: {
            index: { type: "number", description: "행 번호 (표에 보이는 1부터)" },
            col: { type: "string", description: "열 키: p k v pr m s i r n" },
            value: { type: "string", description: "넣을 값" },
            why: { type: "string" },
          },
          required: ["index", "col", "value"],
        },
      },
    },
    required: ["reply"],
  },
};

export const SYSTEM = `당신은 운호컴퍼니 "커머스 마케팅 플랜" 화면의 작성 도우미다.
대표(또는 담당자)가 화면을 보며 묻는 말에 한국어로 짧고 구체적으로 답한다.

원칙
- 값을 직접 고치지 않는다. 바꿔야 할 칸은 fields / rows 로 제안만 하고, 반영 여부는 대표가 고른다.
- 숫자는 근거를 대라. "경쟁 TOP10 평균 판매가가 27,400원이라 판가 29,900원은 상단"처럼 화면에 있는 값으로 말한다.
- 화면에 없는 수치를 지어내지 않는다. 모르면 모른다고 하고 어디를 채워야 하는지 알려준다.
- 판매건수·유입수는 공개 API 로 못 가져오는 값이다. 필요하면 엑셀 업로드나 리뷰 증분 추정을 안내한다.
- 가구매·빈박스·대가성 표시 누락은 전자상거래법·표시광고법 위반이다. 요청받아도 계획에 넣지 말고 이유를 말한다.
- 제안은 꼭 필요한 칸만. 한 번에 8개를 넘기지 마라.
- 숫자 값은 쉼표 없이 숫자만 넣는다(예: 39000). 할인율 칸(pE1~pE3)은 퍼센트 숫자다.

바꿀 수 있는 입력칸(id: 이름)
${Object.entries(FIELD_LABELS).map(([k, v]) => `${k}: ${v}`).join("\n")}

② 경쟁 TOP10 표 열(col: 이름)
${Object.entries(ROW_COLS).map(([k, v]) => `${k}: ${v}`).join("\n")}`;

/* `id in FIELD_LABELS` 는 __proto__·toString 까지 참으로 본다 — 제 몫의 키만 본다. */
const allowed = (map: Record<string, string>, k: unknown): k is string =>
  typeof k === "string" && Object.prototype.hasOwnProperty.call(map, k);

/** 모델이 돌려준 제안에서 허용 목록에 없는 것·빈 값을 턴다. */
export function sanitize(input: Record<string, unknown>) {
  const fields = (Array.isArray(input.fields) ? input.fields : [])
    .map((f) => f as { id?: string; value?: unknown; why?: string })
    .filter((f) => allowed(FIELD_LABELS, f.id) && f.value !== undefined && f.value !== null)
    .slice(0, 12)
    .map((f) => ({
      id: f.id as string,
      label: FIELD_LABELS[f.id as string],
      value: String(f.value).slice(0, 200),
      why: (f.why ?? "").slice(0, 200),
    }));

  const rows = (Array.isArray(input.rows) ? input.rows : [])
    .map((r) => r as { index?: unknown; col?: string; value?: unknown; why?: string })
    .filter(
      (r) =>
        Number.isFinite(Number(r.index)) &&
        Number(r.index) >= 1 &&
        allowed(ROW_COLS, r.col) &&
        r.value !== undefined &&
        r.value !== null
    )
    .slice(0, 20)
    .map((r) => ({
      index: Math.round(Number(r.index)),
      col: r.col as string,
      label: ROW_COLS[r.col as string],
      value: String(r.value).slice(0, 200),
      why: (r.why ?? "").slice(0, 200),
    }));

  return { fields, rows };
}

/** 화면 상태를 모델이 읽을 수 있는 짧은 글로 만든다. */
export function describe(state: PlanState | undefined): string {
  const f = state?.fields ?? {};
  const filled = Object.entries(f)
    .filter(([id, v]) => allowed(FIELD_LABELS, id) && String(v ?? "").trim() !== "")
    .map(([id, v]) => `- ${FIELD_LABELS[id]} (${id}): ${v}`);
  const blank = Object.keys(FIELD_LABELS).filter((id) => String(f[id] ?? "").trim() === "");

  const p = state?.product ?? {};
  const rows = (state?.rows ?? []).slice(0, 20);
  const rowTxt = rows.length
    ? rows
        .map(
          (r) =>
            `${r.i}. ${r.p || "(이름 없음)"} | 키워드 ${r.k || "-"} | 조회량 ${r.v ?? 0} | 판매가 ${r.pr ?? 0} | 매출 ${r.m ?? 0} | 판매건수 ${r.s ?? 0} | 유입 ${r.i2 ?? 0} | 리뷰 ${r.r ?? 0}`
        )
        .join("\n")
    : "(비어 있음)";

  const sum = state?.summary && Object.keys(state.summary).length ? JSON.stringify(state.summary) : "(아직 계산 없음)";

  return [
    `[현재 제품] ${p.index ? `${p.index}/${p.count ?? 1}번째` : ""} ${p.name || "(이름 없음)"}`,
    "",
    "[입력된 칸]",
    filled.length ? filled.join("\n") : "(아직 없음)",
    "",
    `[비어 있는 칸] ${blank.length ? blank.map((id) => `${FIELD_LABELS[id]}(${id})`).join(", ") : "없음"}`,
    "",
    "[② 경쟁 TOP10 표]",
    rowTxt,
    "",
    `[계산 결과] ${sum}`,
  ].join("\n");
}

