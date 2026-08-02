import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "UNO 자기 관리",
  description: "수면·운동·독서·공부·업무를 매일 기록하고 대시보드로 관리하는 개인 자기 관리 플랫폼",
};

// 로그인 없이 접근하는 독립 섹션. 회사 운영 플랫폼 사이드바 대신 자체 상단바를 쓴다.
export default function UnoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="uno-app">
      <header className="uno-appbar">
        <div className="uno-appbar-brand">🌱 UNO 자기 관리</div>
        <a className="uno-appbar-link" href="/todos">
          운영 플랫폼 →
        </a>
      </header>
      <main className="main uno-appmain">{children}</main>
    </div>
  );
}
