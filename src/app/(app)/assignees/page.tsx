import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import AssigneesManager from "@/components/AssigneesManager";

export const dynamic = "force-dynamic";

export default async function AssigneesPage() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>담당자 관리</h1>
          <p>&ldquo;+ 담당자&rdquo; 버튼으로 추가한 담당자(로그인 없는 이름표)를 이름변경·삭제로 정리한다. 실제 로그인 직원 계정은 여기 표시되지 않는다.</p>
        </div>
      </div>
      <AssigneesManager />
    </div>
  );
}
