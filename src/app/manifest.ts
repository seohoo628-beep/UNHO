import type { MetadataRoute } from "next";

// PWA 매니페스트 — 홈 화면에 앱으로 설치되고, 주소창 없는 전체화면(standalone)으로 실행된다.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "운호컴퍼니 운영 플랫폼",
    short_name: "운호컴퍼니",
    description: "운호컴퍼니 운영 통합 플랫폼",
    start_url: "/hub",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#111418",
    lang: "ko",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
