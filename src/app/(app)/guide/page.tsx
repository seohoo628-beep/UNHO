import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import ShareGuideButton from "@/components/ShareGuideButton";

export const dynamic = "force-dynamic";

type Section = { icon: string; title: string; steps: string[] };

const SECTIONS: Section[] = [
  {
    icon: "🏠",
    title: "홈 화면",
    steps: [
      "폴더들이 아이콘 카드로 정리되어 있습니다(한 줄에 여러 개). 눌러서 바로 들어가세요.",
      "🔒 CEO 전용 폴더는 ‘나만 보는 폴더’ 그룹으로 따로 모여 있습니다(대표님 계정만).",
      "상단에 오늘의 체크리스트, (권한자만) 미수금·미지급 잔액, 브랜드 월 매출 목표가 요약됩니다.",
      "새 기능이 배포되면 앱이 자동으로 최신으로 새로고침됩니다(입력 중일 때는 기다렸다가).",
    ],
  },
  {
    icon: "📋",
    title: "업무 투두 (전직원)",
    steps: [
      "‘할 일 추가’로 업무를 등록하고 담당자·마감·중요도를 지정합니다. 담당자별/보드(칸반)로 볼 수 있어요.",
      "각 카드에서 진행상태 변경·📌고정·순서 이동·💬댓글·수정·삭제가 됩니다.",
      "상단 📢 공지사항에 전 직원에게 보이는 공지를 올릴 수 있습니다(대표·직원, 상단 고정 가능).",
      "‘카톡 리마인드 생성’으로 담당자별 진행 업무를 카톡용 텍스트로 정리해 전달합니다.",
    ],
  },
  {
    icon: "🔒",
    title: "CEO 투두 · 리마인드 · 아이디어 · 안티에이징 (대표 전용)",
    steps: [
      "CEO 투두: 우선순위별 개인 할 일. 카드 아래 버튼으로 고정·이동·수정·🕘버전복원.",
      "리마인드: 상시 리마인드 목록(직업군/분류 필터, 드래그·고정).",
      "아이디어 관리: 🎙 음성으로 말하면 글로 받아 적고, AI가 발전·실행계획·리스크·네이밍을 도와줍니다.",
      "안티에이징: 시술·영양제·운동 기록. 상단 배너에 매일 루틴이 정리돼 있습니다.",
      "🕘 버튼으로 언제든 이전 버전으로 복원할 수 있습니다(노션식).",
    ],
  },
  {
    icon: "👥",
    title: "인적자산 (대표 전용)",
    steps: [
      "인맥을 직업군별로 관리합니다. ‘📥 연락처 가져오기’로 휴대폰 주소록에서 불러올 수 있어요(안드로이드 크롬).",
      "이름만 있는 사람은 각 카드의 ‘📥 연락처 가져오기’로 폰에서 번호를 골라 채웁니다.",
      "‘📋 명단 붙여넣기’로 여러 명을 한 번에 추가합니다(중복은 자동 제외).",
    ],
  },
  {
    icon: "📇",
    title: "명함목록 (대표 전용)",
    steps: [
      "명함을 촬영/선택하면 AI가 이름·회사·연락처를 자동 인식합니다(리멤버 방식).",
      "‘📇 연락처 저장’으로 폰 주소록에 저장, ‘👤 인적자산 저장’으로 인맥 폴더에 넣습니다.",
    ],
  },
  {
    icon: "📝",
    title: "미팅·회의 일지",
    steps: [
      "‘+ 미팅 기록’ → 🎙 음성 녹음을 켜고 회의하면 말이 자동으로 글로 받아 적힙니다.",
      "‘저장’만 누르면 AI가 제목·회의록(개요·논의·결정·액션)을 자동 생성합니다.",
      "폰 녹음 파일(m4a 등)을 첨부해도 됩니다. 큰 파일도 끊김 없이 업로드됩니다.",
    ],
  },
  {
    icon: "📑",
    title: "전자결재 · 각종 자료",
    steps: [
      "이미지·영상·엑셀·PDF를 올리면 다운로드 없이 눌러서 바로 열어 볼 수 있습니다.",
      "여러 파일을 선택해 동시에 올리고, 다운로드 버튼으로 원본을 받을 수 있어요.",
    ],
  },
  {
    icon: "📚",
    title: "커머스 운영 프레임",
    steps: [
      "매출 역산: 연 목표를 넣으면 월·일·평일/주말·인당·목표이익이 자동 계산되고, ‘목표 저장’ 시 홈 대시보드에 반영됩니다.",
      "제품 채택 심사(8필터)·원가/손익 판정(미끼·메인·기획)·4P 인덱스·실행 체크리스트를 제공합니다.",
      "제품개발 폴더 상단의 ‘✅ 제품 채택 심사’에서 팀이 함께 통과/보류를 기록합니다.",
    ],
  },
  {
    icon: "📅",
    title: "캘린더 · 이메일 트래킹",
    steps: [
      "캘린더: 업무 마감·미팅·연차를 월간 달력과 타임라인으로 한눈에 봅니다.",
      "이메일 트래킹: 회사 메일의 받은/보낸 편지함을 앱에서 확인합니다.",
    ],
  },
  {
    icon: "🧾",
    title: "미수금 · 미지급금 (🔒 권한자 전용)",
    steps: [
      "받을 돈·줄 돈을 거래처별로 기록하면 잔액·연체가 자동 표시됩니다.",
      "대표님과 지정된 담당(psm)만 볼 수 있습니다.",
    ],
  },
  {
    icon: "🤖",
    title: "AI 어시스턴트 · 설정",
    steps: [
      "화면 우측 하단 🤖 버튼으로 어느 폴더에서든 현재 데이터를 보고 질문·정리·편집을 맡길 수 있습니다(음성 대화 가능).",
      "설정 화면에서 AI 연결(Anthropic)·음성 변환 키를 넣으면 회의록 정리·AI 기능이 동작합니다.",
    ],
  },
];

const SHARE_SUMMARY =
  "홈(폴더 카드)·업무투두(공지·칸반)·CEO 전용(투두/리마인드/아이디어/안티에이징)·인적자산·명함·미팅 음성기록·전자결재·커머스 프레임·캘린더·AI 어시스턴트까지, 자주 쓰는 순서로 정리했습니다. 링크를 열어 확인하세요.";

export default async function Page() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");

  return (
    <div>
      <div className="page-head" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>📖 플랫폼 사용법</h1>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>왼쪽 메뉴는 카테고리별로 묶여 있습니다. 자주 쓰는 기능부터 정리했어요.</p>
        </div>
        <ShareGuideButton summary={SHARE_SUMMARY} />
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
        🔒 표시된 폴더는 권한이 있는 계정만 볼 수 있습니다. (권한은 대표님께 문의)
        <br />
        새 폴더를 처음 열면 ‘DB 설정 필요’ 안내와 함께 복사 버튼이 뜨는 경우가 있습니다 — 그 SQL을 Supabase에 한 번 붙여넣어 실행하면 됩니다.
      </p>
    </div>
  );
}
