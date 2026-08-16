import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isCeoUser } from "@/lib/ceo";
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
          <p>담당자(이름표)와 실제 직원(로그인 계정)을 이름변경·삭제로 정리한다. 본인·대표 계정은 삭제할 수 없다. 로그인 계정을 삭제하면 해당 직원의 접속 권한이 사라진다.</p>
        </div>
      </div>
      <AssigneesManager isOwner={user.role === "owner"} isCeo={isCeoUser(user)} />
    </div>
  );
}
