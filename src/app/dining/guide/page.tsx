"use client";

import { Card } from "@dining/components/ui";
import { STORES } from "@dining/lib/stores";

// 점장·매니저가 별도 교육 없이 이 문서만 보고 운영할 수 있도록 만든 상세 사용 설명서.
const PLATFORM_LABEL = "운호 다이닝 매장관리";

export default function GuidePage() {
  const storeList = STORES.map((s) => `${s.emoji} ${s.name}`).join(" · ");
  return (
    <>
      <div className="page-head">
        <div>
          <h1>사용 설명서</h1>
          <p>{PLATFORM_LABEL} — 처음 쓰는 점장·매니저도 이 문서만 보고 바로 운영할 수 있도록 정리했습니다.</p>
        </div>
      </div>

      <div className="stack">
        <Card title="0. 이 플랫폼은 무엇인가요?">
          <div style={S.body}>
            매장 운영에 필요한 <b>매출·지출, 직원, 근무표, 예약, 식자재/발주, 거래처, 고정비, 손익(P&L)</b>을 한 곳에서 관리하는 도구입니다.
            <ul style={S.ul}>
              <li><b>로그인 없이</b> 받은 링크로 바로 접속합니다. (아이디/비밀번호 없음)</li>
              <li>휴대폰·태블릿·PC 어디서나 같은 링크로 열립니다. 매장에서는 휴대폰으로 매일 입력하면 됩니다.</li>
              <li>관리 매장: <b>{storeList}</b></li>
            </ul>
          </div>
        </Card>

        <Card title="1. 화면 구성 (딱 3가지만 기억)">
          <div style={S.body}>
            <ol style={S.ol}>
              <li><b>왼쪽 메뉴</b> — 기능을 고르는 곳. (휴대폰에서는 왼쪽 위 <b>☰</b> 버튼)</li>
              <li><b>맨 위 매장 선택</b> — <b>전 매장 / 개별 매장</b>을 고릅니다. 고른 매장 기준으로 모든 화면이 바뀝니다.</li>
              <li><b>오른쪽 위 ‘초기화’</b> — <span style={{ color: "var(--red)", fontWeight: 700 }}>주의!</span> 입력한 내용을 모두 지우고 예시 데이터로 되돌립니다. 평소엔 <b>누르지 마세요.</b></li>
            </ol>
          </div>
        </Card>

        <Card title="2. ⭐ 매일 할 일 — 영업 마감 후 3분 (가장 중요)">
          <div style={S.body}>
            <div style={S.step}>‘매출·지출 입력’ 메뉴에서 그날 실적을 넣습니다. 이것만 매일 하면 매출·손익·분석이 자동으로 채워집니다.</div>
            <ol style={S.ol}>
              <li>왼쪽 메뉴 <b>‘매출·지출 입력’</b> → 오른쪽 위 <b>‘+ 일일 실적 입력’</b> 클릭</li>
              <li><b>매장·날짜</b> 확인 (오늘 날짜가 기본값)</li>
              <li><b>매출</b> — POS 마감 정산서를 보고 <b>카드 / 현금 / 현금영수증</b> 금액을 각각 입력</li>
              <li><b>방문 객수(명)</b> 입력 → 객단가가 자동 계산됩니다</li>
              <li><b>지출</b> — <b>‘+ 항목 추가’</b>를 눌러 그날 지출을 <b>항목(식자재·주류·소모품 등) + 금액</b>으로 한 줄씩 입력</li>
              <li><b>외국인 유입</b> — 방문했다면 국가별 인원(중국·미국·일본·베트남·유럽·그 외) 입력</li>
              <li><b>체험단</b> — 왔다면 <b>인원 + 제공금액</b> 입력 (제공금액은 지출로 자동 반영)</li>
              <li><b>기타 특이사항</b> — 단체 예약, 클레임, 날씨, 이벤트 등 메모</li>
              <li>하단에 <b>매출·지출·순이익</b>이 자동 계산되면 <b>‘저장’</b></li>
            </ol>
            <div style={S.tip}>💡 마감 정산서의 카드+현금+현금영수증 합계와 화면의 ‘매출’이 같은지 확인하면 실수를 줄일 수 있습니다.</div>
          </div>
        </Card>

        <Card title="3. 매주 할 일">
          <div style={S.body}>
            <ul style={S.ul}>
              <li><b>근무표 작성</b> — ‘직원관리’ → 아래 <b>출근 스케줄표</b>에서 칸을 눌러 출근/퇴근 시간을 입력. ‘지난주 복사’로 한 번에 채울 수 있습니다.</li>
              <li><b>발주 확인</b> — ‘식자재관리’에서 재고가 부족한 품목(발주 필요)을 확인하고 ‘거래처관리’의 주문처로 발주.</li>
              <li><b>주간 요약 확인</b> — ‘매출·지출 입력’ 화면의 <b>‘이번주 vs 지난주’</b>로 매출·객수 흐름 점검.</li>
            </ul>
          </div>
        </Card>

        <Card title="4. 매월 할 일">
          <div style={S.body}>
            <ul style={S.ul}>
              <li><b>고정비 점검</b> — ‘고정비 관리’에서 급여·임대료 등 변동이 있으면 수정. (대시보드에 인건비/운영비로 표시됩니다)</li>
              <li><b>손익 확인</b> — ‘P&L 관리’와 대시보드 <b>‘월별 매출·손익 조회’</b>에서 달을 눌러 월 매출·영업이익 확인.</li>
              <li><b>직원 점검</b> — ‘직원관리’에서 입·퇴사, 급여, 4대보험, 근무시간대, 월 휴무 갱신. 신규 입사자는 <b>‘근로계약서’</b>에 서명본 보관.</li>
              <li><b>목표 점검</b> — 대시보드 ‘목표 달성 현황’에서 월 매출 목표 대비 진행 확인.</li>
            </ul>
          </div>
        </Card>

        <Card title="5. 메뉴별 상세 설명">
          <div style={S.body}>
            {MENU_GUIDE.map((g) => (
              <div key={g.name} style={{ marginBottom: 14 }}>
                <div style={{ fontWeight: 750, fontSize: 14.5 }}>{g.icon} {g.name}</div>
                <div className="muted" style={{ fontSize: 13.3, lineHeight: 1.7, marginTop: 2 }}>{g.desc}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="6. 근로계약서 — 새 직원이 오면">
          <div style={S.body}>
            <ol style={S.ol}>
              <li>‘근로계약서’ 메뉴 → <b>‘📄 표준근로계약서 양식’</b>을 열어 인쇄하거나 PDF로 저장</li>
              <li>직원과 함께 작성·서명</li>
              <li>서명본을 스캔하거나 사진으로 찍어 <b>‘+ 계약서 올리기’</b>로 매장·직원명과 함께 업로드</li>
            </ol>
            <div style={S.tip}>💡 계약서·자료실 파일은 <b>서버에 저장</b>되어 다른 관리자와 공유됩니다. 개인정보가 담기므로 링크 공유에 유의하세요.</div>
          </div>
        </Card>

        <Card title="7. 데이터 저장 방식 (중요)">
          <div style={S.body}>
            <ul style={S.ul}>
              <li><b>서버에 공유 저장</b>(어느 기기에서 열어도 같음): 거래처관리 · 자료실 · 근로계약서 · 미팅 일지.</li>
              <li><b>이 기기에 저장</b>(지금 쓰는 브라우저에만): 매출·지출, 직원, 근무표, 예약, 고정비 등 나머지. → <b>같은 기기에서 계속</b> 입력하세요. 다른 기기·시크릿창은 별도로 관리됩니다.</li>
              <li>‘초기화’ 버튼은 이 기기의 입력을 <b>모두 지웁니다.</b> 실수로 누르지 마세요.</li>
              <li>링크만 있으면 누구나 접속 가능하니 <b>링크 공유에 주의</b>하세요.</li>
            </ul>
          </div>
        </Card>

        <Card title="8. 잘 안 될 때">
          <div style={S.body}>
            <ul style={S.ul}>
              <li><b>입력한 게 안 보여요</b> → 맨 위 <b>매장 선택</b>이 그 매장(또는 ‘전 매장’)으로 되어 있는지 확인.</li>
              <li><b>파일 업로드가 안 돼요</b> → 초기 1회 DB 설정이 필요합니다. 본사에 문의하세요.</li>
              <li><b>숫자가 이상해요</b> → 해당 항목 ‘수정’으로 다시 확인. 잘못 넣었으면 ‘삭제’ 후 재입력.</li>
            </ul>
          </div>
        </Card>
      </div>
    </>
  );
}

const S: Record<string, React.CSSProperties> = {
  body: { fontSize: 14, lineHeight: 1.75 },
  ul: { margin: "8px 0 0", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 },
  ol: { margin: "8px 0 0", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 7 },
  step: { fontWeight: 600, marginBottom: 4 },
  tip: { marginTop: 12, background: "var(--brand-soft)", color: "var(--brand)", borderRadius: 8, padding: "10px 12px", fontSize: 13, lineHeight: 1.6 },
};

const MENU_GUIDE: { icon: string; name: string; desc: string }[] = [
  { icon: "📊", name: "대시보드", desc: "매장 전체 현황을 한눈에 봅니다. 8월 매출(목표 대비), 선택한 달의 영업이익, 오늘 예약, 발주 필요 품목, 월 고정비(인건비/운영비), 목표 달성 현황을 보여줍니다. ‘월별 매출·손익 조회’에서 달을 눌러 그 달 실적을 확인하세요." },
  { icon: "📈", name: "매출·지출 입력", desc: "매일 실적을 넣는 핵심 화면. ‘+ 일일 실적 입력’으로 카드·현금·현금영수증 매출, 객수, 지출 항목, 외국인, 체험단, 특이사항을 입력합니다. 아래 표에서 지난 기록을 수정·삭제하고, ‘⬇ CSV’로 엑셀로 내려받을 수 있습니다." },
  { icon: "👥", name: "직원관리", desc: "직원 명부와 출근 스케줄표. ‘+ 직원 등록’으로 이름·연락처·급여를 넣고, 정직원은 4대보험·근무시간대·월 휴무, 알바는 시급·근무형태(고정/일일)·1회 근무시간·지급액을 입력합니다. 아래 스케줄표는 칸을 눌러 출근/퇴근을 편집합니다." },
  { icon: "📄", name: "근로계약서", desc: "표준근로계약서 양식을 내려받아 작성하고, 직원별 서명본 파일을 업로드해 보관합니다. (서버 공유 저장)" },
  { icon: "📅", name: "예약관리", desc: "일자별 예약을 등록·관리합니다. ‘+ 예약 추가’로 시간·인원·채널·상태(확정/대기/착석/취소/노쇼)를 기록하고, 주간 예약 현황과 노쇼율을 봅니다." },
  { icon: "📦", name: "식자재관리", desc: "품목별 재고와 적정재고(par)를 관리합니다. 재고가 적정 이하인 품목은 ‘발주 필요’로 표시됩니다." },
  { icon: "🤝", name: "거래처관리", desc: "식자재·주류·인테리어·보수·발렛 등 거래처와 온라인 주문처 링크를 보관합니다. (서버 공유 저장)" },
  { icon: "📣", name: "마케팅관리", desc: "채널별 캠페인의 예산·집행비·도달·전환을 관리하고 전환당 비용을 봅니다." },
  { icon: "💰", name: "P&L 관리", desc: "월별 손익계산서. 매출·식자재·인건비·임대료·관리비·마케팅·기타로 나눠 영업이익과 이익률을 봅니다. ‘+ 월 실적 입력’으로 월 단위 실적을 넣습니다." },
  { icon: "🏦", name: "고정비 관리", desc: "매달 나가는 고정비를 인건비/운영비로 나눠 입력합니다. 합계와 비중이 대시보드에 자동 표시됩니다." },
  { icon: "🎯", name: "운영기획", desc: "이달의 목표(매출·원가율 등)와 매장 운영 액션 태스크(담당·기한·상태)를 관리합니다." },
  { icon: "📌", name: "전달사항", desc: "본사·매장 공지를 등록·확인합니다. 중요 공지는 상단 고정할 수 있습니다." },
  { icon: "📝", name: "미팅·회의 일지", desc: "회의 내용을 기록하거나 파일을 올리면 AI가 요약·정리해 줍니다. (서버 공유 저장)" },
  { icon: "📁", name: "자료실", desc: "디자인·메뉴·포스터·영상·기획안 등 파일을 직접 업로드해 보관·공유합니다. 여러 파일을 한 번에 올릴 수 있습니다." },
];
