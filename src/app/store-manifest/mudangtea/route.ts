import { NextResponse } from "next/server";
import { isMudangteaHost } from "@/lib/siteHosts";

// 무당티 유통 관리 전용 앱 매니페스트. 서브도메인(mudangtea.* 등)에서는 scope "/" 로 루트화
// (회사 앱과 origin 분리), 메인 도메인에서는 scope "/mudangtea".
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const startUrl = isMudangteaHost(request.headers.get("host")) ? "/" : "/mudangtea";

  const manifest = {
    name: "무당티 유통 관리",
    short_name: "무당티 유통",
    description: "무당티 판매처 제안·판매·재고·유통기한·배송비 관리",
    id: "unho-mudangtea-app",
    start_url: startUrl,
    scope: startUrl,
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#111418",
    orientation: "portrait-primary",
    lang: "ko",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };

  return new NextResponse(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
