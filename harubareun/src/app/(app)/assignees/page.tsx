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
          <p>담당자(이름표)와 실제 직원(로그인 계정)을 관리한다. 대표는 계정 생성·비밀번호 설정과 함께 <b>직무·권한</b>을 지정할 수 있고, 직무는 홈 ‘오늘의 체크리스트’ 역할 자동필터의 근거가 된다. 본인·대표 계정은 삭제할 수 없다.</p>
        </div>
      </div>
      <AssigneesManager isOwner={user.role === "owner"} />
    </div>
  );
}
