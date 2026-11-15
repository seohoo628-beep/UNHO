import type { Metadata } from "next";
import "./company.css";

// 회사 공식 홈페이지(unocompany.net) 전용 레이아웃 — 내부 플랫폼과 분리된 공개 영역.
export const metadata: Metadata = {
  title: "운호컴퍼니 | UNHO COMPANY",
  description:
    "운호컴퍼니는 뷰티·헬스푸드·F&B·메디컬 영역에서 8개 브랜드를 만들고 키우는 브랜드 컴퍼니입니다.",
};

export default function CompanyLayout({ children }: { children: React.ReactNode }) {
  return <div className="co-root">{children}</div>;
}
