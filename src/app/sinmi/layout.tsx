import type { Metadata, Viewport } from "next";
import "../dining/dining.css";
import { DataProvider } from "@dining/lib/store";
import { Sidebar } from "@dining/components/Sidebar";
import { Topbar } from "@dining/components/Topbar";
import PwaRegister from "@/components/PwaRegister";

// 신미집 전용 앱 — /dining 코드를 공유하되 smjp 매장으로 고정(스위처 숨김).
export const metadata: Metadata = {
  title: "신미집 매장관리",
  description: "신미집 운영·직원·마케팅·P&L·식자재·예약·전달사항 관리",
  manifest: "/store-manifest/sinmi",
  applicationName: "신미집",
  appleWebApp: { capable: true, title: "신미집", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icons/sinmi-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/sinmi-180.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#b45309",
};

export default function SinmiLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fnb">
      <PwaRegister scope="/sinmi/" />
      <DataProvider basePath="/sinmi" fixedStore="smjp">
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
