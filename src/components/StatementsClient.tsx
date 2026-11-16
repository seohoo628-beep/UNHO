"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveStatement, setStatementStatus, deleteStatement, issueStatementPopbill, type StatementInput } from "@/app/(app)/statements/actions";
import { normalizeItems, totalsOf } from "@/lib/docs";

export type VendorInfo = { id: string; name: string; bizNo: string; ceo: string; address: string; email: string };
export type Statement = StatementInput & { id: string; docNo: string; status: string; total: number; supplyTotal: number; taxTotal: number };

const emptyItem = () => ({ name: "", spec: "", qty: "", unit_price: "", supply: "" });
const blank = (today: string): StatementInput => ({ supplier: "운호컴퍼니", vendorId: "", receiverName: "", receiverBizNo: "", receiverCeo: "", receiverAddress: "", receiverEmail: "", issueDate: today, taxType: "과세", note: "", items: [emptyItem(), emptyItem(), emptyItem()] });
const won = (n: number) => n.toLocaleString("ko-KR");

export default function StatementsClient({ rows, ready, today, vendors, popbill }: { rows: Statement[]; ready: boolean; today: string; vendors: VendorInfo[]; popbill: { isTest: boolean } | null }) {
  const [editing, setEditing] = useState<Statement | StatementInput | null>(null);
  const [month, setMonth] = useState("");
  const months = useMemo(() => [...new Set(rows.map((r) => r.issueDate.slice(0, 7)))].sort().reverse(), [rows]);
  const list = rows.filter((r) => !month || r.issueDate.startsWith(month));
  const sum = list.filter((r) => r.status !== "취소").reduce((s, r) => s + r.total, 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>거래명세서</h1>
          <p>품목을 입력하면 공급가·세액·합계가 자동 계산되고 문서번호(TS-날짜-번호)가 붙습니다. 인쇄·PDF 저장 또는 팝빌 전자 거래명세서로 발급합니다.</p>
        </div>
        <button className="btn primary" disabled={!ready} onClick={() => setEditing(blank(today))}>+ 거래명세서 작성</button>
      </div>
      {!ready && <div className="card" style={{ borderLeft: "4px solid var(--warn)", marginBottom: 14 }}><p className="muted" style={{ margin: 0, fontSize: 12.5 }}>Supabase에서 <span className="mono">0105_contracts_statements.sql</span>을 실행하세요.</p></div>}

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <select value={month} onChange={(e) => setMonth(e.target.value)}><option value="">전체 기간</option>{months.map((m) => <option key={m}>{m}</option>)}</select>
        <span className="muted" style={{ fontSize: 12.5 }}>{list.length}건 · 합계 {won(sum)}원 (취소 제외)</span>
      </div>

      {list.length === 0 ? <div className="card"><div className="empty">작성한 거래명세서가 없습니다.</div></div> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 8 }}>
          {list.map((r) => <Card key={r.id} r={r} popbill={popbill} onEdit={() => setEditing(r)} />)}
        </div>
      )}
      {editing && <Editor initial={editing} vendors={vendors} onClose={() => setEditing(null)} />}
    </div>
  );
}

function Card({ r, popbill, onEdit }: { r: Statement; popbill: { isTest: boolean } | null; onEdit: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const tone = r.status === "발급" ? "ok" : r.status === "취소" ? "" : "warn";
  const act = (p: Promise<{ ok: boolean; message: string }>) => start(async () => { const x = await p; setMsg({ ok: x.ok, text: x.message }); if (x.ok) router.refresh(); });
  return (
    <div className="card" style={{ margin: 0, padding: "11px 13px", opacity: r.status === "취소" ? 0.6 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <b style={{ fontSize: 14.5, cursor: r.status === "발급" ? "default" : "pointer" }} onClick={r.status === "발급" ? undefined : onEdit}>{r.receiverName}</b>
        <span className={`badge ${tone}`}>{r.status}</span>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{r.docNo} · {r.issueDate} · {r.supplier} · {r.taxType}</div>
      <div style={{ fontSize: 12.5, marginTop: 6 }}>{r.items.filter((i) => i.name).slice(0, 2).map((i) => i.name).join(", ")}{r.items.filter((i) => i.name).length > 2 ? ` 외 ${r.items.filter((i) => i.name).length - 2}건` : ""}</div>
      <div style={{ fontSize: 13, marginTop: 4 }}><span className="muted">합계</span> <b>{won(r.total)}원</b> <span className="muted" style={{ fontSize: 11.5 }}>(공급가 {won(r.supplyTotal)} · 세액 {won(r.taxTotal)})</span></div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
        <a className="btn sm" href={`/print/statement/${r.id}`} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>인쇄·PDF</a>
        {r.status === "작성" && popbill && <button className="btn sm primary" disabled={pending} onClick={() => { if (confirm(`${popbill.isTest ? "[테스트] " : ""}${r.receiverName} 앞 전자 거래명세서를 발급할까요?${r.receiverEmail ? `\n${r.receiverEmail}로 발송됩니다.` : ""}`)) act(issueStatementPopbill(r.id)); }}>{popbill.isTest ? "전자 발급(테스트)" : "전자 발급"}</button>}
        {r.status === "작성" && <button className="btn sm" disabled={pending} onClick={() => act(setStatementStatus(r.id, "발급"))}>발급 완료 표시</button>}
        {r.status === "작성" && <button className="btn sm" disabled={pending} onClick={onEdit}>수정</button>}
        {r.status !== "취소" && <button className="btn sm" disabled={pending} onClick={() => { if (confirm("이 명세서를 취소할까요?")) act(setStatementStatus(r.id, "취소")); }}>취소</button>}
        {r.status !== "발급" && <button className="btn sm" disabled={pending} onClick={() => { if (confirm("삭제할까요?")) act(deleteStatement(r.id)); }}>삭제</button>}
      </div>
      {msg && <div style={{ fontSize: 11.5, marginTop: 6, color: msg.ok ? "var(--ok)" : "var(--owner)" }}>{msg.text}</div>}
    </div>
  );
}

function Editor({ initial, vendors, onClose }: { initial: Statement | StatementInput; vendors: VendorInfo[]; onClose: () => void }) {
  const router = useRouter();
  const id = "id" in initial ? initial.id : null;
  const [f, setF] = useState<StatementInput>({ ...initial, items: initial.items.length ? initial.items : [emptyItem()] });
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const set = <K extends keyof StatementInput>(k: K, v: StatementInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const items = normalizeItems(f.items, f.taxType);
  const t = totalsOf(items);
  const pickVendor = (vid: string) => {
    const v = vendors.find((x) => x.id === vid);
    setF((x) => ({ ...x, vendorId: vid, ...(v ? { receiverName: v.name, receiverBizNo: v.bizNo, receiverCeo: v.ceo, receiverAddress: v.address, receiverEmail: v.email } : {}) }));
  };
  const setItem = (i: number, k: keyof StatementInput["items"][number], v: string) => setF((x) => ({ ...x, items: x.items.map((it, j) => (j === i ? { ...it, [k]: v } : it)) }));

  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
      <div className="card" onMouseDown={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 720, maxHeight: "92vh", overflowY: "auto", padding: 18 }}>
        <h3 style={{ marginTop: 0 }}>{id ? "거래명세서 수정" : "거래명세서 작성"}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
          <select value={f.supplier} onChange={(e) => set("supplier", e.target.value)}><option>운호컴퍼니</option><option>뷰티밤</option></select>
          <input type="date" value={f.issueDate} onChange={(e) => set("issueDate", e.target.value)} />
          <select value={f.taxType} onChange={(e) => set("taxType", e.target.value)}><option>과세</option><option>영세</option><option>면세</option></select>
          <select value={f.vendorId} onChange={(e) => pickVendor(e.target.value)}><option value="">거래처에서 불러오기</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
          <input placeholder="공급받는자 상호" value={f.receiverName} onChange={(e) => set("receiverName", e.target.value)} />
          <input placeholder="사업자번호" value={f.receiverBizNo} onChange={(e) => set("receiverBizNo", e.target.value)} />
          <input placeholder="대표자" value={f.receiverCeo} onChange={(e) => set("receiverCeo", e.target.value)} />
          <input placeholder="이메일(전자 발급 시 발송)" value={f.receiverEmail} onChange={(e) => set("receiverEmail", e.target.value)} />
        </div>
        <input placeholder="주소" value={f.receiverAddress} onChange={(e) => set("receiverAddress", e.target.value)} style={{ width: "100%", marginTop: 8 }} />

        <div style={{ fontWeight: 700, fontSize: 13, margin: "12px 0 6px" }}>품목 (수량×단가 또는 공급가 직접 입력)</div>
        <div style={{ display: "grid", gap: 6 }}>
          {f.items.map((it, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 0.7fr 1fr 1fr auto", gap: 4 }}>
              <input placeholder="품목" value={it.name} onChange={(e) => setItem(i, "name", e.target.value)} />
              <input placeholder="규격" value={it.spec} onChange={(e) => setItem(i, "spec", e.target.value)} />
              <input placeholder="수량" inputMode="numeric" value={it.qty} onChange={(e) => setItem(i, "qty", e.target.value)} />
              <input placeholder="단가" inputMode="numeric" value={it.unit_price} onChange={(e) => setItem(i, "unit_price", e.target.value)} />
              <input placeholder="공급가" inputMode="numeric" value={it.supply} onChange={(e) => setItem(i, "supply", e.target.value)} />
              <button type="button" className="btn sm" onClick={() => set("items", f.items.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <button type="button" className="btn sm" onClick={() => set("items", [...f.items, emptyItem()])} style={{ justifySelf: "start" }}>+ 품목 추가</button>
        </div>
        <div style={{ marginTop: 10, fontSize: 13.5 }}>공급가 <b>{won(t.supply)}</b> · 세액 <b>{won(t.tax)}</b> · 합계 <b style={{ color: "var(--accent)" }}>{won(t.total)}원</b></div>
        <textarea rows={2} placeholder="비고 (입금 계좌·납품 조건 등)" value={f.note} onChange={(e) => set("note", e.target.value)} style={{ width: "100%", marginTop: 8 }} />
        {msg && <div style={{ color: "var(--owner)", fontSize: 12.5, marginTop: 6 }}>{msg}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button className="btn primary" disabled={pending} onClick={() => start(async () => { const r = await saveStatement(id, f); if (r.ok) { onClose(); router.refresh(); } else setMsg(r.message); })}>저장</button>
          <button className="btn" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}
