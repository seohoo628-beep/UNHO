// 표준 계약서 초안 프롬프트(순수 함수, 테스트 대상). AI 호출은 contracts/actions.ts.

export type DraftParty = { name: string; bizNo?: string; ceo?: string; address?: string };
export type DraftInput = {
  kind: string; title: string;
  ours: DraftParty; theirs: DraftParty;
  startDate?: string; endDate?: string; autoRenew?: boolean; amount?: number | null;
  purpose: string;   // 계약 목적·대상(무엇을)
  payment: string;   // 대금·정산 조건
  delivery: string;  // 납기·수행·제공 조건
  special: string;   // 특약·추가 요청
};

/** 유형별 반드시 넣을 조항 */
export const KIND_CLAUSES: Record<string, string[]> = {
  "공급": ["공급 품목·규격·수량", "발주·납품 절차와 장소", "검수·하자 처리·반품", "대금 지급 시기·방법", "소유권·위험 이전", "품질 보증과 제조물 책임"],
  "유통·입점": ["판매 채널·지역과 독점 여부", "공급가·판매가 정책", "정산 주기·수수료", "재고·반품 조건", "상표·판촉물 사용", "최소 발주 또는 목표"],
  "위탁생산(OEM)": ["제조 품목·사양·원료 공급 주체", "최소 생산 수량·리드타임", "품질 기준·검사·불량 처리", "지식재산권·처방 귀속", "단가·지급 조건", "인허가·표시사항 책임"],
  "용역·대행": ["용역 범위·산출물", "수행 기간·일정", "검수·수정 횟수", "대금·지급 시기", "산출물 저작권 귀속", "재위탁 제한"],
  "NDA": ["비밀정보의 정의와 제외", "사용 목적 제한", "보관·반환·파기", "유효 기간과 존속", "위반 시 손해배상·금지청구"],
  "임대": ["목적물·용도", "보증금·차임·관리비", "임대차 기간·갱신", "원상복구", "수선·비용 부담"],
  "근로": ["근로계약 기간·근무 장소·업무", "소정근로시간·휴게·휴일", "임금 구성·지급일·방법", "연차유급휴가", "사회보험", "근로기준법 제17조 서면 명시 사항"],
  "투자": ["투자 금액·방식·주식 종류", "투자 조건과 선행조건", "진술 및 보장", "투자자 권리(동의권·정보요구권)", "주식 처분 제한", "위반 시 조치"],
  "기타": ["계약 목적과 범위", "각 당사자의 의무", "대금·정산", "계약 기간"],
};

const partyLine = (label: string, p: DraftParty) =>
  `${label}: ${p.name}${p.bizNo ? ` (사업자번호 ${p.bizNo})` : ""}${p.ceo ? `, 대표 ${p.ceo}` : ""}${p.address ? `, 주소 ${p.address}` : ""}`;

export function buildDraftPrompt(d: DraftInput): { system: string; user: string } {
  const clauses = KIND_CLAUSES[d.kind] ?? KIND_CLAUSES["기타"];
  const system = `너는 한국 중소기업 실무용 표준 계약서를 작성하는 계약 담당자다.
규칙:
- 대한민국 법률과 일반 실무 관행에 맞는 표준 계약서 초안을 쓴다. 조항은 '제1조(목적)' 형식으로 번호를 붙인다.
- 입력에 없는 금액·날짜·수량·비율은 지어내지 않고 [   ]로 비워 둔다. 입력에 있는 값은 그대로 쓴다.
- 한쪽에 일방적으로 유리하지 않은 균형 잡힌 표준 문안을 기본으로 하되, 갑(운호컴퍼니 측)의 권리 보호 조항을 빠뜨리지 않는다.
- 일반 조항(계약 기간·해지·손해배상·비밀유지·불가항력·양도 금지·분쟁 해결·관할 법원·계약서 보관)을 포함한다.
- 마크다운 기호(#, **, 표)를 쓰지 않는다. 일반 텍스트로, 조항 사이에 빈 줄을 둔다.
- 맨 앞에 계약서 제목 한 줄, 맨 끝에 작성일과 갑·을 기명날인란을 둔다. 날인란 뒤에는 아무 문구도 덧붙이지 않는다.`;
  const user = `[계약 유형] ${d.kind}
[계약명] ${d.title}
[당사자] ${partyLine("갑", d.ours)} / ${partyLine("을", d.theirs)}
[기간] ${d.startDate || "[   ]"} ~ ${d.endDate || "[   ]"}${d.autoRenew ? " (만료 1개월 전 서면 이의가 없으면 동일 조건 1년 자동 연장)" : ""}
[계약 금액] ${d.amount ? `${d.amount.toLocaleString("ko-KR")}원 (부가가치세 별도 여부는 [   ])` : "[   ]"}
[목적·대상] ${d.purpose || "[   ]"}
[대금·정산 조건] ${d.payment || "[   ]"}
[납기·수행 조건] ${d.delivery || "[   ]"}
[특약·추가 요청] ${d.special || "없음"}

이 유형에 반드시 넣을 조항: ${clauses.join(" / ")}

위 조건으로 표준 계약서 전문을 작성하라.`;
  return { system, user };
}
