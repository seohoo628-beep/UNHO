import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Section = { icon: string; title: string; steps: string[] };

const SECTIONS: Section[] = [
  {
    icon: "🚪",
    title: "시작하기 · 로그인",
    steps: [
      "하루바른·나아 두 브랜드의 통합 운영 플랫폼입니다.",
      "로그인은 이메일 + 비밀번호 방식입니다. 계정은 관리자(대표)가 만들어 배부합니다.",
      "왼쪽 메뉴는 카테고리(일일 업무·인사근태·재무정산·상품개발·콘텐츠마케팅·영업채널·설정)로 묶여 있고, 홈(🏠)에서 폴더 카드로도 이동할 수 있습니다.",
    ],
  },
  {
    icon: "✅",
    title: "콘텐츠 자동기획 & 승인",
    steps: [
      "‘MD·디자이너 자동기획’·AI 직원이 릴스 대본·피드 카피·디자인 지시서 초안을 만듭니다.",
      "규제 검수를 통과한 초안이 ‘자동기획 콘텐츠 승인’ 큐에 올라오면, 대표가 승인/반려합니다.",
      "승인하면 집행 업무가 자동으로 업무보드에 ‘예정’으로 생성됩니다.",
      "※ AI 기능은 설정 화면에서 Anthropic API 키를 연결해야 동작합니다.",
    ],
  },
  {
    icon: "📋",
    title: "업무투두 · 전자결재",
    steps: [
      "‘업무투두 전직원’에서 할 일을 등록하고 담당자·마감·진행상태로 팔로업합니다.",
      "‘전자결재’로 지출·품의 등을 올리고 대표가 승인합니다.",
    ],
  },
  {
    icon: "📝",
    title: "미팅·회의 일지",
    steps: [
      "‘+ 미팅 기록’ → 🎙 음성 녹음 시작을 누르고 회의를 진행하면 말이 자동으로 글로 받아 적힙니다.",
      "‘저장’만 누르면 AI가 제목과 회의록(개요·논의·결정·액션아이템)을 자동으로 만들어 줍니다.",
      "제목을 누르면 정리된 회의록이 펼쳐집니다. ‘📄 파일로 저장’에서 PDF·Word·공유(구글 드라이브·카톡)를 고를 수 있어요.",
    ],
  },
  {
    icon: "🖊",
    title: "업무일지 (경영지원·디자이너·마케터·BM·MD)",
    steps: [
      "담당자별 업무일지 폴더에서 일일업무일지·주간업무계획·월간업무계획을 날짜·메모·첨부파일과 함께 기록합니다.",
      "‘+ 업무일지 올리기’로 추가하고, 상단 탭(전체/일일/주간/월간)으로 구분해 봅니다.",
      "경영지원매니저 업무일지는 표준 업무 리스트 ‘+ 담기’와 월간 성과·인센티브 자동계산을 함께 지원합니다.",
    ],
  },
  {
    icon: "🌴",
    title: "연차관리 · 직원관리",
    steps: [
      "직원 입사일만 넣으면 근로기준법 기준 부여일수가 자동 계산되고, 월별 사용을 기록하면 잔여가 갱신됩니다.",
    ],
  },
  {
    icon: "🧾",
    title: "재무 — P&L · 미수금 · 미지급금",
    steps: [
      "P&L 화면은 구글 시트를 읽어 핵심 KPI(매출·이익·ROAS 등)를 표시합니다(설정에서 시트 지정).",
      "받을 돈(미수금)·줄 돈(미지급금)을 거래처별로 기록하면 잔액·연체가 자동 표시됩니다.",
    ],
  },
  {
    icon: "📁",
    title: "업무 시트들 (구글 연결)",
    steps: [
      "구글 ‘서비스 계정’ 방식으로 연결합니다(개인 로그인 계정과 무관).",
      "설정에 서비스계정 키(GOOGLE_SA_*)를 넣고, 시트 폴더를 그 서비스계정 이메일에 공유(뷰어)한 뒤 설정에서 폴더 ID를 지정하면 실시간으로 표시됩니다.",
      "원하는 어떤 구글 계정의 폴더든 연결할 수 있습니다.",
    ],
  },
  {
    icon: "⚙️",
    title: "설정 — AI · 알림 연결",
    steps: [
      "‘AI 연결(Anthropic)’에 키를 넣으면 회의록 정리·자동기획·AI 어시스턴트가 동작합니다.",
      "카카오 연결을 하면 평일 아침 승인 대기·지연 요약을 대표 카톡으로 받습니다.",
    ],
  },
];

export default async function Page() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");

  return (
    <div>
      <div className="page-head">
        <h1 style={{ margin: 0 }}>📖 하루바른·나아 플랫폼 사용법</h1>
        <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>왼쪽 메뉴는 카테고리별로 묶여 있습니다. 자주 쓰는 기능부터 정리했어요.</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {SECTIONS.map((s) => (
          <div key={s.title} className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>
              {s.icon} {s.title}
            </div>
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13.5, lineHeight: 1.75, color: "var(--ink)" }}>
              {s.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </div>
        ))}
      </div>

      <p className="muted" style={{ fontSize: 12.5, marginTop: 16, lineHeight: 1.7 }}>
        🔒 표시된 폴더는 대표(CEO) 계정에서만 보입니다.
        <br />
        새 폴더를 처음 열었을 때 ‘테이블이 아직 준비되지 않았습니다’ 안내가 뜨면, 해당 마이그레이션 SQL을 Supabase에 한 번 붙여넣어 실행하면 됩니다.
      </p>
    </div>
  );
}
