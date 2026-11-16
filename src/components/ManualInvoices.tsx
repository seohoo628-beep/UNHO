"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveManualInvoice, issueManualInvoice, setManualInvoiceStatus, deleteManualInvoice, type ManualInvoiceInput } from "@/app/(app)/invoices/actions";
import { normalizeItems, totalsOf } from "@/lib/docs";

export type BuyerVendor = { id: string; name: string; bizNo: string; ceo: string; address: string; bizType: string; bizItem: string; email: string };
export type ManualInvoice = ManualInvoiceInput & { id: string; status: string; total: number; ntsConfirmNum: string; issueError: string; issuedAt: string };

const emptyItem = () => ({ name: "", spec: "", qty: "", unit_price: "", supply: "" });
const blank = (today: string): ManualInvoiceInput => ({ supplier: "운호컴퍼니", vendorId: "", buyerName: "", buyerBizNo: "", buyerCeo: "", buyerAddress: "", buyerBizType: "", buyerBizItem: "", buyerEmail: "", writeDate: today, taxType: "과세", purpose: "청구", note: "", items: [emptyItem(), emptyItem()] });
const won = (n: number) => n.toLocaleString("ko-KR");

/** 미수금과 별개로 직접 입력해 발행하는 계산서: 작성 버튼 + 목록 */
export default function ManualInvoices({ rows, vendors, today, popbill, ready }: { rows: ManualInvoice[]; vendors: BuyerVendor[]; today: string; popbill: { isTest: boolean } | null; ready: boolean }) {
  const [editing, setEditing] = useState<ManualInvoice | ManualInvoiceInput | null>(null);
  const [showAll, setShowAll] = useState(false);
  const open = rows.filter((r) => r.status === "작성");
  const list = showAll ? rows : open.concat(rows.filter((r) => r.status !== "작성").slice(0, 6));
  return (
    <section style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>직접 입력 계산서 {rows.length > 0 && <span className="muted" style={{ fontWeight: 500, fontSize: 12.5 }}>· 작성 {open.length}건</span>}</div>
        <button className="btn primary" disabled={!ready} onClick={() => setEditing(blank(today))}>+ 계산서 직접 입력·발급</button>
      </div>
      {!ready && <div className="card" style={{ borderLeft: "4px solid var(--warn)" }}><p className="muted" style={{ margin: 0, fontSize: 12.5 }}>Supabase에서 <span className="mono">0107_manual_tax_invoices.sql</span>을 실행하면 직접 입력 발급을 쓸 수 있습니다.</p></div>}
      {ready && rows.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>미수금 장부에 없는 거래도 여기서 바로 입력해 발급할 수 있습니다.</div>}
      {list.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 8 }}>
          {list.map((r) => <Card key={r.id} r={r} popbill={popbill} onEdit={() => setEditing(r)} />)}
        </div>
      )}
      {rows.length > list.length && <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setShowAll(true)}>전체 {rows.length}건 보기</button>}
      {editing && <Editor initial={editing} vendors={vendors} popbill={popbill} onClose={() => setEditing(null)} />}
    </section>
  );
}

function Card({ r, popbill, onEdit }: { r: ManualInvoice; popbill: { isTest: boolean } | null; onEdit: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const act = (p: Promise<{ ok: boolean; message: string }>) => start(async () => { const x = await p; setMsg({ ok: x.ok, text: x.message }); if (x.ok) router.refresh(); });
  const tone = r.status === "발행" ? "ok" : r.status === "취소" ? "" : "warn";
  const names = r.items.filter((i) => i.name).map((i) => i.name);
  return (
    <div className="card" style={{ margin: 0, padding: "11px 13px", opacity: r.status === "취소" ? 0.55 : 1, borderLeft: r.status === "발행" ? "3px solid var(--ok)" : undefined }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <b style={{ fontSize: 14.5, cursor: r.status === "작성" ? "pointer" : "default" }} onClick={r.status === "작성" ? onEdit : undefined}>{r.buyerName}</b>
        <span className={`badge ${tone}`}>{r.status}</span>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{r.writeDate} · {r.supplier} · {r.taxType} · {r.purpose} · 직접 입력</div>
      <div style={{ fontSize: 12.5, marginTop: 4 }}>{names.slice(0, 2).join(", ")}{names.length > 2 ? ` 외 ${names.length - 2}건` : ""}</div>
      <div style={{ fontSize: 13, marginTop: 4 }}><span className="muted">합계</span> <b>{won(r.total)}원</b></div>
      {r.status === "발행" && r.ntsConfirmNum && <div style={{ fontSize: 12, color: "var(--ok)", marginTop: 4 }}>승인번호 {r.ntsConfirmNum}</div>}
      {r.status === "작성" && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          {popbill && <button className="btn sm primary" disabled={pending} onClick={() => { if (confirm(`${popbill.isTest ? "[테스트] " : ""}${r.buyerName} · ${won(r.total)}원\n전자세금계산서를 ${popbill.isTest ? "팝빌 테스트베드에" : "국세청에"} 발행할까요?`)) act(issueManualInvoice(r.id)); }}>{pending ? "발행 중…" : popbill.isTest ? "테스트 발행" : "계산서 발행"}</button>}
          <button className="btn sm" disabled={pending} onClick={onEdit}>수정</button>
          <button className="btn sm" disabled={pending} onClick={() => { if (confirm("홈택스 등 다른 곳에서 이미 발행했나요? 발행 완료로 표시합니다.")) act(setManualInvoiceStatus(r.id, "발행")); }}>발행 완료 표시</button>
          <button className="btn sm" disabled={pending} onClick={() => { if (confirm("취소할까요?")) act(setManualInvoiceStatus(r.id, "취소")); }}>취소</button>
        </div>
      )}
      {r.status === "취소" && <button className="btn sm" style={{ marginTop: 8 }} disabled={pending} onClick={() => { if (confirm("삭제할까요?")) act(deleteManualInvoice(r.id)); }}>삭제</button>}
      {(msg || (r.status === "작성" && r.issueError)) && <div style={{ fontSize: 11.5, marginTop: 6, color: msg?.ok ? "var(--ok)" : "var(--owner)" }}>{msg?.text ?? `최근 실패: ${r.issueError}`}</div>}
    </div>
  );
}

function Editor({ initial, vendors, popbill, onClose }: { initial: ManualInvoice | ManualInvoiceInput; vendors: BuyerVendor[]; popbill: { isTest: boolean } | null; onClose: () => void }) {
  const router = useRouter();
  const id = "id" in initial ? initial.id : null;
  const [f, setF] = useState<ManualInvoiceInput>({ ...initial, items: initial.items.length ? initial.items : [emptyItem()] });
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof ManualInvoiceInput>(k: K, v: ManualInvoiceInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const t = totalsOf(normalizeItems(f.items, f.taxType));
  const pick = (vid: string) => {
    const v = vendors.find((x) => x.id === vid);
    setF((x) => ({ ...x, vendorId: vid, ...(v ? { buyerName: v.name, buyerBizNo: v.bizNo, buyerCeo: v.ceo, buyerAddress: v.address, buyerBizType: v.bizType, buyerBizItem: v.bizItem, buyerEmail: v.email } : {}) }));
  };
  const setItem = (i: number, k: keyof ManualInvoiceInput["items"][number], v: string) => setF((x) => ({ ...x, items: x.items.map((it, j) => (j === i ? { ...it, [k]: v } : it)) }));
  const save = (andIssue: boolean) => start(async () => {
    const r = await saveManualInvoice(id, f);
    if (!r.ok || !r.id) { setMsg({ ok: false, text: r.message }); return; }
    if (andIssue) {
      if (!confirm(`${popbill?.isTest ? "[테스트] " : ""}${f.buyerName} · ${won(t.total)}원\n저장 후 바로 ${popbill?.isTest ? "팝빌 테스트베드에" : "국세청에"} 발행할까요?`)) { router.refresh(); onClose(); return; }
      const x = await issueManualInvoice(r.id);
      setMsg({ ok: x.ok, text: x.message });
      router.refresh();
      if (x.ok) onClose();
      return;
    }
    router.refresh();
    onClose();
  });

  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
      <div className="card" onMouseDown={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 720, maxHeight: "92vh", overflowY: "auto", padding: 18 }}>
        <h3 style={{ marginTop: 0 }}>{id ? "계산서 수정" : "계산서 직접 입력"}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
          <select value={f.supplier} onChange={(e) => set("supplier", e.target.value)}><option>운호컴퍼니</option><option>뷰티밤</option></select>
          <input type="date" value={f.writeDate} onChange={(e) => set("writeDate", e.target.value)} />
          <select value={f.taxType} onChange={(e) => set("taxType", e.target.value)}><option>과세</option><option>영세</option><option>면세</option></select>
          <select value={f.purpose} onChange={(e) => set("purpose", e.target.value)}><option>청구</option><option>영수</option></select>
        </div>
        <div style={{ fontWeight: 700, fontSize: 13, margin: "12px 0 6px" }}>공급받는자</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
          <select value={f.vendorId} onChange={(e) => pick(e.target.value)}><option value="">거래처에서 불러오기</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
          <input placeholder="상호" value={f.buyerName} onChange={(e) => set("buyerName", e.target.value)} />
          <input placeholder="사업자번호" value={f.buyerBizNo} onChange={(e) => set("buyerBizNo", e.target.value)} />
          <input placeholder="대표자" value={f.buyerCeo} onChange={(e) => set("buyerCeo", e.target.value)} />
          <input placeholder="업태" value={f.buyerBizType} onChange={(e) => set("buyerBizType", e.target.value)} />
          <input placeholder="종목" value={f.buyerBizItem} onChange={(e) => set("buyerBizItem", e.target.value)} />
          <input placeholder="계산서 받을 이메일" value={f.buyerEmail} onChange={(e) => set("buyerEmail", e.target.value)} />
        </div>
        <input placeholder="주소" value={f.buyerAddress} onChange={(e) => set("buyerAddress", e.target.value)} style={{ width: "100%", marginTop: 8 }} />

        <div style={{ fontWeight: 700, fontSize: 13, margin: "12px 0 6px" }}>품목 (수량×단가 또는 공급가 직접)</div>
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
        <input placeholder="비고" value={f.note} onChange={(e) => set("note", e.target.value)} style={{ width: "100%", marginTop: 8 }} />
        {msg && <div style={{ color: msg.ok ? "var(--ok)" : "var(--owner)", fontSize: 12.5, marginTop: 8 }}>{msg.text}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {popbill && <button className="btn primary" disabled={pending} onClick={() => save(true)}>{pending ? "처리 중…" : popbill.isTest ? "저장하고 테스트 발행" : "저장하고 발행"}</button>}
          <button className={`btn ${popbill ? "" : "primary"}`} disabled={pending} onClick={() => save(false)}>저장만</button>
          <button className="btn" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}
