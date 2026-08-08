import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./dining.css";
import { DataProvider } from "@dining/lib/store";
import { Sidebar } from "@dining/components/Sidebar";
import { Topbar } from "@dining/components/Topbar";
import PwaRegister from "@/components/PwaRegister";

// 호스트로 단일 매장 전용 앱 여부를 판별해 메타데이터(제목·아이콘·색)를 매장별로 바꾼다.
function variantFromHost(): { title: string; short: string; iconBase: string; theme: string } {
  const label = (headers().get("host") || "").toLowerCase().split(":")[0].split(".")[0];
  if (label.includes("sinmi")) return { title: "신미집 매장관리", short: "신미집", iconBase: "sinmi", theme: "#b45309" };
  if (label.includes("daeun")) return { title: "대운목장 매장관리", short: "대운목장", iconBase: "daeun", theme: "#166534" };
  return { title: "운호 다이닝 매장관리", short: "운호 다이닝", iconBase: "dining", theme: "#7c3aed" };
}

export function generateMetadata(): Metadata {
  const v = variantFromHost();
  return {
    title: v.title,
    description: "신미집 · 대운목장 운영·직원·마케팅·P&L·식자재·예약·전달사항 관리",
    manifest: "/store-manifest/dining",
    applicationName: v.short,
    appleWebApp: { capable: true, title: v.short, statusBarStyle: "default" },
    icons: {
      icon: [{ url: `/icons/${v.iconBase}-192.png`, sizes: "192x192", type: "image/png" }],
      apple: [{ url: `/icons/${v.iconBase}-180.png`, sizes: "180x180", type: "image/png" }],
    },
  };
}

export function generateViewport(): Viewport {
  return { themeColor: variantFromHost().theme };
}

// 이 서브트리는 .fnb 스코프로 격리되어 기존 운영 플랫폼 스타일과 충돌하지 않습니다.
export default function FnbLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fnb">
      <PwaRegister scope="/dining/" />
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
