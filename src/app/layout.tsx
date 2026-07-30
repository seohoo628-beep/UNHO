import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "운호컴퍼니 운영 플랫폼",
  description: "승인 대기 큐 중심의 운영 통합 플랫폼",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
