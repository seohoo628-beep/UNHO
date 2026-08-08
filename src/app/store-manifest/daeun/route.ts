import { NextResponse } from "next/server";

// 대운목장 전용 앱 매니페스트. 서브도메인(daeun.*)에서는 scope "/" 로 루트화(회사 앱과 origin 분리),
// 메인 도메인에서는 scope "/daeun".
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const label = (request.headers.get("host") || "").toLowerCase().split(":")[0].split(".")[0];
  const isSubdomain = label.includes("daeun");
  const startUrl = isSubdomain ? "/" : "/daeun";

  const manifest = {
    name: "대운목장 매장관리",
    short_name: "대운목장",
    description: "대운목장 운영·직원·매출·예약·전달사항 관리",
    id: "unho-daeun-app",
    start_url: startUrl,
    scope: startUrl,
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#166534",
    orientation: "portrait-primary",
    lang: "ko",
    icons: [
      { src: "/icons/daeun-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/daeun-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/daeun-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };

  return new NextResponse(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
