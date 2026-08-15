"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createKpi, updateKpiCurrent, deleteKpi } from "./actions";

export type Kpi = {
  id: string; brandName: string | null; category: string; metric: string;
  target: number | null; current: number; targetDate: string | null; performer: string | null; note: string | null;
};
const CATS = ["리뷰", "CRM", "SEO", "콘텐츠", "채널"];
const fmt = (n: number | null) => (n == null ? "-" : n.toLocaleString("ko-KR"));

function CurrentEdit({ id, value }: { id: string; value: number }) {
  const [v, setV] = useState(String(value));
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
      <input value={v} onChange={(e) => setV(e.target.value)} style={{ width: 90 }} inputMode="numeric" />
      <button className="btn sm" disabled={pending} onClick={() => start(async () => { await updateKpiCurrent(id, Number(v.replace(/[, ]/g, "")) || 0); router.refresh(); })}>저장</button>
    </span>
  );
}

export default function ChannelKpiClient({ items, brands, canEdit }: { items: Kpi[]; brands: { id: string; name: string }[]; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const submit = (fd: FormData) => start(async () => {
    const r = await createKpi(fd);
    if (!r.ok) { setErr(r.error ?? "실패"); return; }
    setErr(null); setOpen(false); router.refresh();
  });

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>채널자산 KPI</h1>
          <p>판매플랜 목표치. 현재값만 갱신하면 달성률이 자동 계산된다.</p>
        </div>
        {canEdit && <button className="btn primary" onClick={() => setOpen((v) => !v)}>{open ? "닫기" : "+ KPI 추가"}</button>}
      </div>

      {open && canEdit && (
        <form action={submit} className="card" style={{ marginBottom: 14, display: "grid", gap: 8 }}>
          <div className="row">
            <label className="field"><span>브랜드</span>
              <select name="brand_id"><option value="">공통</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
            </label>
            <label className="field"><span>구분</span>
              <select name="category">{CATS.map((c) => <option key={c}>{c}</option>)}</select>
            </label>
            <label className="field"><span>목표 시점</span><input type="date" name="target_date" /></label>
          </div>
          <label className="field"><span>지표 *</span><input name="metric" required placeholder="예) 카카오 채널 친구" /></label>
          <div className="row">
            <label className="field"><span>목표</span><input name="target" inputMode="numeric" /></label>
            <label className="field"><span>현재</span><input name="current" inputMode="numeric" defaultValue="0" /></label>
            <label className="field"><span>수행 주체</span><input name="performer" placeholder="예) 스카이벤처스" /></label>
          </div>
          <label className="field"><span>비고</span><input name="note" /></label>
          <div><button className="btn primary" disabled={pending}>{pending ? "저장 중..." : "저장"}</button>{err && <span style={{ color: "var(--owner)", marginLeft: 8 }}>{err}</span>}</div>
        </form>
      )}

      {items.length === 0 ? (
        <div className="card"><div className="empty">등록된 KPI가 없습니다.</div></div>
      ) : CATS.filter((c) => items.some((i) => i.category === c)).map((cat) => (
        <div key={cat} style={{ marginBottom: 16 }}>
          <div className="section-title">{cat}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.filter((i) => i.category === cat).map((i) => {
              const pct = i.target ? Math.min(100, Math.round((i.current / i.target) * 100)) : 0;
              return (
                <div key={i.id} className="card" style={{ padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      {i.brandName && <span className="badge accent" style={{ marginRight: 6 }}>{i.brandName}</span>}
                      {i.metric}
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>{i.targetDate ?? ""}{i.performer ? ` · ${i.performer}` : ""}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 160, height: 10, background: "var(--surface-2)", borderRadius: 6, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: pct >= 100 ? "var(--ok, #10b981)" : "var(--accent, #5b3fa8)" }} />
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, minWidth: 46, textAlign: "right" }}>{pct}%</div>
                    <div style={{ fontSize: 13 }}>{canEdit ? <CurrentEdit id={i.id} value={i.current} /> : fmt(i.current)} / {fmt(i.target)}</div>
                    {canEdit && <button className="btn sm" onClick={() => start(async () => { await deleteKpi(i.id); router.refresh(); })}>삭제</button>}
                  </div>
                  {i.note && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{i.note}</div>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
