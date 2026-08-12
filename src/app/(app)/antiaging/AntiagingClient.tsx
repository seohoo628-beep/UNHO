"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createLog, updateLog, deleteLog } from "./actions";
import RevisionHistoryModal from "@/components/RevisionHistoryModal";

export type Log = { id: string; logDate: string; hospital: string; treatment: string; doctor: string; area: string; cost: number | null; nextDate: string; note: string };

const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid var(--line-2)", borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--ink)", fontSize: 13.5 };

function todayKST() { try { return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }); } catch { return new Date().toISOString().slice(0, 10); } }
const won = (n: number | null) => (n == null ? "" : n.toLocaleString() + "원");

function Fields({ c }: { c?: Log }) {
  return (
    <>
      <div className="row">
        <label className="field" style={{ marginBottom: 0 }}><span>시술일</span><input type="date" name="log_date" defaultValue={c?.logDate || todayKST()} /></label>
        <label className="field" style={{ marginBottom: 0 }}><span>병원/의원</span><input name="hospital" defaultValue={c?.hospital ?? ""} placeholder="예) 엣지라인의원" /></label>
        <label className="field" style={{ marginBottom: 0 }}><span>담당 원장</span><input name="doctor" defaultValue={c?.doctor ?? ""} /></label>
      </div>
      <label className="field" style={{ marginTop: 10 }}><span>시술/관리 내역</span><input name="treatment" defaultValue={c?.treatment ?? ""} placeholder="예) 보톡스, 필러, 리프팅, 스킨부스터…" /></label>
      <div className="row" style={{ marginTop: 10 }}>
        <label className="field" style={{ marginBottom: 0 }}><span>부위</span><input name="area" defaultValue={c?.area ?? ""} placeholder="예) 이마, 팔자, 턱선" /></label>
        <label className="field" style={{ marginBottom: 0 }}><span>비용(원)</span><input name="cost" inputMode="numeric" defaultValue={c?.cost ?? ""} placeholder="예) 300000" /></label>
        <label className="field" style={{ marginBottom: 0 }}><span>다음 예정/재방문</span><input name="next_date" defaultValue={c?.nextDate ?? ""} placeholder="예) 2026-11 / 3개월 후" /></label>
      </div>
      <label className="field" style={{ marginTop: 10 }}><span>효과·후기·메모</span><textarea name="note" rows={2} defaultValue={c?.note ?? ""} placeholder="경과·부작용·다음에 참고할 점 등" /></label>
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
    start(async () => { const r = await createLog(fd); if (!r.ok) return setErr(r.error ?? "저장 실패"); formRef.current?.reset(); setOpen(false); router.refresh(); });
  }
  if (!open) return <button className="btn primary" onClick={() => setOpen(true)}>+ 기록 추가</button>;
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

function Row({ c }: { c: Log }) {
  const [editing, setEditing] = useState(false);
  const [hist, setHist] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  function submit(fd: FormData) { setErr(null); start(async () => { const r = await updateLog(c.id, fd); if (!r.ok) return setErr(r.error ?? "저장 실패"); setEditing(false); router.refresh(); }); }
  function remove() { if (!confirm("이 기록을 삭제할까요?")) return; start(async () => { await deleteLog(c.id); router.refresh(); }); }
  const meta = [c.area, c.doctor, won(c.cost)].filter(Boolean).join(" · ");
  return (
    <div className="card" style={{ padding: 14, borderLeft: "4px solid #db2777" }}>
      {hist && <RevisionHistoryModal entity="antiaging_logs" recordId={c.id} title={`${c.logDate} ${c.treatment}`} preview={(s) => `${s?.log_date ?? ""} ${s?.hospital ?? ""} · ${s?.treatment ?? ""}`} onClose={() => setHist(false)} />}
      {!editing ? (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 220, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span className="badge" style={{ background: "#db2777", color: "#fff" }}>📅 {c.logDate || "-"}</span>
              <strong style={{ fontSize: 15 }}>{c.treatment || "(내역 없음)"}</strong>
            </div>
            {c.hospital && <div style={{ fontSize: 13.5, marginTop: 3 }}>🏥 {c.hospital}</div>}
            {meta && <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>{meta}</div>}
            {c.nextDate && <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>🔁 다음: {c.nextDate}</div>}
            {c.note && <div style={{ fontSize: 13, marginTop: 5, whiteSpace: "pre-wrap" }}>📝 {c.note}</div>}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
            <button className="btn sm" onClick={() => setEditing(true)}>수정</button>
            <button className="btn sm" onClick={() => setHist(true)} title="버전 기록·복원">🕘</button>
            <button className="btn sm" onClick={remove} disabled={pending} style={{ color: "var(--owner)" }}>삭제</button>
          </div>
        </div>
      ) : (
        <form action={submit}>
          <Fields c={c} />
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

export default function AntiagingClient({ items, dbReady }: { items: Log[]; dbReady: boolean }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((c) => [c.logDate, c.hospital, c.treatment, c.doctor, c.area, c.note].filter(Boolean).join(" ").toLowerCase().includes(s));
  }, [items, q]);
  const total = useMemo(() => items.reduce((a, c) => a + (c.cost ?? 0), 0), [items]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>💆 안티에이징 관리</h1>
          <p>대표님만 보는 시술·병원 기록 · 총 {items.length}건{total ? ` · 누적 ${total.toLocaleString()}원` : ""}</p>
        </div>
        <AddForm />
      </div>

      {!dbReady && <div className="card" style={{ padding: 14, marginBottom: 14 }}><div className="empty">테이블이 아직 준비되지 않았습니다. 마이그레이션(0074_antiaging)을 적용해 주세요.</div></div>}

      <div style={{ marginBottom: 14, maxWidth: 360 }}>
        <input placeholder="병원·시술·부위·메모 검색" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%" }} />
      </div>

      {filtered.length === 0 ? (
        <div className="card"><div className="empty">{q ? "해당 결과가 없습니다." : "기록이 없습니다. “+ 기록 추가”로 시작하세요."}</div></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((c) => <Row key={c.id} c={c} />)}
        </div>
      )}
    </div>
  );
}
