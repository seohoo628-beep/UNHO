import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAppUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSetting } from "@/lib/settings";
import { getAnthropicKey } from "@/lib/anthropic";
import { fmtDate } from "@/lib/time";
import { CADENCE_LABEL, ROUTINE_SELECT, isMissingRoutines, type RoutineRow } from "@/lib/agentRoutines";
import { CONTEXT_KEYS } from "@/lib/agents/routine";
import {
  RoutinesEnabledSwitch,
  RunAllRoutinesButton,
  RoutineActions,
  RoutineEditor,
  type RoutineView,
} from "@/components/AgentRoutineControls";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // "지금 실행"이 AI 호출을 기다린다.

const CONTEXT_LABEL: Record<string, string> = {
  receivables: "미수금",
  payables: "미지급금",
  purchase_orders: "발주",
  pnl: "P&L",
  mdt: "무당티 재고·판매처",
  inventory: "재고",
  promotions: "프로모션",
  brands: "브랜드",
  todos: "진행 중 업무",
  leave: "휴가",
  reviews: "리뷰 스냅샷",
  crm_leads: "공구·입점 리드",
  product_dev: "제품 개발",
  store_meetings: "매장 회의",
  agent_reports: "오늘 정기업무 결과",
};

const STATUS_COLOR: Record<string, string> = {
  대기: "#94a3b8",
  실행중: "#0ea5e9",
  완료: "#16a34a",
  실패: "#dc2626",
};

type Agent = { id: string; name: string; job_title: string | null; agent_key: string };
type RunRow = {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  routine_id: string;
  routine_period: string;
  agent_status: string | null;
  agent_error: string | null;
  agent_run_at: string | null;
};

export default async function AgentRoutinesPage() {
  const user = await requireAppUser();
  if (user.role !== "owner" && user.role !== "staff") redirect("/hub");
  const supabase = createSupabaseServerClient();

  const [agentsRes, routinesRes, enabledSetting, apiKey] = await Promise.all([
    supabase.from("users").select("id, name, job_title, agent_key").eq("role", "ai").not("agent_key", "is", null).order("name"),
    supabase.from("agent_routines").select(ROUTINE_SELECT).order("cadence").order("weekday", { nullsFirst: true }).order("title"),
    getSetting("agent_routines_enabled").catch(() => null),
    getAnthropicKey().catch(() => null),
  ]);
  const needsMigration = isMissingRoutines(agentsRes.error) || isMissingRoutines(routinesRes.error);
  const agents = (agentsRes.data ?? []) as Agent[];
  const routines = (routinesRes.data ?? []) as RoutineRow[];
  const enabled = enabledSetting !== "false";

  let runs: RunRow[] = [];
  if (!needsMigration && routines.length) {
    const since = new Date(Date.now() - 14 * 86400000).toISOString();
    const { data } = await supabase
      .from("todos")
      .select("id, title, status, due_date, routine_id, routine_period, agent_status, agent_error, agent_run_at")
      .not("routine_id", "is", null)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200);
    runs = (data ?? []) as RunRow[];
  }
  const runsByRoutine = new Map<string, RunRow[]>();
  for (const r of runs) (runsByRoutine.get(r.routine_id) ?? runsByRoutine.set(r.routine_id, []).get(r.routine_id)!).push(r);

  const toView = (r: RoutineRow): RoutineView => ({
    id: r.id,
    title: r.title,
    cadence: r.cadence,
    weekday: r.weekday,
    due_offset_days: r.due_offset_days,
    priority: r.priority,
    context_keys: r.context_keys ?? [],
    instructions: r.instructions,
    auto_run: r.auto_run,
    requires_review: r.requires_review,
    active: r.active,
  });

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>AI 에이전트 정기업무</h1>
          <p>
            부서별 AI 에이전트가 매일·매주 맡는 업무입니다. 정해진 날 아침 업무투두에 마감일과 함께 등록되고,
            에이전트가 데이터를 읽어 결과를 해당 업무 본문에 작성하고, 다음 액션은 체크리스트로 올립니다. 대외 발송·금액 확정은 하지 않습니다.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
          <Link className="btn" href="/todos">업무투두 보기</Link>
          <RoutinesEnabledSwitch enabled={enabled} canEdit={user.role === "owner"} />
          {user.role === "owner" && <RunAllRoutinesButton />}
        </div>
      </div>

      {needsMigration && (
        <div className="card" style={{ borderLeft: "4px solid #f59e0b", marginBottom: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>DB 준비 필요</div>
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
            Supabase SQL Editor에서 <span className="mono">supabase/migrations/0100_agent_routines.sql</span> 전체를 실행하면
            AI 에이전트 7명과 기본 정기업무 13건이 등록됩니다.
          </p>
        </div>
      )}

      {!needsMigration && (
        <div className="card" style={{ marginBottom: 14, fontSize: 13 }}>
          <div>
            자동 실행: <b>{enabled ? "켜짐" : "꺼짐"}</b> · 실행 시각: 매일 07:10~10:10 사이 매시 10분(회차당 최대 6건) ·
            AI 키: <b>{apiKey ? "연결됨" : "없음 — 설정에서 등록 필요"}</b>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            검토 대기 업무는 실행 후 &lsquo;진행&rsquo;(진행률 90%)으로 남고, 결과를 확인한 사람이 완료 처리합니다.
            실패한 업무는 마감일까지 다음 회차에 다시 시도합니다.
          </div>
        </div>
      )}

      {agents.map((a) => {
        const list = routines.filter((r) => r.agent_key === a.agent_key);
        return (
          <section key={a.id} className="card" style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: 17 }}>{a.name}</h2>
              <span className="muted" style={{ fontSize: 12 }}>{a.job_title} · 정기업무 {list.length}건</span>
            </div>

            {list.length === 0 && <div className="empty">등록된 정기업무가 없습니다.</div>}

            {list.map((r) => {
              const recent = (runsByRoutine.get(r.id) ?? []).slice(0, 5);
              return (
                <div key={r.id} style={{ borderTop: "1px solid var(--border, #e5e7eb)", paddingTop: 10, marginTop: 10, opacity: r.active ? 1 : 0.55 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
                    <b>{r.title}</b>
                    <span className="badge">{CADENCE_LABEL(r)}</span>
                    <span className="badge">마감 +{r.due_offset_days}영업일</span>
                    <span className="badge">{r.priority}</span>
                    {!r.active && <span className="badge">중지</span>}
                    {!r.auto_run && <span className="badge">투두만 생성</span>}
                    <span className="badge">{r.requires_review ? "검토 후 완료" : "자동 완료"}</span>
                  </div>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{r.instructions}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    참고 데이터: {(r.context_keys ?? []).map((k) => CONTEXT_LABEL[k] ?? k).join(", ") || "없음"}
                  </div>

                  {recent.length > 0 && (
                    <div style={{ fontSize: 12, marginTop: 6, display: "grid", gap: 2 }}>
                      {recent.map((t) => (
                        <div key={t.id}>
                          <span style={{ color: STATUS_COLOR[t.agent_status ?? ""] ?? "#64748b", fontWeight: 600 }}>
                            {t.agent_status ?? "수동"}
                          </span>{" "}
                          · {t.routine_period.slice(2)} · 마감 {fmtDate(t.due_date)} · 투두 {t.status}
                          {t.agent_error && <span style={{ color: "#dc2626" }}> · {t.agent_error}</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ marginTop: 8 }}>
                    <RoutineActions r={toView(r)} />
                  </div>
                  <details style={{ marginTop: 6 }}>
                    <summary className="muted" style={{ cursor: "pointer", fontSize: 12.5 }}>수정</summary>
                    <RoutineEditor agentKey={a.agent_key} r={toView(r)} contextKeys={CONTEXT_KEYS} contextLabels={CONTEXT_LABEL} />
                  </details>
                </div>
              );
            })}

            <details style={{ marginTop: 10 }}>
              <summary className="muted" style={{ cursor: "pointer", fontSize: 12.5 }}>+ 정기업무 추가</summary>
              <RoutineEditor agentKey={a.agent_key} contextKeys={CONTEXT_KEYS} contextLabels={CONTEXT_LABEL} />
            </details>
          </section>
        );
      })}
    </div>
  );
}
