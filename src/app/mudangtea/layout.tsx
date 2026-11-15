import type { Metadata, Viewport } from "next";
import PwaRegister from "@/components/PwaRegister";
import SiteLogout from "./SiteLogout";
import "./mudangtea.css";

// 무당티 유통 관리 전용 사이트.
// 운영 플랫폼 사이드바 없이 단독으로 열린다. 서브도메인(mudangtea.* 등)에서는 루트(/)가 이 화면이다.
// 공급가·이익을 다루므로 로그인 필수(미들웨어 공개 경로에 넣지 않는다).
export const metadata: Metadata = {
  title: "무당티 유통 관리",
  description: "무(無)당티 판매처 제안·판매·재고·유통기한·배송비 관리",
  manifest: "/store-manifest/mudangtea",
  applicationName: "무당티 유통",
  appleWebApp: { capable: true, title: "무당티 유통", statusBarStyle: "default" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#111418",
};

// 전용 도메인에서는 운영 플랫폼 화면이 막혀 있으므로 메인 도메인 주소로 연결한다.
const PLATFORM_URL = `${(process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "")}/hub`;

export default function MudangteaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mdt-site">
      <header className="mdt-site-bar">
        <a className="mdt-site-brand" href="/mudangtea">
          무당티 <span>유통 관리</span>
        </a>
        <nav className="mdt-site-nav">
          <a className="mdt-site-link" href={PLATFORM_URL}>운영 플랫폼</a>
          <SiteLogout />
        </nav>
      </header>
      <PwaRegister scope="/mudangtea/" />
      <main className="main mdt-site-main">{children}</main>
    </div>
  );
}
