import { redirect } from "next/navigation";
import { requireAppUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import AppSidebar from "@/components/AppSidebar";

const ROLE_LABEL: Record<string, string> = {
  owner: "대표",
  staff: "직원",
  ai: "AI",
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAppUser();
  // 외주업체는 내부 화면에 들어오지 않는다. 별도 포털로 보낸다.
  if (user.role === "vendor") redirect("/portal");
  const supabase = createSupabaseServerClient();

  // 대표 승인 대기 + 폴더별 알림 배지용 개수(집행센터·결과물·투두). 지난 방문 이후 새 항목이
  // 있으면 Nav가 빨간 숫자로 표시한다(기기별 마지막 본 개수와 비교).
  const [
    { count },
    { count: execCount },
    { count: resultCount },
    { count: todoCount },
  ] = await Promise.all([
    supabase
      .from("ai_outputs")
      .select("id", { count: "exact", head: true })
      .eq("agent_type", "marketer")
      .in("compliance_status", ["pass", "fail"])
      .eq("approval_status", "pending"),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .not("ai_output_id", "is", null)
      .eq("ai_agent_type", "marketer")
      .in("status", ["예정", "진행", "보류"]),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("ai_agent_type", "marketer")
      .eq("status", "완료"),
    supabase
      .from("todos")
      .select("id", { count: "exact", head: true })
      .in("status", ["예정", "진행"]),
  ]);

  const counts: Record<string, number> = {
    "/execute": execCount ?? 0,
    "/dashboard": resultCount ?? 0,
    "/todos": todoCount ?? 0,
  };

  const userLabel = `${user.name} · ${ROLE_LABEL[user.role] ?? user.role}${
    user.job_title ? ` (${user.job_title})` : ""
  }`;

  return (
    <div className="shell">
      <AppSidebar
        pendingCount={count ?? 0}
        isOwner={user.role === "owner"}
        userLabel={userLabel}
        counts={counts}
      />
      <main className="main">{children}</main>
    </div>
  );
}
