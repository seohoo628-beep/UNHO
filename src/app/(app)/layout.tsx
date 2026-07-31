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

  // 대표 승인 대기 = 검수 완료(통과·미통과) + 승인 대기. 미통과도 큐에 노출된다.
  const { count } = await supabase
    .from("ai_outputs")
    .select("id", { count: "exact", head: true })
    .in("compliance_status", ["pass", "fail"])
    .eq("approval_status", "pending");

  const userLabel = `${user.name} · ${ROLE_LABEL[user.role] ?? user.role}${
    user.job_title ? ` (${user.job_title})` : ""
  }`;

  return (
    <div className="shell">
      <AppSidebar
        pendingCount={count ?? 0}
        isOwner={user.role === "owner"}
        userLabel={userLabel}
      />
      <main className="main">{children}</main>
    </div>
  );
}
