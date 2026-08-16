import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// 커머스 운영 프레임 — D2C(스마트스토어·자사몰) 기준 프레임을 하루바른(건기식)·나아(화장품)에
// 맞춰 재구성한 내부 플레이북. 정적 참고 자료(테이블·상태 없음).

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 16, marginBottom: 14 }}>
      <div style={{ fontWeight: 800, fontSize: 15.5 }}>{title}</div>
      {sub && <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{sub}</div>}
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  );
}

const chip = { display: "inline-block", background: "rgba(99,102,241,.14)", color: "#a5b4fc", borderRadius: 6, padding: "1px 7px", fontSize: 11.5, fontWeight: 800 } as const;
const li: React.CSSProperties = { fontSize: 13, lineHeight: 1.65 };

export default async function Page() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");
  if (user.role === "guest") redirect("/partner");

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>📚 커머스 운영 프레임</h1>
          <p>D2C(스마트스토어·자사몰) 운영 프레임을 하루바른(건기식·일반식품)·나아(화장품)에 맞춰 정리한 내부 플레이북. 신제품 기획·상세페이지·이벤트·리뷰·유통 진입의 공통 기준.</p>
        </div>
      </div>

      <Card title="1. 매출 목표 역산 6단계" sub="연 단위 목표를 실행 단위로 내려야 인력·재고·광고예산이 자동으로 결정된다.">
        <ol style={{ margin: 0, paddingLeft: 18 }}>
          <li style={li}><b>연 매출</b> → 사업 규모·자금 조달 필요액</li>
          <li style={li}><b>월 매출</b>(연÷12) → 월별 캠페인 강도</li>
          <li style={li}><b>일평균</b>(월÷30) → 일 단위 관리 지표</li>
          <li style={li}><b>평일/주말 분리</b> → 광고 예산 배분·발송 인력 배치</li>
          <li style={li}><b>인당 매출</b>(월÷인원) → 적정 인원·채용 시점</li>
          <li style={li}><b>고정판관비/기대수익률</b>(매출 대비 %) → 손익 방어선</li>
        </ol>
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>현재 설정: 하루바른·나아 각 월 20억(연 240억) → <b>목표 대시보드</b>에서 관리. 인당·기대수익률은 확정 후 대입.</div>
      </Card>

      <Card title="2. 제품 채택 기준 — 통과 못 하면 만들지 않는다" sub="신제품을 감으로 고르지 않기 위한 필터 8가지.">
        <ol style={{ margin: 0, paddingLeft: 18 }}>
          <li style={li}>객단가 3만원↑, 1인 구매액 5만원↑이 나오는가</li>
          <li style={li}>재구매가 발생하는가 (주기 2주~2개월 이상적)</li>
          <li style={li}>재구매가 없다면 SKU 확장(맛·용량·색상·사이즈)이 가능한가</li>
          <li style={li}>메인 쇼핑 키워드 검색량이 월 10만↑인가</li>
          <li style={li}>카테고리 1~3위가 프리미엄인가 (가격 깨진 시장은 진입 X)</li>
          <li style={li}>대형 키워드 외 중·소형 키워드로도 확장 가능한가</li>
          <li style={li}>유통기한 1~2년·상온·파손 낮음·부피 작음 (수출 전제)</li>
          <li style={li}>패키지가 경쟁 상품 대비 눈에 띄는가</li>
        </ol>
        <div style={{ marginTop: 10 }}>
          <span style={chip}>차별화 근거 최소 1개 확보</span>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>최초·최다·최고·최저·특허·독점·제조공법·주원료·주요소재·원산지·색상·맛·패키지·인증·논문·공신력 인물·디자인 — 없으면 가격 경쟁으로 밀린다. <b>단, 최상급 표현은 실증자료가 있을 때만.</b></div>
        </div>
      </Card>

      <Card title="3. 원가율·판매가 구조 — 광고룸을 먼저 확보한다" sub="공장 견적 받는 시점에 손익 구조부터 대입. 구조가 안 나오면 사양을 바꾼다.">
        <div style={{ overflowX: "auto" }}>
          <table className="tbl">
            <thead><tr><th>역할</th><th>원가율</th><th>판매가대</th><th>목적</th></tr></thead>
            <tbody>
              <tr><td>미끼 제품</td><td>70% 내외</td><td>1만원대</td><td>신규 유입·첫 구매 전환</td></tr>
              <tr><td>메인 제품</td><td>30% 내외</td><td>3만원대</td><td>수익 창출·광고 여력</td></tr>
              <tr><td>서브(기획) 제품</td><td>50% 내외</td><td>5만원대 구성</td><td>객단가 인상</td></tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="4. 4P 인덱스 — 만들기 전에 표로 채운다">
        <div className="grid cols-2" style={{ gap: 10 }}>
          <div className="card" style={{ padding: 12 }}><span style={chip}>Product</span><div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>카테고리·형태(고체/액체/파우더)·유통기한·파손위험·수출규격·재구매주기·용량/맛 확장성</div></div>
          <div className="card" style={{ padding: 12 }}><span style={chip}>Place</span><div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>자사몰·스마트스토어·오픈마켓·폐쇄몰·공동구매·B2B·해외 플랫폼·수출</div></div>
          <div className="card" style={{ padding: 12 }}><span style={chip}>Price</span><div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>원가율·판매가대·미끼/메인/기획 구분</div></div>
          <div className="card" style={{ padding: 12 }}><span style={chip}>Promotion</span><div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>적립금·쿠폰·1+1·즉시할인·사은품·기획전 코드</div></div>
        </div>
      </Card>

      <Card title="5. 재구매 구조 설계" sub="재구매가 없으면 광고비와 매출이 1:1로 붙어 끝까지 함께 오른다.">
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li style={li}><b>하루바른(건기식·고형차)</b> — 1~2개월 주기. <b>3개월·6개월 정기구독 구성을 기본</b>으로. 정기구독 설계 우선순위 1순위.</li>
          <li style={li}><b>나아(화장품)</b> — 소진 주기에 맞춘 리필·세트 구성. 톤업·선크림은 계절 캠페인(자외선 시즌)과 연동.</li>
          <li style={li}>재구매가 약한 품목은 소모품·리필 라인을 붙여 <b>진입 상품 → 수익 상품(면도기 모델)</b> 구조로 재설계.</li>
        </ul>
      </Card>

      <Card title="6. 상세페이지 체크리스트 10">
        <ol style={{ margin: 0, paddingLeft: 18 }}>
          <li style={li}>타겟을 뾰족하게 (범용 타겟은 전환 안 됨)</li>
          <li style={li}>제품 자랑이 아니라 <b>고객 베네핏</b>으로</li>
          <li style={li}>페인포인트 → 자사 솔루션 구조 필수</li>
          <li style={li}>USP 최소 1개 명시</li>
          <li style={li}>일상 언어로 (전문 용어 나열 = 이탈)</li>
          <li style={li}>육하원칙으로 정보 배치</li>
          <li style={li}>동류 찾기 — 타겟이 자기와 같은 부류로 볼 모델·사진</li>
          <li style={li}>비포·애프터 가능하면 전면 배치</li>
          <li style={li}>Q&amp;A 반복 질문을 상단으로</li>
          <li style={li}>사진·영상·상세 제작비는 줄이지 않는다</li>
        </ol>
        <div className="card" style={{ padding: 10, marginTop: 10, borderLeft: "3px solid var(--owner, #ef4444)" }}>
          <div style={{ fontSize: 12.5, fontWeight: 700 }}>⚠ 표시광고 주의</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>하루바른(일반식품·건기식)은 질병·기능성 표방 금지, 나아(화장품)는 의약품적 효능·치료 암시 금지. 비포·애프터는 화장품·의료에서 규제 대상. 상세페이지 확정 전 <b>런칭준비 → 상세페이지 수정안(A/B/C 기준)</b>으로 검수.</div>
        </div>
      </Card>

      <Card title="7. 이벤트 기획 3요소 — 명분 × 기간 × 수량" sub="셋 중 하나라도 빠지면 이벤트가 아니라 그냥 할인이다.">
        <div className="muted" style={{ fontSize: 12.5 }}>예: [명분] 신학기 기념 → [기간] 3일 한정 → [수량] 선착순 200개</div>
        <ul style={{ margin: "10px 0 0", paddingLeft: 18 }}>
          <li style={li}>최소 4~6주치 이벤트 캘린더를 미리 짠다 (커머스는 24시간)</li>
          <li style={li}>성과 난 이벤트는 주/월/분기 정례로 고정</li>
          <li style={li}>객단가 내리는 이벤트 X — 단품 인하가 아니라 <b>2개 이상 구성</b>으로</li>
          <li style={li}>강한 펀치·약한 펀치를 섞는다 (할인 일변도 금지)</li>
          <li style={li}>MD가 반응하는 단어: <b>&ldquo;최초 런칭&rdquo;, &ldquo;매출 레퍼런스&rdquo;</b></li>
        </ul>
        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table className="tbl">
            <thead><tr><th>방식</th><th>같은 5만원, 노출가</th><th>판단</th></tr></thead>
            <tbody>
              <tr><td>즉시할인</td><td>5만원</td><td>가격이 깨져 보임. 정가 복귀 어려움</td></tr>
              <tr><td>쿠폰</td><td>10만원</td><td>정가 유지. <b>기본값</b></td></tr>
              <tr><td>적립</td><td>10만원</td><td>정가 유지 + 재구매 유도</td></tr>
              <tr><td>1+1</td><td>10만원</td><td>정가 + 객단가 유지. 소모품 라인 최적</td></tr>
            </tbody>
          </table>
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>→ <b>이벤트 관리</b> 폴더에서 명분·기간·목표수량으로 등록·집계.</div>
      </Card>

      <Card title="8. 객단가 인상 — 기획전 코드 실험">
        <ol style={{ margin: 0, paddingLeft: 18 }}>
          <li style={li}>단일 상품에 여러 구성 코드를 동시에 (5만·10만·15만·20만원대)</li>
          <li style={li}>구성별로 가격 메리트·사은품을 다르게</li>
          <li style={li}>반응 구간(메리트 존)을 찾는다 — 1,000원씩 올리며 끊기는 지점 확인</li>
          <li style={li}>승리 코드만 남기고 정리. 리뷰 쌓인 코드는 죽이지 말고 전환</li>
          <li style={li}>코드 안 상품 교체는 어뷰징 → 금지</li>
          <li style={li}>전환율 기준선(3% 내외) 넘어 안정되면 평시 코드로 전환</li>
        </ol>
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>사은품 힌트는 <b>포토리뷰</b>에서 — 고객이 함께 올린 소품이 다음 사은품·SKU 후보. 썸네일에 노출.</div>
      </Card>

      <Card title="9. 리뷰 자산화" sub="처음엔 상세페이지를 보고 사지만, 이후엔 리뷰를 보고 산다. 개수보다 콘텐츠 수준.">
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li style={li}>포인트는 허들 넘길 만큼 준다. 객단가 5만원↑ 상품에서 시도</li>
          <li style={li}><b>자동 지급</b> 세팅 + 구매·구매확정·리뷰 시점 반복 노출, 썸네일·제목에 혜택 표기</li>
          <li style={li}><b>한달리뷰</b> 운영 (즉시 1 + 한달 1 → 리뷰 2배 + 사용경험 축적)</li>
          <li style={li}>조건 지정: 사진 첨부·100자↑·전후 비교. 스토어픽으로 한달·재구매 리뷰 상단</li>
          <li style={li}>베스트 리뷰 주간 선정·배너 노출·당첨 댓글 직접</li>
          <li style={li}>악성 리뷰 → <b>즉시 환불 + 재구매 쿠폰</b>. 삭제·수정 요청은 어뷰징. &ldquo;CS 처리 결과&rdquo; 추가를 요청하면 오히려 신뢰 자산</li>
        </ul>
      </Card>

      <Card title="10. 검색 자산 확보 (네이버)">
        <ol style={{ margin: 0, paddingLeft: 18 }}>
          <li style={li}>이름부터 정한다 — 브랜드·제품명 검색 시 기존 결과가 없어야 유입이 묻히지 않음</li>
          <li style={li}>개발 착수 전 <b>상표권 출원</b>. 우선심사 3개월 vs 일반 1년 6개월. 네이버 브랜드 심사·쿠팡 화이트리스트가 상표권 요구</li>
          <li style={li}>자사 콘텐츠를 주요 영역에 먼저 깔고 유입 생성 (검색 1~2뎁스 안에 자사 콘텐츠)</li>
          <li style={li}>브랜디드 콘텐츠 → 인플루언서 탭 → VIEW 탭 순</li>
          <li style={li}>브랜드 키워드 검색량이 임계 넘으면 브랜드검색 광고</li>
          <li style={li}><b>모든 광고의 최종 목표 = 자사 브랜드 검색량 증가</b> (직접 전환이 아님)</li>
        </ol>
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>콘텐츠 없이 유통·광고 기법만 찾는 게 가장 흔한 실패. 퍼포먼스는 콘텐츠를 유통하는 것이지 대체하지 않는다.</div>
      </Card>

      <Card title="11. OEM 공장 선정·협상">
        <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>공장 선정 체크</div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li style={li}>대표가 직접 영업하는 공장이 유리 (MOQ 조정 여지)</li>
          <li style={li}>반드시 방문 — 화장실 청결이 관리 수준을 보여준다</li>
          <li style={li}>배합·포장·수정 요청에 부담스러워하면 진행 X (양산 사고)</li>
          <li style={li}>성공 레퍼런스 확인. 타 거래처 기밀 이야기하는 곳 X. 계약서 먼저 안 꺼내는 곳 X</li>
        </ul>
        <div style={{ fontSize: 12.5, fontWeight: 700, margin: "10px 0 4px" }}>금형비·MOQ 낮추기</div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li style={li}>금형비를 패키지 단가에 분할 상각 (목표 수량 도달 시 소멸)</li>
          <li style={li}>기간 독점 + 약정 수량 미달 시 프리몰드 전환 조건 — <b>계약서로 명문화</b></li>
          <li style={li}>부분 금형 (뚜껑 공용·몸통만 변경), 재질·색상 변경만으로 차별화</li>
          <li style={li}>부자재 100% 선결제 / 라인 인건비 부담으로 생산 MOQ 인하. 첫 생산 1천만원 전후</li>
        </ul>
      </Card>

      <Card title="12. 채택하지 않는 것 — 규제 리스크" sub="유통 확장 최우선 구조에서 대형 유통 입점 심사에 걸리면 회복 비용이 훨씬 크다.">
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li style={li}><b>우호 아이디 자가구매·리뷰 작성 금지</b> — 전자상거래법·표시광고법상 기만적 표시광고. 적발 시 상품 삭제·계정 제재</li>
          <li style={li}><b>카페 침투용 아이디 육성·대행 금지</b> — 약관 위반·뒷광고 규제. 인력 고용 순간 법인 리스크</li>
          <li style={li}>리뷰는 <b>포인트 정책·한달리뷰·체험단 등 합법 수단</b>으로만 확보. 하루바른(건기식)·나아(화장품)은 적발 시 제조·판매 단계까지 제재가 번진다</li>
        </ul>
      </Card>

      <Card title="13. 우선 실행 항목 (하루바른·나아 적용)">
        <div style={{ overflowX: "auto" }}>
          <table className="tbl">
            <thead><tr><th>#</th><th>항목</th><th>근거</th></tr></thead>
            <tbody>
              <tr><td>1</td><td>하루바른 4종 <b>3·6개월 정기구독</b> 구성 설계</td><td>1~2개월 재구매 주기 → 정기구독 적합도 최고</td></tr>
              <tr><td>2</td><td>나아 <b>세트·리필 라인</b> + 시즌(자외선) 캠페인 연동</td><td>화장품 재구매를 계절 수요와 결합</td></tr>
              <tr><td>3</td><td>브랜드 2축 <b>상표권 등록 상태 전수 점검</b></td><td>네이버 브랜드 심사·쿠팡 화이트리스트 전제</td></tr>
              <tr><td>4</td><td><b>기획전 코드 실험</b> 세팅 (5·10·15만원대)</td><td>객단가 인상이 수익률 개선 최단 경로</td></tr>
              <tr><td>5</td><td>브랜드별 <b>6주 이벤트 캘린더</b> 수립</td><td>명분·기간·수량 없는 단발 할인 차단</td></tr>
              <tr><td>6</td><td><b>리뷰 포인트 자동지급</b> + 한달리뷰 도입</td><td>광고비 의존도를 낮추는 유일한 축적 자산</td></tr>
            </tbody>
          </table>
        </div>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>확인 필요: 브랜드별 원가율 실측(30/50/70% 대비) · 정기구독/리필 제조 가능 여부 · 상표권 출원·등록 현황. 본 자료는 외부 강의 프레임을 자사 구조에 맞춰 재작성한 내부 검토용이며 외부 배포 대상이 아니다.</div>
      </Card>
    </div>
  );
}
