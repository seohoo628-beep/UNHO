import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Section = { icon: string; title: string; steps: string[] };

const SECTIONS: Section[] = [
  {
    icon: "📝",
    title: "미팅·회의 일지",
    steps: [
      "‘+ 미팅 기록’ → 🎙 음성 녹음 시작을 누르고 회의를 진행하면 말이 자동으로 글로 받아 적힙니다.",
      "‘저장’만 누르면 AI가 제목과 회의록(개요·논의·결정·액션아이템)을 자동으로 만들어 줍니다.",
      "제목을 누르면 정리된 회의록이 펼쳐집니다. ‘📄 파일로 저장’에서 PDF·Word·공유(구글 드라이브·카톡)를 고를 수 있어요.",
      "폰 녹음 파일(m4a 등)을 첨부해도 됩니다(25MB 이하는 자동 텍스트 변환). 녹음 중에는 화면을 켜 두세요.",
    ],
  },
  {
    icon: "🌴",
    title: "연차관리",
    steps: [
      "직원의 입사일만 넣으면 근로기준법 기준으로 부여일수가 자동 계산됩니다.",
      "월별 사용을 기록하면 잔여 연차가 자동으로 갱신됩니다.",
    ],
  },
  {
    icon: "📓",
    title: "경영지원매니저 업무일지",
    steps: [
      "날짜별로 그날 한 일을 구분(경리·물류·CS 등)과 함께 기록합니다.",
      "표준 업무 리스트에서 ‘+ 담기’를 누르면 그날 일지에 바로 들어갑니다.",
      "월간 성과·인센티브에 매출을 넣으면 지급액이 자동 계산됩니다.",
    ],
  },
  {
    icon: "🧾",
    title: "미수금 · 미지급금 (🔒 비번 1233)",
    steps: [
      "받을 돈(미수금)·줄 돈(미지급금)을 거래처별로 기록합니다.",
      "청구액과 입금(지급)액을 넣으면 잔액과 연체 여부가 자동 표시됩니다.",
    ],
  },
  {
    icon: "🖼",
    title: "제품 이미지·영상 자료 (자료실)",
    steps: [
      "‘📤 파일 여러 개 올리기’로 이미지·영상 수십 개를 한 번에 선택해 업로드할 수 있습니다.",
      "외부 링크(구글드라이브·유튜브)는 ‘+ 링크로 추가’로 등록합니다.",
    ],
  },
  {
    icon: "🛍",
    title: "자사몰 바로가기",
    steps: ["운영 중인 자사몰·스마트스토어를 눌러 새 탭으로 바로 엽니다."],
  },
  {
    icon: "🔑",
    title: "계정 ID·PW (🔒 비번 1233)",
    steps: ["스마트스토어·쿠팡 등 운영 계정의 아이디·비밀번호를 잠금 폴더에 보관합니다."],
  },
  {
    icon: "⚙️",
    title: "설정 — AI 연결",
    steps: [
      "설정 화면의 ‘AI 연결(Anthropic)’에 키를 넣으면 회의록 정리·AI 직원이 동작합니다.",
      "‘음성 텍스트 변환(OpenAI)’ 키를 넣으면 첨부한 녹음 파일이 자동으로 글로 변환됩니다.",
    ],
  },
];

export default async function Page() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");

  return (
    <div>
      <div className="page-head">
        <h1 style={{ margin: 0 }}>📖 플랫폼 간단 사용법</h1>
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
        🔒 표시된 폴더(CEO 투두·직원관리·미수금·미지급금·계정)는 비밀번호 <b>1233</b>으로 잠겨 있습니다.
        <br />
        새 폴더를 처음 열면 ‘DB 설정 필요’ 안내와 함께 복사 버튼이 뜨는 경우가 있습니다 — 그 SQL을 Supabase에 한 번 붙여넣어 실행하면 됩니다.
      </p>
    </div>
  );
}
