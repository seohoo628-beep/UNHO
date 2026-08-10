import type { Metadata, Viewport } from "next";
import "./dining.css";
import { DataProvider } from "@dining/lib/store";
import { Sidebar } from "@dining/components/Sidebar";
import { Topbar } from "@dining/components/Topbar";
import PwaRegister from "@/components/PwaRegister";

// 신미집·대운목장 통합 관리(매장 스위처). 각 매장 전용 앱은 /sinmi · /daeun 경로 사용.
export const metadata: Metadata = {
  title: "운호 다이닝 매장관리",
  description: "신미집 · 대운목장 운영·직원·마케팅·P&L·식자재·예약·전달사항 관리",
  manifest: "/store-manifest/dining",
  applicationName: "운호 다이닝",
  appleWebApp: { capable: true, title: "운호 다이닝", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icons/dining-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/dining-180.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#7c3aed",
};

// 이 서브트리는 .fnb 스코프로 격리되어 기존 운영 플랫폼 스타일과 충돌하지 않습니다.
export default function DiningLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fnb">
      <PwaRegister scope="/dining/" />
      <DataProvider basePath="/dining">
        <div className="shell">
          <Sidebar />
          <div className="main">
            <Topbar />
            <div className="content">{children}</div>
          </div>
        </div>
      </DataProvider>
    </div>
  );
}
