import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";
import ApprovalCard, { type ApprovalItem } from "@/components/ApprovalCard";
import RunPlanningButton from "@/components/RunPlanningButton";
import { fmtDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 승인 시 서버에서 썸네일 생성

export default async function ApprovalsPage() {
  const user = await requireAppUser();
  const supabase = createSupabaseServerClient();

  const publicUrl = (path: string) =>
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/generated-media/${path}`;

  const [{ data }, { data: recentImages }] = await Promise.all([
    supabase
      .from("ai_outputs")
      .select(
        "id, title, body, model, created_at, compliance_status, brands(name), compliance_checks(findings, verdict)"
      )
      .eq("agent_type", "marketer") // 콘텐츠 기획(마케터)만
      .in("compliance_status", ["pass", "fail"])
      .eq("approval_status", "pending")
      .order("created_at", { ascending: true }),
    supabase
      .from("attachments")
      .select("id, storage_path, created_at, ai_outputs(title, approval_status, brands(name))")
      .not("ai_output_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const items: ApprovalItem[] = (data ?? []).map((o) => {
    const row = o as unknown as {
      id: string;
      title: string | null;
      body: string | null;
      model: string | null;
      created_at: string;
      compliance_status: "pass" | "fail";
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
      complianceStatus: row.compliance_status,
      findings: latest?.findings ?? [],
    };
  });

  const canApprove = user.role === "owner";

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>자동기획 콘텐츠 승인</h1>
          <p>
            <b>콘텐츠 기획(마케터)</b> 산출물만 올라온다. 승인하면 <b>집행 업무가 자동 생성</b>되어
            릴스·숏츠 생성으로 이어진다. (MD·디자이너 자동기획은 별도 폴더에서 승인)
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {canApprove && <RunPlanningButton />}
          <span className="badge owner">대기 {items.length}건</span>
        </div>
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

      {(recentImages ?? []).length > 0 && (
        <>
          <div className="section-title">최근 생성 썸네일 (승인 시 자동 생성)</div>
          <div className="card">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {(recentImages ?? []).map((a) => {
                const r = a as unknown as {
                  id: string;
                  storage_path: string;
                  ai_outputs: { title: string | null; brands: { name: string } | null } | null;
                };
                return (
                  <a
                    key={r.id}
                    href={publicUrl(r.storage_path)}
                    target="_blank"
                    rel="noreferrer"
                    style={{ width: 140 }}
                  >
                    <img
                      src={publicUrl(r.storage_path)}
                      alt="생성 썸네일"
                      style={{
                        width: 140,
                        height: 140,
                        objectFit: "cover",
                        borderRadius: 10,
                        border: "1px solid var(--line)",
                      }}
                    />
                    <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                      {r.ai_outputs?.brands?.name ?? ""} {r.ai_outputs?.title ?? ""}
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
