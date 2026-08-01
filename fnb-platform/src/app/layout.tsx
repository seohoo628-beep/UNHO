import type { Metadata } from "next";
import "./globals.css";
import { DataProvider } from "@/lib/store";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

export const metadata: Metadata = {
  title: "운호 F&B 매장 통합관리",
  description: "청담 오리닭 · 은우 더 블랙 운영·직원·마케팅·P&L·식자재·예약·전달사항 관리",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <DataProvider>
          <div className="shell">
            <Sidebar />
            <div className="main">
              <Topbar />
              <div className="content">{children}</div>
            </div>
          </div>
        </DataProvider>
      </body>
    </html>
  );
}
