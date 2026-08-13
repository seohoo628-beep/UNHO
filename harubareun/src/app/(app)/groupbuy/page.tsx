import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { fetchGroupBuyRows, parseGroupBuy, getGroupBuyConfig } from "@/lib/groupbuy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const won = (n: number) => Math.round(n).toLocaleString() + "원";
const num = (n: number | null) => (n == null ? "-" : n.toLocaleString());

const STATUS_BADGE: Record<string, string> = {
  "진행 확정": "ok",
  "공구 진행중": "accent",
  "공구 완료": "ok",
  미답변: "",
  거절: "owner",
  보류: "warn",
};

export default async function GroupBuyPage({
  searchParams,
}: {
  searchParams: { status?: string; manager?: string; field?: string; q?: string };
}) {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");

  const cfg = await getGroupBuyConfig();
  const sheet = await fetchGroupBuyRows();
  const data = sheet.ok && sheet.rows ? parseGroupBuy(sheet.rows) : null;

  const f = {
    status: searchParams.status ?? "",
    manager: searchParams.manager ?? "",
    field: searchParams.field ?? "",
    q: (searchParams.q ?? "").trim().toLowerCase(),
  };

  let list = data?.sellers ?? [];
  if (f.status) list = list.filter((s) => s.status === f.status);
  if (f.manager) list = list.filter((s) => s.manager === f.manager);
  if (f.field) list = list.filter((s) => s.field === f.field);
  if (f.q)
    list = list.filter((s) =>
      [s.name, s.handle, s.product, s.channel].some((v) => (v ?? "").toLowerCase().includes(f.q))
    );

  const cards = data
    ? [
        { l: "총 제안", v: num(data.kpi.total) },
        { l: "진행 확정", v: num(data.kpi.confirmed) },
        { l: "미답변", v: num(data.kpi.noReply) },
        { l: "확정 전환율", v: data.kpi.convRate + "%" },
        { l: "누적 공구 매출", v: won(data.kpi.revenue) },
        { l: "누적 본사이익", v: won(data.kpi.profit) },
      ]
    : [];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>공구 트래킹</h1>
          <p>공구셀러 관리시트(셀러리스트)를 읽어 제안·확정·매출을 집계·팔로업한다. 읽기 전용.</p>
        </div>
        <a
          className="btn"
          href={`https://docs.google.com/spreadsheets/d/${cfg.id}`}
          target="_blank"
          rel="noreferrer"
        >
          시트 열기
        </a>
      </div>

      {!sheet.ok ? (
        <div className="flag">
          {sheet.error}
          <div className="fix" style={{ marginTop: 6 }}>
            구글 시트 → 공유 → &ldquo;링크가 있는 모든 사용자&rdquo;를 <b>뷰어</b> 이상으로 설정하세요.
          </div>
        </div>
      ) : !data ? (
        <div className="flag">
          &ldquo;{cfg.tab}&rdquo; 탭에서 셀러 목록을 찾지 못했습니다. &lsquo;셀러명&rsquo;·&lsquo;제안현황&rsquo;
          헤더가 있는 탭인지 확인하세요.
        </div>
      ) : (
        <>
          {/* KPI */}
          <div className="grid cols-3">
            {cards.map((c) => (
              <div key={c.l} className="card">
                <div className="stat">
                  <div className="lbl">{c.l}</div>
                  <div className="n" style={{ fontSize: 22 }}>{c.v}</div>
                </div>
              </div>
            ))}
          </div>

          {/* 제안현황별 건수 (필터 버튼) */}
          <div className="section-title">제안현황별</div>
          <div className="btn-row" style={{ marginBottom: 14, flexWrap: "wrap" }}>
            <a className={`btn sm${!f.status ? " primary" : ""}`} href="/groupbuy">
              전체 {data.kpi.total}
            </a>
            {data.statusCounts.map((sc) => {
              const params = new URLSearchParams();
              params.set("status", sc.status);
              if (f.manager) params.set("manager", f.manager);
              if (f.field) params.set("field", f.field);
              return (
                <a
                  key={sc.status}
                  className={`btn sm${f.status === sc.status ? " primary" : ""}`}
                  href={`/groupbuy?${params.toString()}`}
                >
                  {sc.status} {sc.count}
                </a>
              );
            })}
          </div>

          {/* 담당자·분야·검색 필터 */}
          <form method="get" className="card" style={{ marginBottom: 14 }}>
            {f.status && <input type="hidden" name="status" value={f.status} />}
            <div className="row" style={{ alignItems: "end" }}>
              <label className="field" style={{ marginBottom: 0 }}>
                <span>담당자</span>
                <select name="manager" defaultValue={f.manager}>
                  <option value="">전체</option>
                  {data.managers.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label className="field" style={{ marginBottom: 0 }}>
                <span>분야</span>
                <select name="field" defaultValue={f.field}>
                  <option value="">전체</option>
                  {data.fields.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label className="field" style={{ marginBottom: 0 }}>
                <span>검색(셀러·핸들·제품)</span>
                <input type="text" name="q" defaultValue={searchParams.q ?? ""} placeholder="키워드" />
              </label>
              <div style={{ flex: "0 0 auto" }}>
                <button className="btn">적용</button>
              </div>
            </div>
          </form>

          {/* 셀러 목록 */}
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>담당</th>
                  <th>셀러</th>
                  <th>채널</th>
                  <th>분야</th>
                  <th>진행제품</th>
                  <th>팔로워</th>
                  <th>제안현황</th>
                  <th>1차 제안</th>
                  <th>공구매출</th>
                  <th>정산</th>
                  <th>링크</th>
                </tr>
              </thead>
              <tbody>
                {list.map((s, i) => (
                  <tr key={i}>
                    <td style={{ whiteSpace: "nowrap" }}>{s.manager || "-"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {s.name}
                      {s.handle ? <div className="muted" style={{ fontSize: 12 }}>{s.handle}</div> : null}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {s.channelLink ? (
                        <a href={s.channelLink} target="_blank" rel="noreferrer">{s.channel || "채널"}</a>
                      ) : (
                        s.channel || "-"
                      )}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{s.field || "-"}</td>
                    <td>{s.product || "-"}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{num(s.followers)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <span className={`badge ${STATUS_BADGE[s.status] ?? ""}`}>{s.status}</span>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{s.firstPitch || "-"}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {s.revenue ? won(s.revenue) : "-"}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{s.settle || "-"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {s.notion ? (
                        <a className="btn sm" href={s.notion} target="_blank" rel="noreferrer">노션</a>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            {list.length}건 표시 (총 {data.kpi.total}건). 팔로업 상세·수정은 시트/노션에서 합니다. 집계는 셀러리스트에서 실시간 계산합니다.
          </p>
        </>
      )}
    </div>
  );
}
