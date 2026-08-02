import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";
import ApprovalCard, { type ApprovalItem } from "@/components/ApprovalCard";
import { fmtDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const AGENT_LABEL: Record<string, string> = { md: "MD", designer: "디자이너" };

export default async function PlanningPage() {
  const user = await requireAppUser();
  const supabase = createSupabaseServerClient();

  const { data } = await supabase
    .from("ai_outputs")
    .select(
      "id, title, body, model, created_at, agent_type, compliance_status, brands(name), compliance_checks(findings, verdict)"
    )
    .in("agent_type", ["md", "designer"])
    .in("compliance_status", ["pass", "fail"])
    .eq("approval_status", "pending")
    .order("created_at", { ascending: true });

  const items: (ApprovalItem & { agent: string })[] = (data ?? []).map((o) => {
    const row = o as unknown as {
      id: string;
      title: string | null;
      body: string | null;
      model: string | null;
      created_at: string;
      agent_type: string;
      compliance_status: "pass" | "fail";
      brands: { name: string } | null;
      compliance_checks: { findings: ApprovalItem["findings"]; verdict: string }[] | null;
    };
    const latest = row.compliance_checks?.[row.compliance_checks.length - 1];
    return {
      id: row.id,
      title: `[${AGENT_LABEL[row.agent_type] ?? row.agent_type}] ${row.title ?? ""}`,
      body: row.body,
      model: row.model,
      createdAt: fmtDateTime(row.created_at),
      brandName: row.brands?.name ?? "-",
      complianceStatus: row.compliance_status,
      findings: latest?.findings ?? [],
      agent: row.agent_type,
    };
  });

  const canApprove = user.role === "owner";

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>MD·디자이너 자동기획</h1>
          <p>
            <b>MD(셀러 매칭·제안)</b>와 <b>디자이너(지시서)</b> 자동기획 산출물을 승인·반려한다.
            콘텐츠 기획(마케터)은 ‘자동기획 콘텐츠 승인’에서 처리한다.
          </p>
        </div>
        <span className="badge owner">대기 {items.length}건</span>
      </div>

      {!canApprove && (
        <div className="flag" style={{ marginBottom: 14 }}>
          현재 계정({user.name})은 직원 권한입니다. 승인·반려는 대표만 가능합니다.
        </div>
      )}

      {items.length === 0 ? (
        <div className="card empty">승인 대기 중인 MD·디자이너 산출물이 없습니다.</div>
      ) : (
        items.map((item) => <ApprovalCard key={item.id} item={item} canApprove={canApprove} />)
      )}
    </div>
  );
}
