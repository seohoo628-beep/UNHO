import { notFound, redirect } from "next/navigation";
import { requireAppUser } from "@/lib/auth";
import { canViewFinance } from "@/lib/finance";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

const won = (n: unknown) => (n == null || n === "" ? "" : Number(n).toLocaleString("ko-KR"));

// 거래명세서 인쇄용(A4 가로폭). 브라우저 인쇄 → 'PDF로 저장'으로 파일 발급.
export default async function PrintStatement({ params }: { params: { id: string } }) {
  const user = await requireAppUser();
  if (!canViewFinance(user)) redirect("/hub");
  const supabase = createSupabaseServerClient();
  const { data: s } = await supabase.from("trade_statements").select("*").eq("id", params.id).maybeSingle();
  if (!s) notFound();
  const st = s as any;
  const corpName = st.supplier === "뷰티밤" ? "뷰티밤㈜" : "㈜운호컴퍼니";
  let { data: corp } = await supabase.from("corporations").select("name, business_no, ceo, address, biz_type, biz_item").eq("name", corpName).maybeSingle();
  if (!corp) ({ data: corp } = await supabase.from("corporations").select("name, business_no, ceo, address").eq("name", corpName).maybeSingle());
  const c = (corp ?? {}) as any;
  const items = (Array.isArray(st.items) ? st.items : []) as any[];
  const rows = [...items, ...Array.from({ length: Math.max(0, 10 - items.length) }, () => null)];
  const cell: React.CSSProperties = { border: "1px solid #333", padding: "5px 6px", fontSize: 12 };
  const th: React.CSSProperties = { ...cell, background: "#f2f2f2", fontWeight: 700, textAlign: "center" };
  const party = (title: string, p: { name: string; biz: string; ceo: string; addr: string; type?: string; item?: string }) => (
    <table style={{ borderCollapse: "collapse", width: "100%" }}>
      <tbody>
        <tr><th style={{ ...th, width: 26 }} rowSpan={4}>{title}</th><th style={th}>등록번호</th><td style={cell} colSpan={3}>{p.biz}</td></tr>
        <tr><th style={th}>상호</th><td style={cell}>{p.name}</td><th style={th}>성명</th><td style={cell}>{p.ceo}</td></tr>
        <tr><th style={th}>주소</th><td style={cell} colSpan={3}>{p.addr}</td></tr>
        <tr><th style={th}>업태</th><td style={cell}>{p.type ?? ""}</td><th style={th}>종목</th><td style={cell}>{p.item ?? ""}</td></tr>
      </tbody>
    </table>
  );
  return (
    // 루트 레이아웃(다크 테마 가능) 위에 흰 종이 영역을 덮는다.
    <div style={{ position: "fixed", inset: 0, overflow: "auto", background: "#fff", color: "#111", fontFamily: "Pretendard, 'Malgun Gothic', sans-serif", zIndex: 1 }}>
        <style>{`@page{size:A4;margin:14mm} @media print{.noprint{display:none} html,body{background:#fff!important}}`}</style>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: 20 }}>
          <div className="noprint" style={{ textAlign: "right", marginBottom: 10 }}><PrintButton /></div>
          <h1 style={{ textAlign: "center", letterSpacing: "0.5em", fontSize: 26, margin: "0 0 4px" }}>거래명세서</h1>
          <div style={{ textAlign: "center", fontSize: 12, marginBottom: 12 }}>(공급받는자 보관용) · No. {st.doc_no} · 작성일 {st.issue_date}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {party("공급자", { name: c.name ?? corpName, biz: c.business_no ?? "", ceo: c.ceo ?? "", addr: c.address ?? "", type: c.biz_type, item: c.biz_item })}
            {party("공급받는자", { name: st.receiver_name, biz: st.receiver_biz_no ?? "", ceo: st.receiver_ceo ?? "", addr: st.receiver_address ?? "" })}
          </div>
          <table style={{ borderCollapse: "collapse", width: "100%", marginTop: 10 }}>
            <tbody>
              <tr><th style={th}>합계금액 (공급가액 + 세액)</th><td style={{ ...cell, fontSize: 15, fontWeight: 800, textAlign: "right" }}>₩ {won(st.total)}</td><th style={th}>과세유형</th><td style={cell}>{st.tax_type}</td></tr>
            </tbody>
          </table>
          <table style={{ borderCollapse: "collapse", width: "100%", marginTop: 10 }}>
            <thead><tr>{["No", "품목", "규격", "수량", "단가", "공급가액", "세액"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((it, i) => (
                <tr key={i}>
                  <td style={{ ...cell, textAlign: "center", width: 28 }}>{it ? i + 1 : ""}</td>
                  <td style={cell}>{it?.name ?? ""}</td>
                  <td style={cell}>{it?.spec ?? ""}</td>
                  <td style={{ ...cell, textAlign: "right" }}>{it ? won(it.qty) : ""}</td>
                  <td style={{ ...cell, textAlign: "right" }}>{it ? won(it.unit_price) : ""}</td>
                  <td style={{ ...cell, textAlign: "right" }}>{it ? won(it.supply) : ""}</td>
                  <td style={{ ...cell, textAlign: "right" }}>{it ? won(it.tax) : ""}</td>
                </tr>
              ))}
              <tr>
                <th style={th} colSpan={5}>계</th>
                <td style={{ ...cell, textAlign: "right", fontWeight: 700 }}>{won(st.supply_total)}</td>
                <td style={{ ...cell, textAlign: "right", fontWeight: 700 }}>{won(st.tax_total)}</td>
              </tr>
            </tbody>
          </table>
          {st.note && <div style={{ ...cell, marginTop: 10, whiteSpace: "pre-wrap" }}><b>비고</b> {st.note}</div>}
          <div style={{ textAlign: "right", marginTop: 18, fontSize: 13 }}>위 금액을 청구(영수)합니다. &nbsp; 인수자 ____________ (인)</div>
        </div>
    </div>
  );
}
