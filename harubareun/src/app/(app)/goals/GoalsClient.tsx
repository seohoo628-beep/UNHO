"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateGoal, createGoal, deleteGoal } from "./actions";

export type Goal = { id: string; scope: string; metric: string; value: number | null; unit: string | null; note: string | null };

function ValueEdit({ id, value, unit }: { id: string; value: number | null; unit: string | null }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(value == null ? "" : String(value));
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!edit) return (
    <button className="btn sm" style={{ fontWeight: 800, fontSize: 15 }} onClick={() => setEdit(true)} title="클릭해서 수정">
      {value == null ? "-" : value.toLocaleString("ko-KR")}{unit ?? ""}
    </button>
  );
  return (
    <span style={{ display: "inline-flex", gap: 4 }}>
      <input value={v} onChange={(e) => setV(e.target.value)} style={{ width: 130 }} inputMode="numeric" autoFocus />
      <button className="btn sm" disabled={pending} onClick={() => start(async () => { await updateGoal(id, Number(v.replace(/[, ]/g, "")) || 0); setEdit(false); router.refresh(); })}>저장</button>
    </span>
  );
}

export default function GoalsClient({ goals, canEdit }: { goals: Goal[]; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const scopes = [...new Set(goals.map((g) => g.scope))];
  const submit = (fd: FormData) => start(async () => { const r = await createGoal(fd); if (!r.ok) { setErr(r.error ?? "실패"); return; } setErr(null); setOpen(false); router.refresh(); });

  return (
    <div>
      <div className="page-head">
        <div><h1>목표 대시보드</h1><p>연·월·법인별 매출 목표. 값을 눌러 수정한다.</p></div>
        {canEdit && <button className="btn primary" onClick={() => setOpen((v) => !v)}>{open ? "닫기" : "+ 목표 추가"}</button>}
      </div>
      {open && canEdit && (
        <form action={submit} className="card" style={{ marginBottom: 14, display: "grid", gap: 8 }}>
          <div className="row">
            <label className="field"><span>구분</span><select name="scope"><option>전사</option><option>하루바른</option><option>나아</option></select></label>
            <label className="field"><span>단위</span><input name="unit" placeholder="원 / 명 / 개월" /></label>
          </div>
          <label className="field"><span>지표 *</span><input name="metric" required placeholder="예) 연매출 목표" /></label>
          <label className="field"><span>목표값</span><input name="value" inputMode="numeric" /></label>
          <label className="field"><span>비고</span><input name="note" /></label>
          <div><button className="btn primary" disabled={pending}>{pending ? "저장 중..." : "저장"}</button>{err && <span style={{ color: "var(--owner)", marginLeft: 8 }}>{err}</span>}</div>
        </form>
      )}
      {goals.length === 0 ? (
        <div className="card"><div className="empty">등록된 목표가 없습니다.</div></div>
      ) : scopes.map((sc) => (
        <div key={sc} style={{ marginBottom: 16 }}>
          <div className="section-title">{sc}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            {goals.filter((g) => g.scope === sc).map((g) => (
              <div key={g.id} className="card" style={{ padding: 14 }}>
                <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>{g.metric}</div>
                <div style={{ marginTop: 4 }}>{canEdit ? <ValueEdit id={g.id} value={g.value} unit={g.unit} /> : <span style={{ fontWeight: 800, fontSize: 15 }}>{g.value?.toLocaleString("ko-KR") ?? "-"}{g.unit ?? ""}</span>}</div>
                {g.note && <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>{g.note.replace("⟦보드시드⟧", "").trim()}</div>}
                {canEdit && <button className="btn sm" style={{ marginTop: 6 }} onClick={() => start(async () => { await deleteGoal(g.id); router.refresh(); })}>삭제</button>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
