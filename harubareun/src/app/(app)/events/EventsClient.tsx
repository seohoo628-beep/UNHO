"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createEvent, updateEvent, deleteEvent } from "./actions";

export type Ev = {
  id: string; brandId: string | null; brandName: string | null; status: string; title: string;
  rationale: string | null; benefitType: string | null; channel: string | null; startDate: string | null; endDate: string | null;
  targetRevenue: number | null; actualRevenue: number | null; buyers: number | null; adCost: number | null; note: string | null;
};
const STATUS = ["예정", "진행", "완료", "보류"];
const won = (n: number | null) => (n == null ? "-" : n.toLocaleString("ko-KR"));

function Fields({ e, brands }: { e?: Ev; brands: { id: string; name: string }[] }) {
  return (
    <>
      <div className="row">
        <label className="field"><span>브랜드</span><select name="brand_id" defaultValue={e?.brandId ?? ""}><option value="">공통</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label className="field"><span>상태</span><select name="status" defaultValue={e?.status ?? "예정"}>{STATUS.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label className="field"><span>채널</span><input name="channel" defaultValue={e?.channel ?? ""} placeholder="자사몰·스마트스토어…" /></label>
      </div>
      <label className="field"><span>이벤트명 *</span><input name="title" required defaultValue={e?.title ?? ""} /></label>
      <div className="row">
        <label className="field"><span>명분</span><input name="rationale" defaultValue={e?.rationale ?? ""} placeholder="런칭기념·시즌이슈…" /></label>
        <label className="field"><span>혜택유형</span><input name="benefit_type" defaultValue={e?.benefitType ?? ""} placeholder="즉시할인·쿠폰·1+1…" /></label>
      </div>
      <div className="row">
        <label className="field"><span>시작</span><input type="date" name="start_date" defaultValue={e?.startDate ?? ""} /></label>
        <label className="field"><span>종료</span><input type="date" name="end_date" defaultValue={e?.endDate ?? ""} /></label>
      </div>
      <div className="row">
        <label className="field"><span>목표매출</span><input name="target_revenue" inputMode="numeric" defaultValue={e?.targetRevenue ?? ""} /></label>
        <label className="field"><span>실적매출</span><input name="actual_revenue" inputMode="numeric" defaultValue={e?.actualRevenue ?? ""} /></label>
      </div>
      <div className="row">
        <label className="field"><span>구매고객수</span><input name="buyers" inputMode="numeric" defaultValue={e?.buyers ?? ""} /></label>
        <label className="field"><span>광고비</span><input name="ad_cost" inputMode="numeric" defaultValue={e?.adCost ?? ""} /></label>
      </div>
      <label className="field"><span>비고</span><input name="note" defaultValue={e?.note ?? ""} /></label>
    </>
  );
}

function Row({ e, brands }: { e: Ev; brands: { id: string; name: string }[] }) {
  const [edit, setEdit] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const pct = e.targetRevenue ? Math.round(((e.actualRevenue ?? 0) / e.targetRevenue) * 100) : null;
  const aov = e.buyers ? Math.round((e.actualRevenue ?? 0) / e.buyers) : null;
  const roas = e.adCost ? Math.round(((e.actualRevenue ?? 0) / e.adCost) * 100) / 100 : null;
  const badge = e.status === "완료" ? "ok" : e.status === "진행" ? "accent" : e.status === "보류" ? "owner" : "";
  if (edit) return (
    <form action={(fd) => start(async () => { await updateEvent(e.id, fd); setEdit(false); router.refresh(); })} className="card" style={{ marginBottom: 10, display: "grid", gap: 8 }}>
      <Fields e={e} brands={brands} />
      <div><button className="btn primary" disabled={pending}>저장</button> <button type="button" className="btn" onClick={() => setEdit(false)}>취소</button></div>
    </form>
  );
  return (
    <div className="card" style={{ padding: 12, marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
        <div style={{ fontWeight: 700 }}>
          <span className={`badge ${badge}`} style={{ marginRight: 6 }}>{e.status}</span>
          {e.brandName && <span className="badge accent" style={{ marginRight: 6 }}>{e.brandName}</span>}
          {e.title}
        </div>
        <div className="muted" style={{ fontSize: 12 }}>{e.startDate ?? ""}{e.endDate ? ` ~ ${e.endDate}` : ""}{e.channel ? ` · ${e.channel}` : ""}</div>
      </div>
      <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{[e.rationale, e.benefitType].filter(Boolean).join(" · ")}</div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8, fontSize: 13 }}>
        <span>목표 {won(e.targetRevenue)}</span>
        <span>실적 {won(e.actualRevenue)}{pct != null && <b style={{ marginLeft: 4, color: pct >= 100 ? "var(--ok,#10b981)" : "var(--ink)" }}>({pct}%)</b>}</span>
        <span>구매 {won(e.buyers)}</span>
        <span>객단가 {won(aov)}</span>
        <span>광고비 {won(e.adCost)}</span>
        <span>ROAS {roas ?? "-"}</span>
      </div>
      {e.note && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{e.note}</div>}
      <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
        <button className="btn sm" onClick={() => setEdit(true)}>수정</button>
        <button className="btn sm" onClick={() => start(async () => { await deleteEvent(e.id); router.refresh(); })}>삭제</button>
      </div>
    </div>
  );
}

export default function EventsClient({ items, brands, canEdit }: { items: Ev[]; brands: { id: string; name: string }[]; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const submit = (fd: FormData) => start(async () => { const r = await createEvent(fd); if (!r.ok) { setErr(r.error ?? "실패"); return; } setErr(null); setOpen(false); router.refresh(); });
  return (
    <div>
      <div className="page-head">
        <div><h1>이벤트 관리</h1><p>한정 날짜 × 한정 수량 × 명확한 명분 × 이후 액션. 목표·실적으로 성과를 추적한다.</p></div>
        {canEdit && <button className="btn primary" onClick={() => setOpen((v) => !v)}>{open ? "닫기" : "+ 이벤트 등록"}</button>}
      </div>
      {open && canEdit && (
        <form action={submit} className="card" style={{ marginBottom: 14, display: "grid", gap: 8 }}>
          <Fields brands={brands} />
          <div><button className="btn primary" disabled={pending}>{pending ? "저장 중..." : "저장"}</button>{err && <span style={{ color: "var(--owner)", marginLeft: 8 }}>{err}</span>}</div>
        </form>
      )}
      {items.length === 0 ? (
        <div className="card"><div className="empty">등록된 이벤트가 없습니다. &ldquo;+ 이벤트 등록&rdquo;으로 추가하세요.</div></div>
      ) : items.map((e) => <Row key={e.id} e={e} brands={brands} />)}
    </div>
  );
}
