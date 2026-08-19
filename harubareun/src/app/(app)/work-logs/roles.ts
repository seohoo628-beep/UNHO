// 서버·클라이언트 양쪽에서 import하는 공용 상수/타입.
// (주의: "use client" 파일에서 값을 서버 컴포넌트로 import하면 런타임에 참조 프록시가 되어 터진다.
//  그래서 ROLES 같은 런타임 값은 반드시 이 non-client 모듈에 둔다.)

export const LOG_KINDS = ["일일업무일지", "주간업무계획", "월간업무계획"] as const;

// 역할 탭 정의(담당자 이름 포함). 동일 구조 공용. 경영지원은 별도 리치 화면.
export const ROLES = [
  { key: "designer", table: "designer_logs", label: "디자이너 · 한여정", icon: "🎨" },
  { key: "marketer", table: "marketer_logs", label: "마케터 · 차민준", icon: "🖊" },
  { key: "bm", table: "bm_logs", label: "BM · 김려은", icon: "🧭" },
  { key: "pd", table: "pd_logs", label: "PD · 허승원", icon: "🎬" },
] as const;

export const MIGRATION_OF: Record<string, string> = {
  designer_logs: "0053_designer_logs.sql",
  marketer_logs: "0076_work_logs.sql",
  bm_logs: "0076_work_logs.sql",
  md_logs: "0076_work_logs.sql",
  pd_logs: "0100_pd_logs.sql",
};

export type WorkLog = {
  id: string;
  kind: string;
  logDate: string;
  title: string;
  note: string;
  files: { url: string; name: string }[];
  authorName: string;
};
