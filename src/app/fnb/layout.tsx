import type { Metadata } from "next";
import "./fnb.css";
import { DataProvider } from "@fnb/lib/store";
import { Sidebar } from "@fnb/components/Sidebar";
import { Topbar } from "@fnb/components/Topbar";

export const metadata: Metadata = {
  title: "운호 F&B 매장 통합관리",
  description: "청담 오리닭 · 은우 더 블랙 · 새벽국밥 운영·직원·마케팅·P&L·식자재·예약·전달사항 관리",
};

// 이 서브트리는 .fnb 스코프로 격리되어 기존 운영 플랫폼 스타일과 충돌하지 않습니다.
export default function FnbLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fnb">
      <DataProvider>
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
