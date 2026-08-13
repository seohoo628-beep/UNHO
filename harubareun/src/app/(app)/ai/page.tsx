import { createSupabaseServerClient } from "@/lib/supabase/server";
import AgentRunner from "@/components/AgentRunner";
import { fmtDateTime } from "@/lib/time";
import type { ComplianceFinding } from "@/lib/types";

const AGENT_LABEL: Record<string, string> = {
  marketer: "마케터",
  md: "MD",
  designer: "디자이너",
};

export const dynamic = "force-dynamic";

const APPROVAL_LABEL: Record<string, { t: string; c: string }> = {
  pending: { t: "승인 대기", c: "warn" },
  approved: { t: "승인됨", c: "ok" },
  rejected: { t: "반려됨", c: "owner" },
  revision_requested: { t: "수정 요청", c: "warn" },
};

export default async function AiPage() {
  const supabase = createSupabaseServerClient();

  const [{ data: enabled }, { data: disabled }, { data: outputs }] =
    await Promise.all([
      supabase.from("brands").select("id, name").eq("ai_enabled", true).order("name"),
      supabase
        .from("brands")
        .select("id, name, note")
        .eq("ai_enabled", false)
        .order("name"),
      supabase
        .from("ai_outputs")
        .select(
          "id, title, agent_type, compliance_status, approval_status, model, created_at, brands(name), compliance_checks(findings, verdict), attachments(storage_path, file_name)"
        )
        .order("created_at", { ascending: false })
        .limit(25),
    ]);

  const publicUrl = (path: string) =>
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/generated-media/${path}`;

  const rows = (outputs ?? []) as unknown as {
    id: string;
    title: string | null;
    agent_type: string;
    compliance_status: string;
    approval_status: string;
    model: string | null;
    created_at: string;
    brands: { name: string } | null;
    compliance_checks: { findings: ComplianceFinding[]; verdict: string }[] | null;
    attachments: { storage_path: string; file_name: string | null }[] | null;
  }[];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>AI 직원</h1>
          <p>
            마케터(평일 09:00)·MD(평일 10:00) 자동 실행, 디자이너는 요청 시. 브랜드의
            카테고리·규제 근거·VI 팔레트·톤을 DB에서 읽어 초안을 만든다. 검수 통과분만 승인 큐로 간다.
          </p>
        </div>
      </div>

      <AgentRunner brands={(enabled ?? []) as { id: string; name: string }[]} />

      {(disabled ?? []).length > 0 && (
        <div className="flag" style={{ marginBottom: 16 }}>
          자동 생성 제외 브랜드:{" "}
          {(disabled ?? []).map((b) => (b as { name: string }).name).join(", ")}.
          의료광고 사전심의 대상 또는 계약 전 파트너 법인 소속이라 실행 대상에서 뺀다.
        </div>
      )}

      <div className="section-title">최근 산출물</div>
      <div className="card" style={{ padding: 0 }}>
        {rows.length === 0 ? (
          <div className="empty">
            아직 산출물이 없습니다. 위에서 수동 실행하거나 평일 09:00 자동 실행을 기다립니다.
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>생성 시각</th>
                <th>에이전트</th>
                <th>브랜드</th>
                <th>제목</th>
                <th>검수</th>
                <th>승인</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => {
                const ap = APPROVAL_LABEL[o.approval_status] ?? {
                  t: o.approval_status,
                  c: "",
                };
                const findings =
                  o.compliance_checks?.[o.compliance_checks.length - 1]?.findings ?? [];
                return (
                  <tr key={o.id}>
                    <td className="mono">{fmtDateTime(o.created_at)}</td>
                    <td>
                      <span className="badge accent">
                        {AGENT_LABEL[o.agent_type] ?? o.agent_type}
                      </span>
                    </td>
                    <td>{o.brands?.name ?? "-"}</td>
                    <td>
                      {o.title ?? "-"}
                      {(o.attachments ?? []).length > 0 && (
                        <div style={{ marginTop: 6 }}>
                          {(o.attachments ?? []).map((a, i) => (
                            <img
                              key={i}
                              src={publicUrl(a.storage_path)}
                              alt="썸네일"
                              style={{
                                width: 84,
                                height: 84,
                                objectFit: "cover",
                                borderRadius: 8,
                                border: "1px solid var(--line)",
                                marginRight: 6,
                              }}
                            />
                          ))}
                        </div>
                      )}
                      {o.compliance_status === "fail" && findings.length > 0 && (
                        <div style={{ marginTop: 6 }}>
                          {findings.map((f, i) => (
                            <div key={i} className="flag">
                              <b>[{f.rule}] “{f.phrase}”</b> — {f.reason}
                              <div className="fix">대체 제안: {f.suggestion}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      {o.compliance_status === "pass" ? (
                        <span className="badge ok">통과</span>
                      ) : o.compliance_status === "fail" ? (
                        <span className="badge owner">미통과</span>
                      ) : (
                        <span className="badge">검수 중</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${ap.c}`}>{ap.t}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
