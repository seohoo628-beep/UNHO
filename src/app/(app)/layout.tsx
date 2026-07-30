import { requireAppUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import LogoutButton from "@/components/LogoutButton";

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
  const supabase = createSupabaseServerClient();

  // 대표 승인 대기 = 규제 검수 통과 + 승인 대기
  const { count } = await supabase
    .from("ai_outputs")
    .select("id", { count: "exact", head: true })
    .eq("compliance_status", "pass")
    .eq("approval_status", "pending");

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          운호컴퍼니
          <small>운영 플랫폼 · Phase 1</small>
        </div>
        <Nav pendingCount={count ?? 0} />
        <div className="foot">
          {user.name} · {ROLE_LABEL[user.role] ?? user.role}
          {user.job_title ? ` (${user.job_title})` : ""}
          <LogoutButton />
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
