/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: { TZ: "Asia/Seoul" },
  async headers() {
    // 내부 전용: 검색 노출 차단
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
};

export default nextConfig;
