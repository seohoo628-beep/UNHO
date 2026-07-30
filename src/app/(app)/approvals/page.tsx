import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";
import ApprovalCard, { type ApprovalItem } from "@/components/ApprovalCard";
import { fmtDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const user = await requireAppUser();
  const supabase = createSupabaseServerClient();

  const { data } = await supabase
    .from("ai_outputs")
    .select(
      "id, title, body, model, created_at, brands(name), compliance_checks(findings, verdict)"
    )
    .eq("compliance_status", "pass")
    .eq("approval_status", "pending")
    .order("created_at", { ascending: true });

  const items: ApprovalItem[] = (data ?? []).map((o) => {
    const row = o as unknown as {
      id: string;
      title: string | null;
      body: string | null;
      model: string | null;
      created_at: string;
      brands: { name: string } | null;
      compliance_checks: { findings: ApprovalItem["findings"]; verdict: string }[] | null;
    };
    const latest = row.compliance_checks?.[row.compliance_checks.length - 1];
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      model: row.model,
      createdAt: fmtDateTime(row.created_at),
      brandName: row.brands?.name ?? "-",
      findings: latest?.findings ?? [],
    };
  });

  const canApprove = user.role === "owner";

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>승인 큐</h1>
          <p>
            규제 검수를 통과한 AI 산출물만 올라온다. 원문과 검수 결과를 한 화면에서 보고
            승인·반려·수정 요청 중 하나를 고른다.
          </p>
        </div>
        <span className="badge owner">대기 {items.length}건</span>
      </div>

      {!canApprove && (
        <div className="flag" style={{ marginBottom: 14 }}>
          현재 계정({user.name})은 직원 권한입니다. 승인·반려는 대표만 가능하며, 수정 요청은
          할 수 있습니다.
        </div>
      )}

      {items.length === 0 ? (
        <div className="card empty">승인 대기 중인 산출물이 없습니다.</div>
      ) : (
        items.map((item) => (
          <ApprovalCard key={item.id} item={item} canApprove={canApprove} />
        ))
      )}
    </div>
  );
}
