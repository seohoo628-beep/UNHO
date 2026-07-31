import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";
import PrintButton from "@/components/PrintButton";
import PerformanceForm from "@/components/PerformanceForm";
import PerformanceImport from "@/components/PerformanceImport";
import { fmtDate, fmtDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

const AGENT_LABEL: Record<string, string> = {
  marketer: "마케터",
  md: "MD",
  designer: "디자이너",
};

export default async function ReportsPage() {
  await requireAppUser();
  const supabase = createSupabaseServerClient();

  const weekStart = new Date(Date.now() - 7 * 86400000).toISOString();

  const [
    { data: outputs },
    { data: approvals },
    { count: pending },
    { data: perf },
    { data: brands },
    { data: recentApproved },
  ] = await Promise.all([
    supabase
      .from("ai_outputs")
      .select("agent_type, compliance_status, approval_status, created_at")
      .gte("created_at", weekStart),
    supabase
      .from("approvals")
      .select("decision, decided_at")
      .gte("decided_at", weekStart),
    supabase
      .from("ai_outputs")
      .select("id", { count: "exact", head: true })
      .eq("compliance_status", "pass")
      .eq("approval_status", "pending"),
    supabase
      .from("performance")
      .select("channel, reach, conversions, revenue, recorded_at, brands(name)")
      .order("recorded_at", { ascending: false })
      .limit(50),
    supabase.from("brands").select("id, name").order("name"),
    supabase
      .from("ai_outputs")
      .select("id, title, brands(name)")
      .eq("approval_status", "approved")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const outs = (outputs ?? []) as { agent_type: string; compliance_status: string }[];
  const byAgent: Record<string, number> = {};
  for (const o of outs) byAgent[o.agent_type] = (byAgent[o.agent_type] ?? 0) + 1;
  const passCount = outs.filter((o) => o.compliance_status === "pass").length;
  const failCount = outs.filter((o) => o.compliance_status === "fail").length;

  const apprs = (approvals ?? []) as { decision: string }[];
  const approved = apprs.filter((a) => a.decision === "approved").length;
  const rejected = apprs.filter((a) => a.decision === "rejected").length;
  const revision = apprs.filter((a) => a.decision === "revision_requested").length;

  const perfRows = (perf ?? []) as unknown as {
    channel: string | null;
    reach: number | null;
    conversions: number | null;
    revenue: number | null;
    recorded_at: string;
    brands: { name: string } | null;
  }[];
  const revenueSum = perfRows.reduce((s, r) => s + (r.revenue ?? 0), 0);

  const outputOpts = (recentApproved ?? []).map((o) => {
    const r = o as unknown as { id: string; title: string | null; brands: { name: string } | null };
    return { id: r.id, label: `${r.brands?.name ?? ""} ${r.title ?? ""}`.trim() };
  });

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>주간 리포트</h1>
          <p>최근 7일 집계. 숫자만이 아니라 무엇을 결정해야 하는지까지 본다.</p>
        </div>
        <div className="btn-row">
          <PerformanceImport />
          <PerformanceForm
            brands={(brands ?? []) as { id: string; name: string }[]}
            outputs={outputOpts}
          />
          <PrintButton />
        </div>
      </div>

      <div className="grid cols-3">
        <div className="card">
          <div className="stat alert">
            <div className="lbl">현재 승인 대기</div>
            <div className="n">{pending ?? 0}</div>
            <div className="decide">주 시작 전에 이걸 비운다.</div>
          </div>
        </div>
        <div className="card">
          <div className="stat">
            <div className="lbl">이번 주 AI 산출물</div>
            <div className="n">{outs.length}</div>
            <div className="decide">
              통과 {passCount} · 미통과 {failCount}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="stat">
            <div className="lbl">이번 주 승인 결정</div>
            <div className="n">{apprs.length}</div>
            <div className="decide">
              승인 {approved} · 반려 {rejected} · 수정 {revision}
            </div>
          </div>
        </div>
      </div>

      <div className="section-title">에이전트별 생성</div>
      <div className="card">
        {Object.keys(byAgent).length === 0 ? (
          <div className="muted">이번 주 생성된 산출물이 없습니다.</div>
        ) : (
          <div className="row">
            {Object.entries(byAgent).map(([k, n]) => (
              <div key={k} className="stat">
                <div className="lbl">{AGENT_LABEL[k] ?? k}</div>
                <div className="n">{n}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="section-title">성과 기록 (매출 합계 {revenueSum.toLocaleString()}원)</div>
      <div className="card" style={{ padding: 0 }}>
        {perfRows.length === 0 ? (
          <div className="empty">기록된 성과가 없습니다. 상단 "성과 기록"으로 입력합니다.</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>일자</th>
                <th>브랜드</th>
                <th>채널</th>
                <th>도달</th>
                <th>전환</th>
                <th>매출(원)</th>
              </tr>
            </thead>
            <tbody>
              {perfRows.map((r, i) => (
                <tr key={i}>
                  <td>{fmtDate(r.recorded_at)}</td>
                  <td>{r.brands?.name ?? "-"}</td>
                  <td>{r.channel ?? "-"}</td>
                  <td>{r.reach?.toLocaleString() ?? "-"}</td>
                  <td>{r.conversions?.toLocaleString() ?? "-"}</td>
                  <td>{r.revenue?.toLocaleString() ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="muted" style={{ marginTop: 20, fontSize: 12 }}>
        생성 {fmtDateTime(new Date().toISOString())} · 운호컴퍼니 운영 플랫폼
      </p>
    </div>
  );
}
