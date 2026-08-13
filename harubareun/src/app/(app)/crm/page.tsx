import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getScopeBrandId } from "@/lib/brandScope";
import { LeadForm, LeadStageSelect, FollowUpCell } from "@/components/Crm";
import { fmtDate, seoulToday } from "@/lib/time";
import type { Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CrmPage({
  searchParams,
}: {
  searchParams: { kind?: string };
}) {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");
  const supabase = createSupabaseServerClient();
  const scopeId = await getScopeBrandId();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byBrand = (q: any) => (scopeId ? q.eq("brand_id", scopeId) : q);

  const [{ data: brands }, { data: leadsData }] = await Promise.all([
    supabase.from("brands").select("id, name").order("name"),
    byBrand(supabase.from("crm_leads").select("*, brands(name)"))
      .order("updated_at", { ascending: false })
      .limit(500),
  ]);

  let leads = (leadsData ?? []) as unknown as (Lead & { brands: { name: string } | null })[];
  const kind = searchParams.kind;
  if (kind === "seller" || kind === "buyer") leads = leads.filter((l) => l.kind === kind);

  // 퍼널 지표
  const proposed = leads.filter((l) => l.proposed_at).length;
  const replied = leads.filter((l) => l.replied_at).length;
  const won = leads.filter((l) => l.result === "won").length;
  const replyRate = proposed ? Math.round((replied / proposed) * 100) : 0;
  const winRate = proposed ? Math.round((won / proposed) * 100) : 0;

  const today = seoulToday();
  const dueFollow = leads.filter(
    (l) => l.next_follow_up && l.next_follow_up <= today && !["성사", "실패"].includes(l.stage)
  );

  const stageBadge = (s: string) =>
    s === "성사" ? "ok" : s === "실패" ? "owner" : s === "회신" || s === "협의" ? "accent" : "";

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>셀러·바이어 CRM</h1>
          <p>제안→회신→성사 파이프라인. 회신율·성사율을 추적하고 팔로업 기한을 관리한다.</p>
        </div>
        <LeadForm brands={(brands ?? []) as { id: string; name: string }[]} />
      </div>

      {/* 필터 */}
      <div className="btn-row" style={{ marginBottom: 14 }}>
        <a className="btn sm" href="/crm">전체</a>
        <a className="btn sm" href="/crm?kind=seller">셀러</a>
        <a className="btn sm" href="/crm?kind=buyer">바이어</a>
      </div>

      {/* 퍼널 지표 */}
      <div className="grid cols-3">
        <div className="card">
          <div className="stat">
            <div className="lbl">제안 건수</div>
            <div className="n">{proposed}</div>
            <div className="decide">전체 리드 {leads.length}건 중 제안 진행</div>
          </div>
        </div>
        <div className="card">
          <div className="stat">
            <div className="lbl">회신율</div>
            <div className="n">{replyRate}%</div>
            <div className="decide">회신 {replied} / 제안 {proposed}</div>
          </div>
        </div>
        <div className="card">
          <div className="stat">
            <div className="lbl">성사율</div>
            <div className="n">{winRate}%</div>
            <div className="decide">성사 {won} / 제안 {proposed}</div>
          </div>
        </div>
      </div>

      {/* 오늘까지 팔로업 */}
      {dueFollow.length > 0 && (
        <>
          <div className="section-title">팔로업 필요 (기한 지남·오늘)</div>
          <div className="card" style={{ padding: 0 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>이름</th>
                  <th>단계</th>
                  <th>팔로업일</th>
                  <th>메모</th>
                </tr>
              </thead>
              <tbody>
                {dueFollow.map((l) => (
                  <tr key={l.id} className="wait-owner">
                    <td>{l.name}</td>
                    <td>{l.stage}</td>
                    <td>{fmtDate(l.next_follow_up)}</td>
                    <td>{l.note ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 리드 목록 */}
      <div className="section-title">리드 ({leads.length})</div>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        {leads.length === 0 ? (
          <div className="empty">등록된 리드가 없습니다. "리드 등록"으로 추가하세요.</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>구분</th>
                <th>이름</th>
                <th>브랜드</th>
                <th>제품</th>
                <th>단계</th>
                <th>팔로업일</th>
                <th>제안·회신</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id}>
                  <td>
                    <span className="badge">{l.kind === "seller" ? "셀러" : "바이어"}</span>
                  </td>
                  <td>
                    {l.name}
                    {l.handle && (
                      <div className="muted" style={{ fontSize: 11 }}>{l.handle}</div>
                    )}
                  </td>
                  <td>{l.brands?.name ?? "-"}</td>
                  <td>{l.product ?? "-"}</td>
                  <td>
                    <span className={`badge ${stageBadge(l.stage)}`} style={{ marginBottom: 4 }}>
                      {l.stage}
                    </span>
                    <LeadStageSelect leadId={l.id} stage={l.stage} />
                  </td>
                  <td>
                    <FollowUpCell leadId={l.id} value={l.next_follow_up} />
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {l.proposed_at ? `제안 ${fmtDate(l.proposed_at)}` : "-"}
                    {l.replied_at ? ` · 회신 ${fmtDate(l.replied_at)}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
