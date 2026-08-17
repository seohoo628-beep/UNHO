import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  SALES,
  BUYS,
  BRANDS,
  UNASSIGNED,
  UNASSIGNED_BUY,
  CHANNELS,
  ACCOUNT_MAP,
  availableYears,
  won,
  type SaleRow,
  type BuyRow,
} from "@/lib/integrated-pnl";

export const dynamic = "force-dynamic";

const PAGE = 100;

type Q = {
  book?: string; // sales | buys
  year?: string;
  month?: string;
  brand?: string;
  bucket?: string; // 채널(매출) 또는 계정과목(매입)
  pnl?: string; // 매출: on=손익반영만 / off=제외분만
  qy?: string; // 검색어
  page?: string;
};

function qs(base: Q, patch: Q) {
  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...base, ...patch })) if (v) merged[k] = String(v);
  const s = new URLSearchParams(merged).toString();
  return `/pnl/integrated/ledger${s ? `?${s}` : ""}`;
}

const brandOf = (b: string, fallback: string) =>
  BRANDS.includes(b as (typeof BRANDS)[number]) ? b : fallback;

export default async function LedgerPage({ searchParams }: { searchParams: Q }) {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");

  const book = searchParams.book === "buys" ? "buys" : "sales";
  const year = Number(searchParams.year) || 0;
  const month = Number(searchParams.month) || 0;
  const brand = searchParams.brand ?? "";
  const bucket = searchParams.bucket ?? "";
  const pnlFlag = searchParams.pnl ?? "";
  const term = (searchParams.qy ?? "").trim();
  const page = Math.max(1, Number(searchParams.page) || 1);

  const years = availableYears();
  const base: Q = {
    book,
    year: year ? String(year) : undefined,
    month: month ? String(month) : undefined,
    brand,
    bucket,
    pnl: pnlFlag,
    qy: term,
  };

  const inDate = (d: string) =>
    (!year || Number(d.slice(0, 4)) === year) && (!month || Number(d.slice(5, 7)) === month);
  const hit = (hay: string[]) =>
    !term || hay.some((h) => h.toLowerCase().includes(term.toLowerCase()));

  const sales: SaleRow[] = SALES.filter(
    (s) =>
      inDate(s.date) &&
      (!brand || brandOf(s.brand, UNASSIGNED) === brand) &&
      (!bucket || s.channel === bucket) &&
      (!pnlFlag || (pnlFlag === "on" ? s.inPnl : !s.inPnl)) &&
      hit([s.product, s.note, s.sku, s.channel, s.brand, s.txType])
  );
  const buys: BuyRow[] = BUYS.filter(
    (b) =>
      inDate(b.date) &&
      (!brand || brandOf(b.brand, UNASSIGNED_BUY) === brand) &&
      (!bucket || (b.acct || "(자동열 공란)") === bucket) &&
      hit([b.vendor, b.item, b.category, b.note, b.brand])
  );

  const rows: (SaleRow | BuyRow)[] = book === "sales" ? sales : buys;
  const totalCount = rows.length;
  const pageRows = rows.slice((page - 1) * PAGE, page * PAGE);
  const pages = Math.max(1, Math.ceil(totalCount / PAGE));

  const salesTotal = sales.reduce((a, s) => a + s.netRevenue, 0);
  const salesPnlTotal = sales.filter((s) => s.inPnl).reduce((a, s) => a + s.netRevenue, 0);
  const buysTotal = buys.reduce((a, b) => a + b.amount, 0);

  const buckets =
    book === "sales"
      ? CHANNELS.filter((c) => SALES.some((s) => s.channel === c))
      : [...new Set(BUYS.map((b) => b.acct || "(자동열 공란)"))].sort();

  const brandTabs =
    book === "sales" ? [...BRANDS, UNASSIGNED] : [...BRANDS, UNASSIGNED_BUY];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>원장 조회</h1>
          <p>통합 P&amp;L의 원천 데이터. 매출원장 {SALES.length.toLocaleString()}행 · 매입원장{" "}
            {BUYS.length.toLocaleString()}행.</p>
        </div>
        <div className="btn-row">
          <a className="btn" href="/pnl/integrated">
            통합 P&amp;L
          </a>
        </div>
      </div>

      <div className="card" style={{ padding: 12, marginBottom: 12 }}>
        <div className="btn-row" style={{ flexWrap: "wrap", marginBottom: 8 }}>
          <a
            className={`btn sm${book === "sales" ? " primary" : ""}`}
            href={qs({}, { book: "sales" })}
          >
            매출원장
          </a>
          <a className={`btn sm${book === "buys" ? " primary" : ""}`} href={qs({}, { book: "buys" })}>
            매입원장
          </a>
        </div>

        <div className="btn-row" style={{ flexWrap: "wrap", marginBottom: 8 }}>
          <a className={`btn sm${!year ? " primary" : ""}`} href={qs(base, { year: "", page: "" })}>
            전체 연도
          </a>
          {years.map((y) => (
            <a
              key={y}
              className={`btn sm${y === year ? " primary" : ""}`}
              href={qs(base, { year: String(y), page: "" })}
            >
              {y}
            </a>
          ))}
          <span style={{ width: 12 }} />
          <a className={`btn sm${!month ? " primary" : ""}`} href={qs(base, { month: "", page: "" })}>
            전체 월
          </a>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <a
              key={m}
              className={`btn sm${m === month ? " primary" : ""}`}
              href={qs(base, { month: String(m), page: "" })}
            >
              {m}월
            </a>
          ))}
        </div>

        <div className="btn-row" style={{ flexWrap: "wrap", marginBottom: 8 }}>
          <a className={`btn sm${!brand ? " primary" : ""}`} href={qs(base, { brand: "", page: "" })}>
            전체 브랜드
          </a>
          {brandTabs.map((b) => (
            <a
              key={b}
              className={`btn sm${b === brand ? " primary" : ""}`}
              href={qs(base, { brand: b, page: "" })}
            >
              {b}
            </a>
          ))}
        </div>

        <div className="btn-row" style={{ flexWrap: "wrap", marginBottom: 8 }}>
          <a className={`btn sm${!bucket ? " primary" : ""}`} href={qs(base, { bucket: "", page: "" })}>
            {book === "sales" ? "전체 채널" : "전체 계정과목"}
          </a>
          {buckets.map((b) => (
            <a
              key={b}
              className={`btn sm${b === bucket ? " primary" : ""}`}
              href={qs(base, { bucket: b, page: "" })}
            >
              {b}
            </a>
          ))}
        </div>

        {book === "sales" && (
          <div className="btn-row" style={{ flexWrap: "wrap", marginBottom: 8 }}>
            <a className={`btn sm${!pnlFlag ? " primary" : ""}`} href={qs(base, { pnl: "", page: "" })}>
              전체 행
            </a>
            <a
              className={`btn sm${pnlFlag === "on" ? " primary" : ""}`}
              href={qs(base, { pnl: "on", page: "" })}
            >
              손익반영만
            </a>
            <a
              className={`btn sm${pnlFlag === "off" ? " primary" : ""}`}
              href={qs(base, { pnl: "off", page: "" })}
            >
              손익 제외분
            </a>
          </div>
        )}

        <form method="get" className="row" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input type="hidden" name="book" value={book} />
          {year ? <input type="hidden" name="year" value={year} /> : null}
          {month ? <input type="hidden" name="month" value={month} /> : null}
          {brand ? <input type="hidden" name="brand" value={brand} /> : null}
          {bucket ? <input type="hidden" name="bucket" value={bucket} /> : null}
          {pnlFlag ? <input type="hidden" name="pnl" value={pnlFlag} /> : null}
          <input
            name="qy"
            defaultValue={term}
            placeholder={book === "sales" ? "제품명·비고·SKU 검색" : "거래처·품목·카테고리 검색"}
            style={{ flex: "1 1 240px" }}
          />
          <button className="btn sm primary" type="submit">
            검색
          </button>
          {term ? (
            <a className="btn sm" href={qs(base, { qy: "", page: "" })}>
              지우기
            </a>
          ) : null}
        </form>
      </div>

      <div className="grid cols-3">
        <div className="card">
          <div className="stat">
            <div className="lbl">조회 건수</div>
            <div className="n" style={{ fontSize: 22 }}>
              {totalCount.toLocaleString()}건
            </div>
          </div>
        </div>
        <div className="card">
          <div className="stat">
            <div className="lbl">{book === "sales" ? "순매출 합계" : "매입 합계"}</div>
            <div className="n" style={{ fontSize: 22 }}>
              {won(book === "sales" ? salesTotal : buysTotal)}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="stat">
            <div className="lbl">{book === "sales" ? "그중 손익반영" : "계정과목 종류"}</div>
            <div className="n" style={{ fontSize: 22 }}>
              {book === "sales"
                ? won(salesPnlTotal)
                : `${new Set(buys.map((b) => b.acct || "(공란)")).size}종`}
            </div>
          </div>
        </div>
      </div>

      <div className="section-title">
        원장 상세 ({(page - 1) * PAGE + 1}~{Math.min(page * PAGE, totalCount)} / {totalCount})
      </div>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        {totalCount === 0 ? (
          <div className="empty">조건에 맞는 행이 없습니다.</div>
        ) : book === "sales" ? (
          <table className="tbl">
            <thead>
              <tr>
                <th>일자</th>
                <th>채널</th>
                <th>브랜드</th>
                <th>제품명</th>
                <th style={{ textAlign: "right" }}>매출</th>
                <th style={{ textAlign: "right" }}>순매출</th>
                <th style={{ textAlign: "right" }}>제품원가</th>
                <th style={{ textAlign: "right" }}>수수료</th>
                <th style={{ textAlign: "right" }}>기여이익</th>
                <th>거래유형</th>
                <th>손익</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              {(pageRows as SaleRow[]).map((s, i) => (
                <tr key={`${s.date}-${i}`}>
                  <td data-label="일자" style={{ whiteSpace: "nowrap" }}>
                    {s.date}
                  </td>
                  <td data-label="채널">{s.channel}</td>
                  <td data-label="브랜드">{s.brand || "-"}</td>
                  <td data-label="제품">{s.product || "-"}</td>
                  <td data-label="매출" style={{ textAlign: "right" }}>
                    {won(s.revenue)}
                  </td>
                  <td data-label="순매출" style={{ textAlign: "right", fontWeight: 600 }}>
                    {won(s.netRevenue)}
                  </td>
                  <td data-label="원가" style={{ textAlign: "right" }}>
                    {won(s.cost)}
                  </td>
                  <td data-label="수수료" style={{ textAlign: "right" }}>
                    {won(s.fee)}
                  </td>
                  <td data-label="기여이익" style={{ textAlign: "right" }}>
                    {won(s.contribution)}
                  </td>
                  <td data-label="거래유형">{s.txType || "-"}</td>
                  <td data-label="손익" style={{ color: s.inPnl ? undefined : "var(--owner)" }}>
                    {s.inPnl ? "반영" : "제외"}
                  </td>
                  <td data-label="비고" style={{ color: "var(--ink-2)" }}>
                    {s.note || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>일자</th>
                <th>브랜드</th>
                <th>카테고리</th>
                <th>거래처</th>
                <th>품목·내역</th>
                <th style={{ textAlign: "right" }}>금액</th>
                <th>계정과목</th>
                <th>구분</th>
                <th>결제수단</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              {(pageRows as BuyRow[]).map((b, i) => (
                <tr key={`${b.date}-${i}`}>
                  <td data-label="일자" style={{ whiteSpace: "nowrap" }}>
                    {b.date}
                  </td>
                  <td data-label="브랜드">{b.brand || "공통·미지정"}</td>
                  <td data-label="카테고리" style={{ color: b.category ? undefined : "var(--owner)" }}>
                    {b.category || "(미입력)"}
                  </td>
                  <td data-label="거래처">{b.vendor || "-"}</td>
                  <td data-label="품목">{b.item || "-"}</td>
                  <td data-label="금액" style={{ textAlign: "right", fontWeight: 600 }}>
                    {won(b.amount)}
                  </td>
                  <td data-label="계정" style={{ color: b.acct ? undefined : "var(--owner)" }}>
                    {b.acct || `(공란 → ${b.mappedAcct})`}
                  </td>
                  <td data-label="구분">{b.gubun || `(공란 → ${b.mappedGubun})`}</td>
                  <td data-label="결제">{b.payMethod || "-"}</td>
                  <td data-label="비고" style={{ color: "var(--ink-2)" }}>
                    {b.note || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {pages > 1 && (
        <div className="btn-row" style={{ flexWrap: "wrap", marginTop: 12 }}>
          {Array.from({ length: pages }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 3)
            .map((p, idx, arr) => (
              <span key={p} style={{ display: "contents" }}>
                {idx > 0 && arr[idx - 1] !== p - 1 ? <span className="muted">…</span> : null}
                <a
                  className={`btn sm${p === page ? " primary" : ""}`}
                  href={qs(base, { page: String(p) })}
                >
                  {p}
                </a>
              </span>
            ))}
        </div>
      )}

      <div className="section-title">계정 매핑표</div>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>원장 카테고리</th>
              <th>P&amp;L 계정과목</th>
              <th>구분</th>
            </tr>
          </thead>
          <tbody>
            {ACCOUNT_MAP.map((m) => (
              <tr key={m.category}>
                <td data-label="카테고리">{m.category}</td>
                <td data-label="계정과목">{m.account}</td>
                <td data-label="구분">{m.gubun}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        매입원장 카테고리를 이 표에서 찾아 계정과목·구분을 부여한다. 표에 없는 카테고리는 미분류로
        빠져 P&amp;L에 반영되지 않는다.
      </p>
    </div>
  );
}
