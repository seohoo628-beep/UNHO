"use client";

import { Card } from "@dining/components/ui";
import { NAV } from "@dining/lib/nav";
import { STORES } from "@dining/lib/stores";

// 플랫폼 간단 사용법 — 처음 쓰는 매장 관리자를 위한 안내.
const PLATFORM_LABEL = "운호 다이닝 매장관리";

const GROUP_DESC: Record<string, string> = {
  개요: "전체 현황을 한눈에 봅니다.",
  운영: "매장 일상 운영(직원·예약·식자재·거래처)을 관리합니다.",
  성장: "매출·마케팅·손익을 분석합니다.",
  소통: "전달사항·회의록·자료를 공유합니다.",
};

export default function GuidePage() {
  const groups = Array.from(new Set(NAV.map((n) => n.group)));
  return (
    <>
      <div className="page-head">
        <div>
          <h1>간단 사용법</h1>
          <p>{PLATFORM_LABEL} 플랫폼을 처음 쓰시는 분을 위한 안내입니다. 로그인 없이 링크만으로 바로 사용하실 수 있어요.</p>
        </div>
      </div>

      <div className="stack">
        <Card title="🚀 3단계로 시작하기">
          <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9, fontSize: 14.5 }}>
            <li><b>매장 선택</b> — 화면 상단(모바일은 ☰ 메뉴)에서 <b>전체 / 매장</b>을 고릅니다. 고른 매장 기준으로 모든 화면이 바뀝니다.</li>
            <li><b>메뉴 이동</b> — 왼쪽(모바일은 ☰) 메뉴에서 원하는 항목을 눌러 이동합니다.</li>
            <li><b>입력·저장</b> — 각 화면의 <b>‘+ 추가’</b> 버튼으로 내용을 넣으면 자동 저장됩니다. 따로 저장 버튼을 누를 필요가 없어요.</li>
          </ol>
        </Card>

        <Card title="🏬 매장 전환(상단 선택)">
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.8 }}>
            상단의 매장 선택으로 <b>‘전체’</b> 또는 개별 매장({STORES.map((s) => `${s.emoji} ${s.name}`).join(" · ")})을 오갈 수 있습니다.
            ‘전체’를 고르면 모든 매장을 합쳐서 보고, 매장을 고르면 그 매장 자료만 나옵니다.
          </p>
        </Card>

        <Card title="📂 메뉴 안내">
          <div className="stack">
            {groups.map((g) => (
              <div key={g}>
                <div style={{ fontWeight: 750, fontSize: 14.5, marginBottom: 4 }}>{g}</div>
                {GROUP_DESC[g] && <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>{GROUP_DESC[g]}</div>}
                <div style={{ display: "grid", gap: 6 }}>
                  {NAV.filter((n) => n.group === g).map((n) => (
                    <div key={n.href} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                      <span style={{ width: 22, textAlign: "center" }}>{n.icon}</span>
                      <b style={{ minWidth: 108 }}>{n.label}</b>
                      <span className="muted" style={{ fontSize: 12.5 }}>{MENU_HINT[n.label] ?? ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="📁 자료실 — 파일 올리기">
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9, fontSize: 14 }}>
            <li><b>‘+ 자료 올리기’</b> 버튼 → <b>분류</b>(디자인·메뉴·포스터·영상·기획안)를 고르고 파일을 선택합니다.</li>
            <li>파일 선택창에서 <b>여러 개를 한 번에</b> 고를 수 있어요. (Windows: <kbd>Ctrl</kbd>+클릭 / Mac: <kbd>⌘</kbd>+클릭, 또는 <kbd>Shift</kbd>로 범위 선택 — 수십 개도 한 번에)</li>
            <li>이미지·영상·문서 모두 가능하며 <b>파일당 50MB</b>까지 올라갑니다.</li>
            <li>올린 자료는 삭제 버튼으로 지울 수 있고, 다른 매니저와 <b>실시간으로 공유</b>됩니다.</li>
          </ul>
        </Card>

        <Card title="💾 데이터 저장·공유 안내">
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9, fontSize: 14 }}>
            <li><b>공유 저장</b>(모든 사람이 함께 봄): 거래처관리·자료실·미팅 일지. 서버에 저장되어 어느 기기에서 열어도 같은 내용이 보입니다.</li>
            <li><b>이 기기 저장</b>: 그 외 운영·매출 입력값은 지금 쓰는 브라우저에 저장됩니다. 다른 기기·시크릿창에서는 따로 관리되니 참고하세요.</li>
            <li>링크만 있으면 누구나 접속 가능하니 <b>링크 공유에 주의</b>해 주세요.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}

const MENU_HINT: Record<string, string> = {
  대시보드: "핵심 지표 요약",
  "간단 사용법": "이 안내 화면",
  운영기획: "운영 목표·계획",
  직원관리: "직원 정보·근무",
  예약관리: "예약 접수·현황",
  식자재관리: "재고·발주 품목",
  거래처관리: "거래처·주문처 (공유)",
  매출분석: "일 매출·방문객·지출 입력과 분석",
  마케팅관리: "홍보·프로모션",
  "P&L 관리": "손익 관리",
  전달사항: "공지·전달",
  "미팅·회의 일지": "회의록 + AI 정리 (공유)",
  자료실: "디자인·메뉴·영상 파일 (공유)",
};
