"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createLog, updateLog, deleteLog } from "./actions";
import RevisionHistoryModal from "@/components/RevisionHistoryModal";

export type Log = { id: string; kind: string; logDate: string; hospital: string; treatment: string; doctor: string; area: string; cost: number | null; nextDate: string; note: string };

const KINDS = ["시술", "영양제", "운동", "기타"] as const;
const KIND_COLOR: Record<string, string> = { 시술: "#db2777", 영양제: "#16a34a", 운동: "#2563eb", 기타: "#64748b" };
const KIND_ICON: Record<string, string> = { 시술: "💉", 영양제: "💊", 운동: "🏋️", 기타: "🗒" };
// 종류별 라벨 (같은 컬럼을 문맥에 맞게 표기)
const L: Record<string, { date: string; what: string; who: string; where: string; area: string; next: string; whatPh: string }> = {
  시술: { date: "시술일", what: "시술/관리 내역", who: "담당 원장", where: "병원/의원", area: "부위", next: "다음 예정/재방문", whatPh: "예) 보톡스, 필러, 리프팅…" },
  영양제: { date: "복용 시작일", what: "영양제명/성분", who: "구입처", where: "브랜드/제품", area: "용량·복용법", next: "재구매/종료 예정", whatPh: "예) 오메가3, 비타민D, NMN…" },
  운동: { date: "시작일", what: "운동 종류", who: "트레이너/코치", where: "장소/센터", area: "빈도·강도", next: "목표/다음 단계", whatPh: "예) 웨이트, 러닝, 요가, 테니스…" },
  기타: { date: "시작일", what: "내용", who: "담당", where: "장소/제공처", area: "세부", next: "다음 예정", whatPh: "" },
};

const ROUTINE = ["숙면", "치아관리", "야식 금지", "운동", "자세 관리", "NMN", "라일로", "카뮤트", "비타민C 메가", "데일리 파이토", "무당티", "들깨 오메가3", "로게인 폼", "프로페시아", "바디튠 고촌마사지", "복이담 귀침"];

function RoutineBanner() {
  return (
    <div className="card" style={{ marginBottom: 14, overflow: "hidden", border: "1px solid #fbcfe8" }}>
      <div style={{ padding: "10px 14px", background: "linear-gradient(120deg, #db2777, #f472b6)", color: "#fff", fontWeight: 800, fontSize: 14.5 }}>📌 매일 루틴</div>
      <div style={{ padding: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
        {ROUTINE.map((r, i) => (
          <span key={i} className="badge" style={{ fontSize: 12.5, background: "#fdf2f8", color: "#9d174d", border: "1px solid #fbcfe8", padding: "4px 10px" }}>✓ {r}</span>
        ))}
      </div>
    </div>
  );
}

const won = (n: number | null) => (n == null ? "" : n.toLocaleString() + "원");
function todayKST() { try { return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }); } catch { return new Date().toISOString().slice(0, 10); } }

function Fields({ c }: { c?: Log }) {
  const [kind, setKind] = useState(c?.kind ?? "시술");
  const t = L[kind] || L.기타;
  return (
    <>
      <div className="row">
        <label className="field" style={{ marginBottom: 0 }}><span>종류</span>
          <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map((k) => <option key={k} value={k}>{KIND_ICON[k]} {k}</option>)}</select>
        </label>
        <label className="field" style={{ marginBottom: 0 }}><span>{t.date}</span><input type="date" name="log_date" defaultValue={c?.logDate || todayKST()} /></label>
      </div>
      <label className="field" style={{ marginTop: 10 }}><span>{t.what}</span><input name="treatment" defaultValue={c?.treatment ?? ""} placeholder={t.whatPh} /></label>
      <div className="row" style={{ marginTop: 10 }}>
        <label className="field" style={{ marginBottom: 0 }}><span>{t.where}</span><input name="hospital" defaultValue={c?.hospital ?? ""} /></label>
        <label className="field" style={{ marginBottom: 0 }}><span>{t.who}</span><input name="doctor" defaultValue={c?.doctor ?? ""} /></label>
        <label className="field" style={{ marginBottom: 0 }}><span>{t.area}</span><input name="area" defaultValue={c?.area ?? ""} /></label>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <label className="field" style={{ marginBottom: 0 }}><span>비용(원)</span><input name="cost" inputMode="numeric" defaultValue={c?.cost ?? ""} placeholder="예) 300000" /></label>
        <label className="field" style={{ marginBottom: 0 }}><span>{t.next}</span><input name="next_date" defaultValue={c?.nextDate ?? ""} placeholder="예) 2026-11 / 3개월 후" /></label>
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
  function submit(fd: FormData) { setErr(null); start(async () => { const r = await createLog(fd); if (!r.ok) return setErr(r.error ?? "저장 실패"); formRef.current?.reset(); setOpen(false); router.refresh(); }); }
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
  const t = L[c.kind] || L.기타;
  const color = KIND_COLOR[c.kind] ?? "#64748b";
  const meta = [c.hospital && `${t.where.split("/")[0]}: ${c.hospital}`, c.doctor && `${t.who.split("/")[0]}: ${c.doctor}`, c.area, won(c.cost)].filter(Boolean).join(" · ");
  return (
    <div className="card" style={{ padding: 14, borderLeft: `4px solid ${color}` }}>
      {hist && <RevisionHistoryModal entity="antiaging_logs" recordId={c.id} title={`${c.logDate} ${c.treatment}`} preview={(s) => `[${s?.kind ?? ""}] ${s?.log_date ?? ""} ${s?.treatment ?? ""}`} onClose={() => setHist(false)} />}
      {!editing ? (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 220, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span className="badge" style={{ background: color, color: "#fff" }}>{KIND_ICON[c.kind] ?? "🗒"} {c.kind}</span>
              <span className="muted" style={{ fontSize: 12.5 }}>📅 {c.logDate || "-"}</span>
              <strong style={{ fontSize: 15 }}>{c.treatment || "(내역 없음)"}</strong>
            </div>
            {meta && <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{meta}</div>}
            {c.nextDate && <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>🔁 {t.next.split("/")[0]}: {c.nextDate}</div>}
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
  const [kind, setKind] = useState("전체");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter((c) => {
      if (kind !== "전체" && (c.kind || "시술") !== kind) return false;
      if (!s) return true;
      return [c.logDate, c.hospital, c.treatment, c.doctor, c.area, c.note].filter(Boolean).join(" ").toLowerCase().includes(s);
    });
  }, [items, q, kind]);
  const counts = useMemo(() => { const m: Record<string, number> = {}; items.forEach((c) => { const k = c.kind || "시술"; m[k] = (m[k] ?? 0) + 1; }); return m; }, [items]);
  const total = useMemo(() => filtered.reduce((a, c) => a + (c.cost ?? 0), 0), [filtered]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>💆 안티에이징 관리</h1>
          <p>대표님만 보는 시술·영양제·운동 기록 · {filtered.length}건{total ? ` · 누적 ${total.toLocaleString()}원` : ""}</p>
        </div>
        <AddForm />
      </div>

      <RoutineBanner />

      {!dbReady && <div className="card" style={{ padding: 14, marginBottom: 14 }}><div className="empty">테이블이 아직 준비되지 않았습니다. 마이그레이션(0074·0075)을 적용해 주세요.</div></div>}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {["전체", ...KINDS].map((k) => { const n = k === "전체" ? items.length : counts[k] ?? 0; return <button key={k} className={`btn sm${kind === k ? " primary" : ""}`} onClick={() => setKind(k)}>{k === "전체" ? "전체" : `${KIND_ICON[k]} ${k}`} {n > 0 && <span style={{ opacity: 0.7 }}>({n})</span>}</button>; })}
      </div>
      <div style={{ marginBottom: 14, maxWidth: 360 }}>
        <input placeholder="병원·시술·영양제·운동·메모 검색" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%" }} />
      </div>

      {filtered.length === 0 ? (
        <div className="card"><div className="empty">{q || kind !== "전체" ? "해당 결과가 없습니다." : "기록이 없습니다. “+ 기록 추가”로 시작하세요."}</div></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((c) => <Row key={c.id} c={c} />)}
        </div>
      )}
    </div>
  );
}
