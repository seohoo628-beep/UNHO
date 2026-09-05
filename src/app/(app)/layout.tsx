import { redirect } from "next/navigation";
import { requireAppUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import AppSidebar from "@/components/AppSidebar";
import { PomodoroProvider } from "@/components/pomodoro/PomodoroProvider";
import GlobalPomodoro from "@/components/pomodoro/GlobalPomodoro";
import AiAssistant from "@/components/AiAssistant";
import DragAutoScroll from "@/components/DragAutoScroll";
import ErrorBoundary from "@/components/ErrorBoundary";
import VersionWatcher from "@/components/VersionWatcher";
import { isCeoUser } from "@/lib/ceo";
import { canViewFinance } from "@/lib/finance";
import { getFolderCounts } from "@/lib/folderCounts";
import { memoCache } from "@/lib/memoCache";

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

  // 사이드바 폴더 순서·카테고리 이동(개인 설정)과 폴더 배지 개수(30초 캐시)를 병렬로.
  let folderOrder: string[] = [];
  let folderGroups: Record<string, string> = {};
  const [prefsRes, fc] = await Promise.all([
    memoCache(`user-prefs:${user.id}`, 60_000, async () => {
      try {
        const { data } = await supabase.from("user_prefs").select("prefs").eq("user_id", user.id).maybeSingle();
        return (data as { prefs: unknown } | null) ?? null;
      } catch {
        return null;
      }
    }),
    getFolderCounts().catch(() => ({ pending: 0, counts: {} as Record<string, number> })),
  ]);
  try {
    const p = (prefsRes?.prefs as { folderOrder?: unknown; folderGroups?: unknown } | null) ?? {};
    if (Array.isArray(p.folderOrder)) folderOrder = p.folderOrder.filter((x): x is string => typeof x === "string");
    if (p.folderGroups && typeof p.folderGroups === "object") {
      for (const [k, v] of Object.entries(p.folderGroups as Record<string, unknown>)) if (typeof v === "string") folderGroups[k] = v;
    }
  } catch { /* 기본값 */ }
  const count = fc.pending;
  const counts = fc.counts;

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
          folderOrder={folderOrder}
          folderGroups={folderGroups}
        />
        <main className="main">{children}</main>
      </div>
      <DragAutoScroll />
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
