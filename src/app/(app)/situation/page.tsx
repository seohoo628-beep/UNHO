import { redirect } from "next/navigation";
import { requireAppUser } from "@/lib/auth";
import { isCeoUser } from "@/lib/ceo";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { seoulToday } from "@/lib/time";
import { buildSituation } from "@/lib/situation";
import SituationBoard from "@/components/SituationBoard";

export const dynamic = "force-dynamic";

export default async function SituationPage() {
  const user = await requireAppUser();
  if (!isCeoUser(user) && user.role !== "owner") redirect("/hub");
  const s = await buildSituation(createSupabaseServerClient(), seoulToday());
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>대표 상황판</h1>
          <p>돈·재고·업무·AI 직원·고객 현황을 한 화면에 모았습니다. 숫자를 누르면 해당 메뉴로 이동합니다.</p>
        </div>
      </div>
      <SituationBoard s={s} />
    </div>
  );
}
