import { redirect } from "next/navigation";
import { requireAppUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import AppSidebar from "@/components/AppSidebar";
import { PomodoroProvider } from "@/components/pomodoro/PomodoroProvider";
import GlobalPomodoro from "@/components/pomodoro/GlobalPomodoro";
import AiAssistant from "@/components/AiAssistant";
import ErrorBoundary from "@/components/ErrorBoundary";
import VersionWatcher from "@/components/VersionWatcher";
import { isCeoUser } from "@/lib/ceo";
import { canViewFinance } from "@/lib/finance";

// AI 어시스턴트 등 느린 서버 액션이 시간초과로 죽지 않도록 실행 시간을 넉넉히.
export const maxDuration = 60;

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

  // 대표 승인 대기 + 폴더별 알림 배지용 개수. 지난 방문 이후 새 항목이 있으면
  // Nav가 빨간 숫자로 표시한다(기기별 마지막 본 개수와 비교). head:true라 데이터 전송 없이 개수만.
  const cnt = (
    q: PromiseLike<{ count: number | null }>
  ): Promise<number> => Promise.resolve(q).then((r) => r.count ?? 0);
  const t = (name: string) => supabase.from(name).select("id", { count: "exact", head: true });

  const [
    pending,
    execCount,
    resultCount,
    todoCount,
    ceoCount,
    planCount,
    meetCount,
    mlogCount,
    leaveCount,
    recvCount,
    payCount,
    crmCount,
    poCount,
    invCount,
    pdevCount,
    eapprCount,
  ] = await Promise.all([
    cnt(
      supabase
        .from("ai_outputs")
        .select("id", { count: "exact", head: true })
        .eq("agent_type", "marketer")
        .in("compliance_status", ["pass", "fail"])
        .eq("approval_status", "pending")
    ),
    cnt(t("tasks").not("ai_output_id", "is", null).eq("ai_agent_type", "marketer").in("status", ["예정", "진행", "보류"])),
    cnt(t("tasks").eq("ai_agent_type", "marketer").eq("status", "완료")),
    cnt(t("todos").in("status", ["예정", "진행"])),
    cnt(t("ceo_todos").eq("done", false)),
    cnt(t("ai_outputs").in("agent_type", ["md", "designer"]).eq("approval_status", "pending")),
    cnt(t("meetings")),
    cnt(t("manager_logs")),
    cnt(t("leave_usages")),
    cnt(t("receivables").is("settled_at", null)),
    cnt(t("payables").is("settled_at", null)),
    cnt(t("crm_leads")),
    cnt(t("purchase_orders")),
    cnt(t("inventory_items")),
    cnt(t("product_developments")),
    cnt(t("approval_requests").eq("status", "pending")),
  ]);

  const count = pending;
  const counts: Record<string, number> = {
    "/execute": execCount,
    "/dashboard": resultCount,
    "/todos": todoCount,
    "/ceo-todos": ceoCount,
    "/planning": planCount,
    "/meetings": meetCount,
    "/work-logs": mlogCount,
    "/leave": leaveCount,
    "/receivables": recvCount,
    "/payables": payCount,
    "/crm": crmCount,
    "/vendors": poCount,
    "/inventory": invCount,
    "/product-dev": pdevCount,
    "/e-approval": eapprCount,
  };

  const userLabel = `${user.name} · ${ROLE_LABEL[user.role] ?? user.role}${
    user.job_title ? ` (${user.job_title})` : ""
  }`;

  return (
    <PomodoroProvider>
      <div className="shell">
        <AppSidebar
          pendingCount={count ?? 0}
          isOwner={user.role === "owner"}
          isCeo={isCeoUser(user)}
          isFinance={canViewFinance(user)}
          isGuest={user.role === "guest"}
          userLabel={userLabel}
          counts={counts}
        />
        <main className="main">{children}</main>
      </div>
      <ErrorBoundary>
        <VersionWatcher current={process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || "dev"} />
      </ErrorBoundary>
      <ErrorBoundary>
        <GlobalPomodoro />
      </ErrorBoundary>
      <ErrorBoundary>
        <AiAssistant />
      </ErrorBoundary>
    </PomodoroProvider>
  );
}
