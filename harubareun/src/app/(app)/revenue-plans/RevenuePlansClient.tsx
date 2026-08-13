"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createRevenuePlan, updateRevenuePlan, deleteRevenuePlan } from "./actions";

export type RevenuePlan = {
  id: string;
  periodType: string;
  periodLabel: string;
  lever: string;
  title: string;
  plan: string;
  record: string;
  target: string;
  actual: string;
  status: string;
  logDate: string;
};

const PERIODS = ["일", "주", "월"] as const;
const LEVERS = ["유입·체류", "전환", "재구매"] as const;
const STATUSES = ["예정", "진행", "완료", "보류"] as const;
const LEVER_COLOR: Record<string, string> = { "유입·체류": "#0ea5e9", 전환: "#8b5cf6", 재구매: "#f59e0b" };
const STATUS_COLOR: Record<string, string> = { 예정: "#94a3b8", 진행: "#6366f1", 완료: "#10b981", 보류: "#ef4444" };

function Fields({ p, today }: { p?: RevenuePlan; today: string }) {
  return (
    <>
      <div className="row">
        <label className="field" style={{ marginBottom: 0 }}>
          <span>레버 *</span>
          <select name="lever" defaultValue={p?.lever ?? "유입·체류"}>
            {LEVERS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>기간 단위 *</span>
          <select name="period_type" defaultValue={p?.periodType ?? "주"}>
            {PERIODS.map((k) => <option key={k} value={k}>{k} 단위</option>)}
          </select>
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
          <span>기간 표기</span>
          <input name="period_label" placeholder="예) 2026-08-09 / 2026-W32 / 2026-08" defaultValue={p?.periodLabel ?? ""} />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>날짜(일 단위)</span>
          <input type="date" name="log_date" defaultValue={p?.logDate || today} />
        </label>
      </div>
      <label className="field" style={{ marginTop: 10 }}>
        <span>플랜명/주제 *</span>
        <input name="title" required placeholder="예) 상세페이지 첫 스크롤 개선" defaultValue={p?.title ?? ""} />
      </label>
      <label className="field" style={{ marginTop: 10 }}>
        <span>개선 플랜</span>
        <textarea name="plan" rows={3} placeholder="무엇을 어떻게 개선할지" defaultValue={p?.plan ?? ""} />
      </label>
      <div className="row" style={{ marginTop: 10 }}>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>목표 지표</span>
          <input name="target" placeholder="예) 체류 45초→70초 / 전환 1.8%→2.5%" defaultValue={p?.target ?? ""} />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>실제 지표</span>
          <input name="actual" placeholder="측정 결과" defaultValue={p?.actual ?? ""} />
        </label>
      </div>
      <label className="field" style={{ marginTop: 10 }}>
        <span>실행 기록/결과</span>
        <textarea name="record" rows={2} placeholder="실행 내용·회고" defaultValue={p?.record ?? ""} />
      </label>
    </>
  );
}

function AddForm({ today }: { today: string }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function submit(fd: FormData) {
    setErr(null);
    start(async () => {
      const r = await createRevenuePlan(fd);
      if (!r.ok) return setErr(r.error ?? "저장 실패");
      formRef.current?.reset();
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) return <button className="btn primary" onClick={() => setOpen(true)}>+ 플랜 등록</button>;
  return (
    <form ref={formRef} action={submit} className="card" style={{ padding: 14, marginBottom: 16 }}>
      <Fields today={today} />
      {err && <div style={{ color: "var(--owner)", fontSize: 12, marginTop: 8 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button className="btn primary" disabled={pending}>{pending ? "저장 중…" : "저장"}</button>
        <button type="button" className="btn" onClick={() => setOpen(false)} disabled={pending}>취소</button>
      </div>
    </form>
  );
}

function Row({ p, today }: { p: RevenuePlan; today: string }) {
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const lc = LEVER_COLOR[p.lever] ?? "#0ea5e9";
  const sc = STATUS_COLOR[p.status] ?? "#94a3b8";

  function submit(fd: FormData) {
    setErr(null);
    start(async () => {
      const r = await updateRevenuePlan(p.id, fd);
      if (!r.ok) return setErr(r.error ?? "저장 실패");
      setEditing(false);
      router.refresh();
    });
  }
  function remove() {
    if (!confirm("이 플랜을 삭제할까요?")) return;
    start(async () => {
      await deleteRevenuePlan(p.id);
      router.refresh();
    });
  }

  return (
    <div className="card" style={{ padding: 14, borderLeft: `4px solid ${lc}` }}>
      {!editing ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 200, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span className="badge" style={{ background: lc, color: "#fff" }}>{p.lever}</span>
              <span className="badge" style={{ background: sc, color: "#fff" }}>{p.status}</span>
              <span className="muted" style={{ fontSize: 12 }}>{p.periodType} 단위{p.periodLabel ? ` · ${p.periodLabel}` : ""}</span>
              <span style={{ fontWeight: 700 }}>{p.title}</span>
            </div>
            {p.plan && <div style={{ fontSize: 13.5, marginTop: 6, whiteSpace: "pre-wrap" }}>📝 {p.plan}</div>}
            {(p.target || p.actual) && (
              <div style={{ fontSize: 13, marginTop: 5 }}>
                🎯 목표 {p.target || "-"} {p.actual ? ` · 실제 ${p.actual}` : ""}
              </div>
            )}
            {p.record && <div style={{ fontSize: 13.5, marginTop: 5, whiteSpace: "pre-wrap" }}>📊 {p.record}</div>}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn sm" onClick={() => setEditing(true)}>수정</button>
            <button className="btn sm" onClick={remove} disabled={pending} style={{ color: "var(--owner)" }}>삭제</button>
          </div>
        </div>
      ) : (
        <form action={submit}>
          <Fields p={p} today={today} />
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

export default function RevenuePlansClient({ items, today, dbReady }: { items: RevenuePlan[]; today: string; dbReady: boolean }) {
  const [period, setPeriod] = useState<string>("전체");
  const [lever, setLever] = useState<string>("전체");
  const filtered = useMemo(
    () => items.filter((i) => (period === "전체" || i.periodType === period) && (lever === "전체" || i.lever === lever)),
    [items, period, lever]
  );

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>매출증대방안</h1>
          <p>유입·체류시간 / 전환율 / 재구매율을 높이기 위한 플랜과 기록을 일·주·월 단위로 관리합니다.</p>
        </div>
        <AddForm today={today} />
      </div>

      {!dbReady && (
        <div className="card" style={{ padding: 14, marginBottom: 14 }}>
          <div className="empty">테이블이 아직 준비되지 않았습니다. 마이그레이션(0058_revenue_plans.sql)을 적용해 주세요.</div>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {["전체", ...LEVERS].map((t) => (
          <button key={t} className={`btn sm${lever === t ? " primary" : ""}`} onClick={() => setLever(t)}>
            {t}{t !== "전체" && ` (${items.filter((i) => i.lever === t).length})`}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {["전체", ...PERIODS].map((t) => (
          <button key={t} className={`btn sm${period === t ? " primary" : ""}`} onClick={() => setPeriod(t)}>
            {t === "전체" ? "전체" : `${t} 단위`}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card"><div className="empty">등록된 플랜이 없습니다. &ldquo;+ 플랜 등록&rdquo;으로 추가하세요.</div></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((p) => <Row key={p.id} p={p} today={today} />)}
        </div>
      )}
    </div>
  );
}
