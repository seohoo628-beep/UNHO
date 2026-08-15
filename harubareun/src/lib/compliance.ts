import type { Brand, ComplianceFinding } from "@/lib/types";

// ============================================================================
// 규제 검수 (자동). AI 산출물 본문을 브랜드 규제 근거에 따라 규칙 기반으로 검사한다.
// 통과하지 못하면 승인 큐에 올리지 않고, 지적 문구와 대체 제안을 함께 돌려준다.
//
// 규제 근거는 brands.regulation 에서 읽는다. 카테고리로 유추하지 않는다.
// ============================================================================

type Rule = {
  label: string; // 규칙 이름
  terms: (string | RegExp)[]; // 지적 대상
  reason: string;
  suggestion: string;
  applies: (brand: Brand) => boolean;
};

const reg = (b: Brand) => (b.regulation ?? "") + " " + (b.category ?? "");

const isCosmetic = (b: Brand) => /화장품/.test(reg(b));
const isHealthFood = (b: Brand) => /건강기능식품/.test(reg(b));
const isGeneralFood = (b: Brand) =>
  /식품표시광고법/.test(reg(b)) && !isHealthFood(b);
const isMedical = (b: Brand) => /의료/.test(reg(b));

// 전 브랜드 공통 규칙 ---------------------------------------------------------
const GLOBAL_RULES: Rule[] = [
  {
    label: "법적 확약·무한책임",
    terms: ["보장", "전액 책임", "무조건", "평생 책임", "100% 환불 보장", "책임집니다"],
    reason: "무한책임으로 읽히는 확약 표현은 금지어다.",
    suggestion: "조건과 범위를 명시한 서술로 바꾼다. 예: '교환·반품은 수령 후 7일 이내 가능'.",
    applies: () => true,
  },
  {
    label: "근거 없는 최상급·절대 표현",
    terms: ["최고의", "최고 ", "국내 최고", "세계 최초", "국내 유일", "유일무이", "제일 좋은", "완벽한", "기적", "1위"],
    reason: "객관적 근거 없이 최상급·절대 표현을 쓸 수 없다.",
    suggestion: "숫자·출처가 있는 사실로 대체한다. 예: '재구매율 42%(2026년 상반기 자사 집계)'.",
    applies: () => true,
  },
  {
    label: "의미 없는 수식어",
    terms: ["다양한", "혁신적인", "혁신적", "최상의"],
    reason: "정보가 없는 수식어는 쓰지 않는다. 형용사보다 숫자.",
    suggestion: "구체적인 수치나 항목으로 대체한다. 예: '색상 6종' '3단계 구성'.",
    applies: () => true,
  },
  {
    label: "AI 티 나는 말투",
    terms: ["해보세요", "놀랍게도", "지금 바로", /!{2,}/],
    reason: "과장·권유형 상투구와 과도한 느낌표는 금지한다.",
    suggestion: "담백한 평서형으로 바꾼다. 느낌표는 문단당 최대 1회.",
    applies: () => true,
  },
  {
    label: "이모지",
    // 그림 이모지·기호만 잡는다. 화살표(→ ← 등, U+2190–U+21FF)는 컷 구성 등에서
    // 정상적으로 쓰이므로 제외한다.
    terms: [/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u],
    reason: "이모지는 전면 금지다.",
    suggestion: "이모지를 제거한다.",
    applies: () => true,
  },
  {
    label: "미완성 자리표시자",
    terms: [/\{\{.*?\}\}/, "TODO", "XXX", "홍길동", "ㅇㅇㅇ", "lorem"],
    reason: "미완성 자리표시자를 남기지 않는다.",
    suggestion:
      "실제 값으로 채우거나, 금액처럼 대표 확정이 필요한 자리는 [   ]로 비우고 확인 필요 항목에 올린다.",
    applies: () => true,
  },
];

// 화장품법: 의료기기·의약품 오인 표현 금지 ------------------------------------
const COSMETIC_RULES: Rule[] = [
  {
    label: "의약품·의료 오인 (화장품법)",
    terms: ["치료", "완치", "의약품", "염증 제거", "여드름 치료", "아토피", "흉터 제거", "세포 재생", "재생시켜"],
    reason: "화장품은 질병 치료·의약품 효능을 표방할 수 없다.",
    suggestion: "화장품 표시·광고 범위의 표현으로 바꾼다. 예: '피부 진정에 도움' 대신 사용감 서술.",
    applies: isCosmetic,
  },
  {
    label: "의료기기 오인 (화장품법)",
    terms: ["의료기기", "시술급", "병원급", "리프팅 시술", "레이저급"],
    reason: "기기·시술로 오인될 표현은 금지한다(리앤밤 등 기기 연계 브랜드 특히 주의).",
    suggestion: "홈케어 사용 맥락으로 서술한다. 예: '집에서 쓰는 데일리 케어 디바이스'.",
    applies: isCosmetic,
  },
];

// 건강기능식품법: 인정 기능성 범위 내, 질병 예방·치료 표현 금지 ----------------
const HEALTH_FOOD_RULES: Rule[] = [
  {
    label: "질병 예방·치료 (건강기능식품법)",
    terms: ["예방", "치료", "완치", "억제", "낫게", "질병", "고혈압 개선", "당뇨 개선"],
    reason: "건강기능식품은 질병의 예방·치료를 표방할 수 없다.",
    suggestion: "인정받은 기능성 문구를 그대로 인용한다. 임의 효능 서술을 붙이지 않는다.",
    applies: isHealthFood,
  },
  {
    label: "단정적 효능 (건강기능식품법)",
    terms: ["낮춰줍니다", "낮춰 준다", "개선됩니다", "좋아집니다", "빠지는", "살이 빠"],
    reason: "효능을 단정하는 서술은 인정 기능성 범위를 벗어난다.",
    suggestion: "상황·섭취 맥락으로 서술하고 효능 단정은 피한다.",
    applies: isHealthFood,
  },
];

// 일반식품(식품표시광고법): 기능성 표현 불가 ----------------------------------
// 상세페이지 검수 기준 A/B/C 반영 — A등급(질병·기능성 표방, 허위 실적)은 전면 삭제 대상.
const GENERAL_FOOD_RULES: Rule[] = [
  {
    label: "기능성 표현 (식품표시광고법)",
    terms: ["효능", "효과", "예방", "치료", "다이어트", "살 빠", "혈당을 낮", "혈압을 낮", "면역력"],
    reason: "일반식품은 기능성·효능 표현을 쓸 수 없다.",
    suggestion: "성분·형태·섭취 상황을 기술적으로 설명한다. 규제 문구가 있으면 그대로 인용한다.",
    applies: isGeneralFood,
  },
  {
    label: "질병명·신체기능 동사 (A등급·전면삭제)",
    // 검수기준 A등급: 질병명 + 신체기능을 나타내는 동사. 형사처벌 조항(식품표시광고법 제8조).
    terms: ["탈모", "비만", "억제", "차단", "분해", "순환", "배변", "흡수저해", "개선", "완화", "강화", "노화"],
    reason: "질병명·신체기능 동사는 일반식품 표시광고 A등급(전면 삭제) 대상이다.",
    suggestion: "주어를 제품이 아닌 '원료'로 옮기고, 원료의 구성(무엇으로 이루어져 있는가) 중심으로 서술한다. 신체 변화 동사는 쓰지 않는다.",
    applies: isGeneralFood,
  },
  {
    label: "허위 실적·과장 (A등급·전면삭제)",
    // 런칭 전 제품에 존재할 수 없는 실적, 근거 없는 최상급·인증 표기.
    terms: ["재구매율", "누적판매", "누적 판매", "가품주의", "가품 주의", "국내최초", "국내 최초", "세계가 인정", "FDA"],
    reason: "존재하지 않는 실적·근거 없는 인증/최상급 표기는 허위광고(A등급)다.",
    suggestion: "런칭 전에는 실적 수치를 쓰지 않는다. 레퍼런스 제품의 문구(예: '국내최초 129시간')를 그대로 옮기지 않는다.",
    applies: isGeneralFood,
  },
];

// F&B(식품표시광고법/원산지표시법) --------------------------------------------
const FNB_RULES: Rule[] = [
  {
    label: "효능·기능성 표방 (식품표시광고법)",
    terms: ["효능", "다이어트에 좋", "건강해지는", "면역"],
    reason: "외식 메뉴에 효능·기능성을 붙이지 않는다.",
    suggestion: "맛·조리·원산지 사실로 서술한다.",
    applies: (b) => /원산지표시법|F&B/.test(reg(b)),
  },
];

// 의료(엣지라인의원): 자동 생성 자체를 막는다 --------------------------------
const MEDICAL_RULES: Rule[] = [
  {
    label: "의료광고 사전심의 대상",
    terms: [/[\s\S]+/], // 본문 전체
    reason:
      "의료광고 사전심의 대상 브랜드다. AI 자동 생성 대상이 아니므로 검수를 통과시키지 않는다.",
    suggestion: "엣지라인의원 콘텐츠는 사전심의를 거친 문구로만 사람이 직접 작성한다.",
    applies: isMedical,
  },
];

function matchTerm(body: string, term: string | RegExp): string | null {
  if (typeof term === "string") {
    return body.includes(term) ? term : null;
  }
  const m = body.match(term);
  return m ? m[0].slice(0, 40) : null;
}

export function runComplianceCheck(
  brand: Brand,
  body: string
): { verdict: "pass" | "fail"; findings: ComplianceFinding[] } {
  const rules = [
    ...MEDICAL_RULES,
    ...GLOBAL_RULES,
    ...COSMETIC_RULES,
    ...HEALTH_FOOD_RULES,
    ...GENERAL_FOOD_RULES,
    ...FNB_RULES,
  ];

  const findings: ComplianceFinding[] = [];
  const seen = new Set<string>();

  for (const rule of rules) {
    if (!rule.applies(brand)) continue;
    for (const term of rule.terms) {
      const hit = matchTerm(body, term);
      if (hit) {
        const key = rule.label + "::" + hit;
        if (seen.has(key)) continue;
        seen.add(key);
        findings.push({
          phrase: hit,
          reason: rule.reason,
          suggestion: rule.suggestion,
          rule: rule.label,
        });
      }
    }
  }

  return { verdict: findings.length === 0 ? "pass" : "fail", findings };
}
