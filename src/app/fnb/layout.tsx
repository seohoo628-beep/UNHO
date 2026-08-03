import type { Metadata, Viewport } from "next";
import "./fnb.css";
import { DataProvider } from "@fnb/lib/store";
import { Sidebar } from "@fnb/components/Sidebar";
import { Topbar } from "@fnb/components/Topbar";
import LockSection from "@/components/LockSection";
import PwaRegister from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: "운호 F&B 매장관리",
  description: "청담 오리닭 · 은우 더 블랙 · 새벽국밥 운영·직원·마케팅·P&L·식자재·예약·전달사항 관리",
  manifest: "/store-manifest/fnb",
  applicationName: "운호 F&B",
  appleWebApp: { capable: true, title: "운호 F&B", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icons/fnb-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/fnb-180.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#e8590c",
};

// 이 서브트리는 .fnb 스코프로 격리되어 기존 운영 플랫폼 스타일과 충돌하지 않습니다.
export default function FnbLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fnb">
      <PwaRegister scope="/fnb/" />
      <DataProvider>
        <div className="shell">
          <Sidebar />
          <div className="main">
            <Topbar />
            <div className="content">
              <LockSection storageKey="fnb-unlock-v1" password="1233" heading="청담 오리골·은우 더블랙 관리">{children}</LockSection>
            </div>
          </div>
        </div>
      </DataProvider>
    </div>
  );
}
