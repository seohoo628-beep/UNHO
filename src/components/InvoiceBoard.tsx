"use client";

import { useMemo, useState, useTransition } from "react";
import { issueTaxInvoice } from "@/app/(app)/receivables/actions";

export type InvoiceRow = {
  id: string; counterparty: string; item: string; supplier: string; date: string | null;
  supply: number; tax: number; taxType: string; kind: string; invoiceNo: string; issuedAt: string; error: string;
  hasVendor: boolean; deadline: string | null; daysLeft: number | null;
};

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export default function InvoiceBoard({ rows, today, popbill }: { rows: InvoiceRow[]; today: string; popbill: { isTest: boolean } | null }) {
  const [tab, setTab] = useState<"open" | "done" | "all">("open");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [supplier, setSupplier] = useState("");
  const months = useMemo(() => [...new Set(rows.map((r) => (r.date ?? "").slice(0, 7)).filter(Boolean))].sort().reverse(), [rows]);
  const open = rows.filter((r) => !r.invoiceNo);
  const done = rows.filter((r) => r.invoiceNo);
  const late = open.filter((r) => r.daysLeft !== null && r.daysLeft < 0);
  const soon = open.filter((r) => r.daysLeft !== null && r.daysLeft >= 0 && r.daysLeft <= 7);
  const monthDone = done.filter((r) => (r.issuedAt || r.date || "").startsWith(month));
  const list = (tab === "open" ? open : tab === "done" ? done : rows)
    .filter((r) => (!supplier || r.supplier === supplier) && (tab === "open" || !month || (r.date ?? "").startsWith(month)))
    .sort((a, b) => (tab === "open" ? (a.daysLeft ?? 999) - (b.daysLeft ?? 999) : (b.date ?? "").localeCompare(a.date ?? "")));

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginBottom: 14 }}>
        <Stat label="미발행" value={`${open.length}건`} sub={won(open.reduce((s, r) => s + r.supply + r.tax, 0))} tone={open.length ? "accent" : undefined} />
        <Stat label="기한 지남" value={`${late.length}건`} sub="가산세 대상 여부 확인" tone={late.length ? "owner" : undefined} />
        <Stat label="7일 내 기한" value={`${soon.length}건`} tone={soon.length ? "warn" : undefined} />
        <Stat label={`${month.slice(5)}월 발행`} value={`${monthDone.length}건`} sub={won(monthDone.reduce((s, r) => s + r.supply + r.tax, 0))} tone="ok" />
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
        {(["open", "done", "all"] as const).map((t) => (
          <button key={t} className={`btn sm ${tab === t ? "primary" : ""}`} onClick={() => setTab(t)}>{t === "open" ? `미발행 ${open.length}` : t === "done" ? `발행 완료 ${done.length}` : "전체"}</button>
        ))}
        {tab !== "open" && (
          <select value={month} onChange={(e) => setMonth(e.target.value)}><option value="">전체 기간</option>{months.map((m) => <option key={m} value={m}>{m}</option>)}</select>
        )}
        <select value={supplier} onChange={(e) => setSupplier(e.target.value)}><option value="">모든 공급자</option><option>운호컴퍼니</option><option>뷰티밤</option></select>
        {popbill && <span className="badge">{popbill.isTest ? "팝빌 테스트 모드" : "팝빌 운영 모드"}</span>}
      </div>

      {list.length === 0 ? <div className="card"><div className="empty">해당하는 계산서가 없습니다.</div></div> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 8 }}>
          {list.map((r) => <Card key={r.id} r={r} popbill={popbill} />)}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "accent" | "owner" | "warn" | "ok" }) {
  const c = tone ? `var(--${tone})` : "var(--ink)";
  return (
    <div className="card" style={{ margin: 0, padding: "12px 14px" }}>
      <div className="muted" style={{ fontSize: 11.5, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: c, marginTop: 3 }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Card({ r, popbill }: { r: InvoiceRow; popbill: { isTest: boolean } | null }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const due = r.daysLeft === null ? "" : r.daysLeft < 0 ? `기한 ${-r.daysLeft}일 지남` : r.daysLeft === 0 ? "오늘 기한" : `기한 D-${r.daysLeft}`;
  const dueTone = r.daysLeft !== null && r.daysLeft < 0 ? "var(--owner)" : r.daysLeft !== null && r.daysLeft <= 7 ? "var(--warn)" : "var(--ink-2)";
  return (
    <div className="card" style={{ margin: 0, padding: "11px 13px", borderLeft: r.invoiceNo ? "3px solid var(--ok)" : r.daysLeft !== null && r.daysLeft < 0 ? "3px solid var(--owner)" : undefined }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <b style={{ fontSize: 14.5 }}>{r.counterparty}</b>
        <span className="badge">{r.supplier}</span>
      </div>
      <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{r.item || "품목 미입력"} · {r.taxType} · {r.kind}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 10px", fontSize: 12.5, marginTop: 6 }}>
        <div><span className="muted">공급가</span> <b>{r.supply.toLocaleString("ko-KR")}</b></div>
        <div><span className="muted">세액</span> <b>{r.tax.toLocaleString("ko-KR")}</b></div>
        <div><span className="muted">공급일</span> {r.date ?? "-"}</div>
        <div><span className="muted">합계</span> <b>{(r.supply + r.tax).toLocaleString("ko-KR")}</b></div>
      </div>
      <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12.5 }}>
        {r.invoiceNo ? (
          <span style={{ color: "var(--ok)", fontWeight: 700 }}>발행 {r.issuedAt} · {r.invoiceNo}</span>
        ) : (
          <>
            <span style={{ color: dueTone, fontWeight: 700 }}>{due || "공급일 미입력"}</span>
            {!r.hasVendor && <span style={{ color: "var(--warn)" }}>매출처 연결 필요</span>}
            {popbill && (
              <button className="btn sm primary" disabled={pending} onClick={() => {
                if (!confirm(`${popbill.isTest ? "[테스트] " : ""}${r.counterparty} · ${(r.supply + r.tax).toLocaleString("ko-KR")}원\n전자세금계산서를 ${popbill.isTest ? "팝빌 테스트베드에" : "국세청에"} 발행할까요?`)) return;
                start(async () => { const x = await issueTaxInvoice(r.id); setMsg({ ok: x.ok, text: x.message }); });
              }}>{pending ? "발행 중…" : popbill.isTest ? "테스트 발행" : "계산서 발행"}</button>
            )}
          </>
        )}
      </div>
      {(msg || r.error) && <div style={{ fontSize: 11.5, marginTop: 6, color: msg?.ok ? "var(--ok)" : "var(--owner)" }}>{msg?.text ?? `최근 실패: ${r.error}`}</div>}
    </div>
  );
}
