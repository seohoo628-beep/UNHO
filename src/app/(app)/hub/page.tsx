import Link from "next/link";
import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import DailyChecklist from "@/components/DailyChecklist";
import { FOLDER_GROUPS } from "@/lib/folders";

export const dynamic = "force-dynamic";

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export default async function Page() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");
  const isOwner = user.role === "owner";

  const svc = createSupabaseServiceClient();
  const today = new Date().toISOString().slice(0, 10);

  const [checks, pendingApprovals] = await Promise.all([
    safe(async () => {
      const { data } = await svc.from("daily_checks").select("item_key,done").eq("check_date", today);
      const m: Record<string, boolean> = {};
      (data ?? []).forEach((r: { item_key: string; done: boolean }) => {
        m[r.item_key] = !!r.done;
      });
      return m;
    }, {} as Record<string, boolean>),
    // 승인 페이지와 동일 기준: 마케터 + 검수완료(pass/fail) + 승인대기.
    safe(
      async () =>
        (
          await svc
            .from("ai_outputs")
            .select("*", { head: true, count: "exact" })
            .eq("agent_type", "marketer")
            .in("compliance_status", ["pass", "fail"])
            .eq("approval_status", "pending")
        ).count ?? 0,
      0
    ),
  ]);

  const hourKst = (new Date().getUTCHours() + 9) % 24;
  const greet =
    hourKst < 6 ? "늦은 밤까지 고생 많으세요" :
    hourKst < 11 ? "좋은 아침이에요" :
    hourKst < 14 ? "점심 전 마무리해요" :
    hourKst < 18 ? "좋은 오후예요" :
    hourKst < 22 ? "좋은 저녁이에요" : "오늘도 고생 많으셨어요";
  const focusLine = pendingApprovals ? `승인 대기 ${pendingApprovals}건` : "오늘 급한 알림은 없어요 👍";

  // 홈 런처: 폴더 카탈로그 공유. 자기 자신(홈)은 제외, owner 전용은 대표에게만.
  const groups = FOLDER_GROUPS.map((g) => ({
    title: g.title,
    items: g.items.filter((it) => it.href !== "/hub" && (!it.owner || isOwner)),
  })).filter((g) => g.items.length > 0);

  return (
    <div>
      {/* 히어로 인사 */}
      <div
        className="card"
        style={{
          background: "linear-gradient(120deg, var(--accent-bg), var(--surface))",
          borderColor: "var(--line)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 18,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>
            {user.name} 님, {greet} 👋
          </div>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            🗓 {today} · {focusLine}
          </div>
        </div>
        <Link href={pendingApprovals ? "/approvals" : "/todos"} className="btn primary" style={{ textDecoration: "none", flexShrink: 0 }}>
          {pendingApprovals ? `승인 ${pendingApprovals}건 처리 →` : "오늘 할 일 보기 →"}
        </Link>
      </div>

      {/* 일일 체크리스트 (유지) */}
      <DailyChecklist today={today} initialDone={checks} />

      {/* 전체 폴더 — 카테고리별 카드 런처 */}
      <div className="section-title" style={{ marginTop: 24 }}>전체 폴더</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {groups.map((g) => (
          <div key={g.title}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 8 }}>
              {g.title}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10 }}>
              {g.items.map((it) => {
                const showBadge = it.href === "/approvals" && pendingApprovals > 0;
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    className="card folder-card"
                    style={{
                      padding: "14px 14px",
                      textDecoration: "none",
                      color: "var(--ink)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      fontSize: 14,
                      fontWeight: 600,
                      minHeight: 56,
                    }}
                  >
                    <span>{it.label}</span>
                    {showBadge && <span className="count">{pendingApprovals}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
