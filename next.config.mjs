/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 시간대는 전부 Asia/Seoul로 고정 (서버 런타임 기본값)
  env: {
    TZ: "Asia/Seoul",
  },
};

export default nextConfig;
