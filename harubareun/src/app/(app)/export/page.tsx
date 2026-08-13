import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import ExportClient from "@/components/ExportClient";

export const dynamic = "force-dynamic";

export default async function ExportPage() {
  const user = await requireAppUser();
  if (user.role !== "owner") redirect("/");

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>데이터 백업·내보내기</h1>
          <p>플랫폼 전체 데이터를 JSON 백업 또는 테이블별 CSV로 내려받는다. (대표 전용)</p>
        </div>
      </div>
      <ExportClient />
    </div>
  );
}
