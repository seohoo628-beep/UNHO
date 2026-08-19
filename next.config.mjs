/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 시간대는 전부 Asia/Seoul로 고정 (서버 런타임 기본값)
  env: {
    TZ: "Asia/Seoul",
  },
  // 커머스 마케팅 인터뷰지(public/commerce-interview) 를 확장자 없는 주소로 연결.
  async rewrites() {
    return [
      { source: "/commerce-interview", destination: "/commerce-interview/index.html" },
    ];
  },
  // 명함 OCR은 축소한 이미지를 base64로 서버액션에 전달 → 기본 1MB 한도 상향.
  experimental: {
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default nextConfig;
