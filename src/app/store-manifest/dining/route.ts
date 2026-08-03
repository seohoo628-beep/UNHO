import { NextResponse } from "next/server";

// 호스트 인식 매니페스트 — 매장 앱을 회사 앱(scope "/")과 겹치지 않게 설치되도록 한다.
//  • dining 서브도메인(별도 origin): scope "/" 로 루트 전체를 매장 앱으로 → 회사 앱과 origin 이 달라 깨끗하게 별도 설치.
//    설치 앱은 "/" 로 열리고, 미들웨어가 "/dining" 으로 리다이렉트한다.
//  • 메인 도메인의 "/dining": scope "/dining" (회사 앱 scope "/" 아래라 설치 프롬프트가 가려질 수 있음 → 서브도메인 권장).
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const label = (request.headers.get("host") || "").toLowerCase().split(":")[0].split(".")[0];
  const isSubdomain = label.includes("dining");
  const startUrl = isSubdomain ? "/" : "/dining";

  const manifest = {
    name: "운호 다이닝 매장관리",
    short_name: "운호 다이닝",
    description: "신미집 · 대운목장 매장관리",
    id: "unho-dining-app",
    start_url: startUrl,
    scope: startUrl,
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#7c3aed",
    orientation: "portrait-primary",
    lang: "ko",
    icons: [
      { src: "/icons/dining-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/dining-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/dining-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };

  return new NextResponse(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
