"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPromotion, updatePromotion, deletePromotion } from "./actions";

export type Promotion = {
  id: string;
  periodType: string;
  periodLabel: string;
  title: string;
  channel: string;
  plan: string;
  budget: number | null;
  result: string;
  outcome: string;
  status: string;
  startDate: string;
  endDate: string;
};

const PERIODS = ["주", "월", "연"] as const;
const STATUSES = ["예정", "진행", "완료", "보류"] as const;
const STATUS_COLOR: Record<string, string> = { 예정: "#94a3b8", 진행: "#6366f1", 완료: "#10b981", 보류: "#ef4444" };

function Fields({ p }: { p?: Promotion }) {
  return (
    <>
      <div className="row">
        <label className="field" style={{ marginBottom: 0 }}>
          <span>기간 단위 *</span>
          <select name="period_type" defaultValue={p?.periodType ?? "월"}>
            {PERIODS.map((k) => <option key={k} value={k}>{k} 단위</option>)}
          </select>
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>기간 표기</span>
          <input name="period_label" placeholder="예) 2026-08 / 2026-W32 / 2026" defaultValue={p?.periodLabel ?? ""} />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>상태</span>
          <select name="status" defaultValue={p?.status ?? "예정"}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>기획명 *</span>
          <input name="title" required defaultValue={p?.title ?? ""} />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>채널</span>
          <input name="channel" placeholder="자사몰/스마트스토어/인스타 등" defaultValue={p?.channel ?? ""} />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>예산</span>
          <input name="budget" type="number" defaultValue={p?.budget ?? ""} />
        </label>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>시작일</span>
          <input type="date" name="start_date" defaultValue={p?.startDate ?? ""} />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>종료일</span>
          <input type="date" name="end_date" defaultValue={p?.endDate ?? ""} />
        </label>
      </div>
      <label className="field" style={{ marginTop: 10 }}>
        <span>기획 내용</span>
        <textarea name="plan" rows={3} placeholder="이벤트/프로모션 기획 상세" defaultValue={p?.plan ?? ""} />
      </label>
      <label className="field" style={{ marginTop: 10 }}>
        <span>결과 입력</span>
        <textarea name="result" rows={2} placeholder="집행 후 결과·회고" defaultValue={p?.result ?? ""} />
      </label>
      <label className="field" style={{ marginTop: 10 }}>
        <span>성과 수치</span>
        <input name="outcome" placeholder="예) 매출 1,200만 · 참여 340건 · ROAS 320%" defaultValue={p?.outcome ?? ""} />
      </label>
    </>
  );
}

function AddForm() {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function submit(fd: FormData) {
    setErr(null);
    start(async () => {
      const r = await createPromotion(fd);
      if (!r.ok) return setErr(r.error ?? "저장 실패");
      formRef.current?.reset();
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) return <button className="btn primary" onClick={() => setOpen(true)}>+ 프로모션 등록</button>;
  return (
    <form ref={formRef} action={submit} className="card" style={{ padding: 14, marginBottom: 16 }}>
      <Fields />
      {err && <div style={{ color: "var(--owner)", fontSize: 12, marginTop: 8 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button className="btn primary" disabled={pending}>{pending ? "저장 중…" : "저장"}</button>
        <button type="button" className="btn" onClick={() => setOpen(false)} disabled={pending}>취소</button>
      </div>
    </form>
  );
}

function Row({ p }: { p: Promotion }) {
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const color = STATUS_COLOR[p.status] ?? "#94a3b8";

  function submit(fd: FormData) {
    setErr(null);
    start(async () => {
      const r = await updatePromotion(p.id, fd);
      if (!r.ok) return setErr(r.error ?? "저장 실패");
      setEditing(false);
      router.refresh();
    });
  }
  function remove() {
    start(async () => {
      await deletePromotion(p.id);
      router.refresh();
    });
  }

  return (
    <div className="card" style={{ padding: 14, borderLeft: `4px solid ${color}` }}>
      {!editing ? (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
            <div style={{ minWidth: 200, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span className="badge" style={{ background: color, color: "#fff" }}>{p.status}</span>
                {p.periodLabel && <span style={{ fontWeight: 700 }}>{p.periodLabel}</span>}
                <span style={{ fontWeight: 700 }}>{p.title}</span>
                {p.channel && <span className="muted" style={{ fontSize: 12.5 }}>· {p.channel}</span>}
              </div>
              {(p.startDate || p.endDate) && (
                <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
                  {p.startDate || "?"} ~ {p.endDate || "?"} {p.budget != null ? `· 예산 ${p.budget.toLocaleString()}` : ""}
                </div>
              )}
              {p.plan && <div style={{ fontSize: 13.5, marginTop: 6, whiteSpace: "pre-wrap" }}>📝 {p.plan}</div>}
              {p.result && <div style={{ fontSize: 13.5, marginTop: 6, whiteSpace: "pre-wrap" }}>📊 결과: {p.result}</div>}
              {p.outcome && <div style={{ fontSize: 13, marginTop: 4, fontWeight: 600, color: "var(--ok, #16a34a)" }}>▲ {p.outcome}</div>}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn sm" onClick={() => setEditing(true)}>수정</button>
              <button className="btn sm" onClick={remove} disabled={pending} style={{ color: "var(--owner)" }}>삭제</button>
            </div>
          </div>
        </>
      ) : (
        <form action={submit}>
          <Fields p={p} />
          {err && <div style={{ color: "var(--owner)", fontSize: 12, marginTop: 8 }}>{err}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="btn primary" disabled={pending}>{pending ? "저장 중…" : "수정 저장"}</button>
            <button type="button" className="btn" onClick={() => setEditing(false)} disabled={pending}>취소</button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function PromotionsClient({ items, dbReady }: { items: Promotion[]; dbReady: boolean }) {
  const [tab, setTab] = useState<string>("전체");
  const filtered = useMemo(() => (tab === "전체" ? items : items.filter((i) => i.periodType === tab)), [items, tab]);
  const tabs = ["전체", ...PERIODS];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>이벤트·프로모션</h1>
          <p>주·월·연 단위로 이벤트/프로모션을 기획하고 결과를 기록합니다.</p>
        </div>
        <AddForm />
      </div>

      {!dbReady && (
        <div className="card" style={{ padding: 14, marginBottom: 14 }}>
          <div className="empty">테이블이 아직 준비되지 않았습니다. 마이그레이션(0057_promotions.sql)을 적용해 주세요.</div>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {tabs.map((t) => {
          const n = t === "전체" ? items.length : items.filter((i) => i.periodType === t).length;
          return (
            <button key={t} className={`btn sm${tab === t ? " primary" : ""}`} onClick={() => setTab(t)}>
              {t === "전체" ? "전체" : `${t} 단위`} {n > 0 && <span style={{ opacity: 0.7 }}>({n})</span>}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="card"><div className="empty">등록된 프로모션이 없습니다. &ldquo;+ 프로모션 등록&rdquo;으로 추가하세요.</div></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((p) => <Row key={p.id} p={p} />)}
        </div>
      )}
    </div>
  );
}
