import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isOverdue, fmtDate, fmtDateTime, seoulToday } from "@/lib/time";

export const dynamic = "force-dynamic";

type TaskRow = {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  wait_target: string | null;
  wait_reason: string | null;
  brands: { name: string } | null;
};

export default async function DashboardPage() {
  const supabase = createSupabaseServerClient();

  const weekStart = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const [
    { count: pending },
    { count: blocked },
    { data: tasks },
    { data: recent },
    { data: perf },
    { data: leadsDue },
  ] = await Promise.all([
      supabase
        .from("ai_outputs")
        .select("id", { count: "exact", head: true })
        .in("compliance_status", ["pass", "fail"])
        .eq("approval_status", "pending"),
      supabase
        .from("ai_outputs")
        .select("id", { count: "exact", head: true })
        .eq("compliance_status", "fail")
        .eq("approval_status", "pending"),
      supabase
        .from("tasks")
        .select("id, title, status, due_date, wait_target, wait_reason, brands(name)")
        .not("status", "in", "(완료,취소)")
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(200),
      supabase
        .from("approvals")
        .select("id, decision, reason, decided_at, ai_outputs(title, brands(name))")
        .order("decided_at", { ascending: false })
        .limit(6),
      supabase
        .from("performance")
        .select("revenue, conversions, brand_id, brands(name)")
        .gte("recorded_at", weekStart),
      supabase
        .from("crm_leads")
        .select("id, name, stage, next_follow_up, kind")
        .not("stage", "in", "(성사,실패)")
        .not("next_follow_up", "is", null)
        .lte("next_follow_up", seoulToday())
        .order("next_follow_up", { ascending: true })
        .limit(50),
    ]);

  const followUpCount = (leadsDue ?? []).length;

  // 완성 콘텐츠: 집행 완료된 업무의 남은 썸네일 이미지들(완료 시 여기로 모인다).
  let contentThumbs: { taskId: string; title: string; brand: string; urls: string[] }[] = [];
  {
    const dt = await supabase
      .from("tasks")
      .select("id, title, thumb_urls, completed_date, brands(name)")
      .eq("status", "완료")
      .order("completed_date", { ascending: false })
      .limit(60);
    if (!dt.error) {
      contentThumbs = ((dt.data ?? []) as unknown as {
        id: string;
        title: string;
        thumb_urls: string[] | null;
        brands: { name: string } | null;
      }[])
        .map((t) => ({
          taskId: t.id,
          title: (t.title ?? "").replace(/^\[집행\]\s*/, ""),
          brand: t.brands?.name ?? "",
          urls: (t.thumb_urls ?? []) as string[],
        }))
        .filter((t) => t.urls.length > 0);
    }
  }
  const dl = (url: string, name: string) => `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(name)}`;
  const totalThumbs = contentThumbs.reduce((s, t) => s + t.urls.length, 0);

  const perfRows = (perf ?? []) as unknown as {
    revenue: number | null;
    conversions: number | null;
    brands: { name: string } | null;
  }[];
  const revenue7 = perfRows.reduce((s, r) => s + (r.revenue ?? 0), 0);
  const conv7 = perfRows.reduce((s, r) => s + (r.conversions ?? 0), 0);
  const byBrand = new Map<string, number>();
  for (const r of perfRows) {
    const name = r.brands?.name ?? "-";
    byBrand.set(name, (byBrand.get(name) ?? 0) + (r.revenue ?? 0));
  }
  const topBrands = [...byBrand.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const rows = (tasks ?? []) as unknown as TaskRow[];
  const delayed = rows.filter(
    (t) => t.status === "지연" || isOverdue(t.due_date, t.status)
  );
  const waitOwner = rows.filter((t) => (t.wait_target ?? "").includes("대표"));

  const decisionLabel: Record<string, string> = {
    approved: "승인",
    rejected: "반려",
    revision_requested: "수정 요청",
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>대시보드</h1>
          <p>아침에 이 화면 하나로 오늘 결정할 것을 본다.</p>
        </div>
      </div>

      {/* 최상단: 대표 승인 대기 */}
      <Link href="/approvals">
        <div className="card" style={{ borderColor: (pending ?? 0) > 0 ? "var(--owner)" : undefined }}>
          <div className="stat alert">
            <div className="lbl">대표 승인 대기</div>
            <div className="n">{pending ?? 0}</div>
            <div className="decide">
              {(pending ?? 0) > 0
                ? "승인 큐에서 승인 또는 반려를 지금 결정한다."
                : "지금 승인을 기다리는 산출물이 없다."}
            </div>
          </div>
        </div>
      </Link>

      {/* 완성 콘텐츠(썸네일) — 집행 완료 시 여기로 모인다 */}
      <div className="section-title" style={{ marginTop: 18 }}>완성 콘텐츠 · 썸네일 ({totalThumbs})</div>
      {contentThumbs.length === 0 ? (
        <div className="card">
          <div className="empty">아직 완성된 콘텐츠가 없습니다. 집행 센터에서 썸네일을 만들고 <b>집행 완료</b>를 누르면 여기로 모입니다.</div>
        </div>
      ) : (
        contentThumbs.map((t) => (
          <div key={t.taskId} className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              {t.brand && <span className="badge accent">{t.brand}</span>}
              <strong style={{ fontSize: 14 }}>{t.title}</strong>
              <span className="muted" style={{ fontSize: 12 }}>· {t.urls.length}장</span>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {t.urls.map((url, i) => (
                <div key={i} style={{ width: 130 }}>
                  <a href={url} target="_blank" rel="noreferrer" title="원본 열기">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="썸네일" style={{ width: 130, height: 130, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line-2)", display: "block" }} />
                  </a>
                  <a
                    className="btn sm"
                    href={dl(url, `${t.brand || "content"}-${i + 1}.jpg`)}
                    style={{ width: "100%", justifyContent: "center", marginTop: 4 }}
                  >
                    ⬇ 다운로드
                  </a>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      <div className="grid cols-3" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="stat">
            <div className="lbl">규제 검수 미통과 (승인 대기)</div>
            <div className="n">{blocked ?? 0}</div>
            <div className="decide">
              승인 큐에 함께 올라온다. 지적 문구·대체 제안을 보고 승인·반려·수정 판단.
            </div>
          </div>
        </div>
        <div className="card">
          <div className="stat">
            <div className="lbl">지연 업무</div>
            <div className="n">{delayed.length}</div>
            <div className="decide">
              목표일이 지났다. 대기 대상이 대표인지 먼저 확인한다.
            </div>
          </div>
        </div>
        <div className="card">
          <div className="stat alert">
            <div className="lbl">대표 회신 대기</div>
            <div className="n">{waitOwner.length}</div>
            <div className="decide">
              대표 결정을 기다리는 업무다. 여기서 막히면 전체가 멈춘다.
            </div>
          </div>
        </div>
      </div>

      {/* 대표 회신 대기 상세 */}
      {waitOwner.length > 0 && (
        <>
          <div className="section-title">대표 회신 대기 업무</div>
          <div className="card" style={{ padding: 0 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>브랜드</th>
                  <th>업무</th>
                  <th>대기 사유</th>
                  <th>목표일</th>
                </tr>
              </thead>
              <tbody>
                {waitOwner.map((t) => (
                  <tr key={t.id} className="wait-owner">
                    <td>{t.brands?.name ?? "-"}</td>
                    <td>{t.title}</td>
                    <td>{t.wait_reason ?? "-"}</td>
                    <td>{fmtDate(t.due_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* CRM 팔로업 */}
      <div className="grid cols-2" style={{ marginTop: 14 }}>
        <Link href="/crm">
          <div className="card">
            <div className={`stat${followUpCount > 0 ? " alert" : ""}`}>
              <div className="lbl">셀러·바이어 팔로업 필요</div>
              <div className="n">{followUpCount}</div>
              <div className="decide">
                {followUpCount > 0
                  ? "팔로업 기한이 지났거나 오늘이다. CRM에서 처리한다."
                  : "오늘 팔로업할 리드가 없다."}
              </div>
            </div>
          </div>
        </Link>
        <div className="card" style={{ display: "flex", alignItems: "center" }}>
          <div className="muted" style={{ fontSize: 13 }}>
            셀러·바이어 CRM에서 제안→회신→성사 파이프라인과 회신율·성사율을 관리합니다.
          </div>
        </div>
      </div>

      {/* 최근 7일 성과 (성과 CSV 업로드분) */}
      <div className="section-title">최근 7일 성과</div>
      <div className="grid cols-2">
        <div className="card">
          <div className="stat">
            <div className="lbl">매출 합계 (7일)</div>
            <div className="n">{revenue7.toLocaleString()}원</div>
            <div className="decide">전환 {conv7.toLocaleString()}건</div>
          </div>
        </div>
        <div className="card">
          <div className="lbl" style={{ fontSize: 13, color: "var(--ink-2)" }}>
            브랜드별 매출 상위
          </div>
          {topBrands.length === 0 ? (
            <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              리포트에서 성과 CSV를 업로드하면 여기에 집계됩니다.
            </div>
          ) : (
            <table className="tbl" style={{ marginTop: 6 }}>
              <tbody>
                {topBrands.map(([name, rev]) => (
                  <tr key={name}>
                    <td>{name}</td>
                    <td style={{ textAlign: "right" }}>{rev.toLocaleString()}원</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 최근 결정 — 담당자에게 결과가 전달된 흐름 */}
      <div className="section-title">최근 승인 결정</div>
      <div className="card" style={{ padding: 0 }}>
        {(recent ?? []).length === 0 ? (
          <div className="empty">아직 승인 결정 이력이 없습니다.</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>시각</th>
                <th>브랜드</th>
                <th>산출물</th>
                <th>결정</th>
                <th>사유</th>
              </tr>
            </thead>
            <tbody>
              {(recent ?? []).map((r) => {
                const rr = r as unknown as {
                  id: string;
                  decision: string;
                  reason: string | null;
                  decided_at: string;
                  ai_outputs: { title: string | null; brands: { name: string } | null } | null;
                };
                return (
                  <tr key={rr.id}>
                    <td className="mono">{fmtDateTime(rr.decided_at)}</td>
                    <td>{rr.ai_outputs?.brands?.name ?? "-"}</td>
                    <td>{rr.ai_outputs?.title ?? "-"}</td>
                    <td>
                      <span
                        className={`badge ${
                          rr.decision === "approved"
                            ? "ok"
                            : rr.decision === "rejected"
                            ? "owner"
                            : "warn"
                        }`}
                      >
                        {decisionLabel[rr.decision] ?? rr.decision}
                      </span>
                    </td>
                    <td>{rr.reason ?? "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="muted" style={{ marginTop: 20, fontSize: 12 }}>
        발주 임박 품목·90일 초과 미수는 Phase 2(거래처·발주)에서 이 화면에 추가된다.
      </p>
    </div>
  );
}
