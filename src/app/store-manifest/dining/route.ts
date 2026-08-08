import { NextResponse } from "next/server";

// 호스트 인식 매니페스트 — 매장 앱을 회사 앱(scope "/")과 겹치지 않게 설치되도록 한다.
//  • dining/sinmi/daeun 서브도메인(별도 origin): scope "/" 로 루트 전체를 매장 앱으로
//    → 회사 앱과 origin 이 달라 깨끗하게 별도 설치. 설치 앱은 "/" 로 열리고 미들웨어가 "/dining" 으로 보낸다.
//  • 신미집(sinmi.*)·대운목장(daeun.*)은 /dining 코드를 공유하지만 각각 다른 앱 정체성(이름·아이콘·색)으로 설치된다.
//  • 메인 도메인의 "/dining": scope "/dining"(회사 앱에 가려질 수 있어 서브도메인 권장).
export const dynamic = "force-dynamic";

type Variant = {
  name: string;
  short: string;
  desc: string;
  id: string;
  theme: string;
  iconBase: string; // /icons/<base>-192.png 등
};

const DINING: Variant = {
  name: "운호 다이닝 매장관리",
  short: "운호 다이닝",
  desc: "신미집 · 대운목장 매장관리",
  id: "unho-dining-app",
  theme: "#7c3aed",
  iconBase: "dining",
};
const SINMI: Variant = {
  name: "신미집 매장관리",
  short: "신미집",
  desc: "신미집 운영·직원·매출·예약·전달사항 관리",
  id: "unho-sinmi-app",
  theme: "#b45309",
  iconBase: "sinmi",
};
const DAEUN: Variant = {
  name: "대운목장 매장관리",
  short: "대운목장",
  desc: "대운목장 운영·직원·매출·예약·전달사항 관리",
  id: "unho-daeun-app",
  theme: "#166534",
  iconBase: "daeun",
};

export function GET(request: Request) {
  const label = (request.headers.get("host") || "").toLowerCase().split(":")[0].split(".")[0];
  const isSubdomain = label.includes("dining") || label.includes("sinmi") || label.includes("daeun");
  const v = label.includes("sinmi") ? SINMI : label.includes("daeun") ? DAEUN : DINING;
  const startUrl = isSubdomain ? "/" : "/dining";

  const manifest = {
    name: v.name,
    short_name: v.short,
    description: v.desc,
    id: v.id,
    start_url: startUrl,
    scope: startUrl,
    display: "standalone",
    background_color: "#ffffff",
    theme_color: v.theme,
    orientation: "portrait-primary",
    lang: "ko",
    icons: [
      { src: `/icons/${v.iconBase}-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `/icons/${v.iconBase}-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `/icons/${v.iconBase}-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };

  return new NextResponse(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
