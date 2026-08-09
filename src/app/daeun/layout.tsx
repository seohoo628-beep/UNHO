import type { Metadata, Viewport } from "next";
import "../dining/dining.css";
import { DataProvider } from "@dining/lib/store";
import { Sidebar } from "@dining/components/Sidebar";
import { Topbar } from "@dining/components/Topbar";
import PwaRegister from "@/components/PwaRegister";
import StoreUnlockGate from "@/components/StoreUnlockGate";

// 대운목장 전용 앱 — /dining 코드를 공유하되 dwmc 매장으로 고정(스위처 숨김).
export const metadata: Metadata = {
  title: "대운목장 매장관리",
  description: "대운목장 운영·직원·마케팅·P&L·식자재·예약·전달사항 관리",
  manifest: "/store-manifest/daeun",
  applicationName: "대운목장",
  appleWebApp: { capable: true, title: "대운목장", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icons/daeun-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/daeun-180.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#166534",
};

export default function DaeunLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fnb">
      <PwaRegister scope="/daeun/" />
      <DataProvider basePath="/daeun" fixedStore="dwmc">
        <div className="shell">
          <Sidebar />
          <div className="main">
            <Topbar />
            <div className="content"><StoreUnlockGate />{children}</div>
          </div>
        </div>
      </DataProvider>
    </div>
  );
}
