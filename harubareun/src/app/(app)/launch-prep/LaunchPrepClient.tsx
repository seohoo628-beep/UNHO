"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateChecklistStatus, setLaunchChecklist } from "./actions";
import SubChecklist, { type ChecklistItem } from "@/components/SubChecklist";

export type CheckItem = {
  id: string; scope: string; seq: number; category: string; item: string;
  owner: string | null; collab: string | null; reviewer: string | null;
  priority: string; prereq: string | null; due: string | null; status: string; note: string | null;
  checklist?: ChecklistItem[];
};
export type Revision = {
  id: string; product: string; section: string; original: string | null;
  grade: string | null; action: string | null; revision: string | null; rationale: string | null;
};

const PRIO_STYLE: Record<string, { bg: string; fg: string }> = {
  최우선: { bg: "rgba(239,68,68,.16)", fg: "#f87171" },
  높음: { bg: "rgba(245,158,11,.16)", fg: "#fbbf24" },
  일반: { bg: "rgba(148,163,184,.14)", fg: "#94a3b8" },
};
const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  미착수: { bg: "rgba(148,163,184,.14)", fg: "#94a3b8" },
  진행: { bg: "rgba(59,130,246,.16)", fg: "#60a5fa" },
  완료: { bg: "rgba(34,197,94,.16)", fg: "#4ade80" },
  지연: { bg: "rgba(239,68,68,.16)", fg: "#f87171" },
  보류: { bg: "rgba(168,85,247,.16)", fg: "#c084fc" },
};
const SCOPE_STYLE: Record<string, { bg: string; fg: string }> = {
  전사: { bg: "rgba(148,163,184,.14)", fg: "#cbd5e1" },
  하루바른: { bg: "rgba(236,72,153,.16)", fg: "#f472b6" },
  나아: { bg: "rgba(45,212,191,.16)", fg: "#2dd4bf" },
};
const GRADE_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  A: { bg: "rgba(239,68,68,.18)", fg: "#f87171", label: "A · 전면삭제" },
  B: { bg: "rgba(245,158,11,.18)", fg: "#fbbf24", label: "B · 조건부" },
  C: { bg: "rgba(34,197,94,.18)", fg: "#4ade80", label: "C · 자유" },
  유지: { bg: "rgba(34,197,94,.18)", fg: "#4ade80", label: "유지" },
};

function Chip({ text, style, size = 11 }: { text: string; style: { bg: string; fg: string }; size?: number }) {
  return (
    <span style={{ background: style.bg, color: style.fg, borderRadius: 999, padding: "2px 8px", fontSize: size, fontWeight: 800, whiteSpace: "nowrap" }}>
      {text}
    </span>
  );
}

function ownerLabel(role: string | null): string {
  if (!role) return "-";
  return role === "MD" ? "MD · 신규" : role;
}

const STATUSES = ["미착수", "진행", "완료", "지연", "보류"];

function StatusSelect({ id, status, canEdit }: { id: string; status: string; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const st = STATUS_STYLE[status] ?? STATUS_STYLE.미착수;
  if (!canEdit) return <Chip text={status} style={st} />;
  return (
    <select
      value={status}
      disabled={pending}
      onChange={(e) => { const v = e.target.value; start(async () => { await updateChecklistStatus(id, v); router.refresh(); }); }}
      style={{ background: st.bg, color: st.fg, border: "none", borderRadius: 999, padding: "3px 8px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
    >
      {STATUSES.map((s) => <option key={s} value={s} style={{ color: "#0f172a" }}>{s}</option>)}
    </select>
  );
}

function ChecklistTab({ items, canEdit }: { items: CheckItem[]; canEdit: boolean }) {
  const [cat, setCat] = useState<string>("전체");
  const [owner, setOwner] = useState<string>("전체");

  const cats = useMemo(() => ["전체", ...Array.from(new Set(items.map((i) => i.category)))], [items]);
  const owners = useMemo(() => ["전체", ...Array.from(new Set(items.map((i) => i.owner).filter(Boolean) as string[]))], [items]);

  const filtered = items.filter((i) => (cat === "전체" || i.category === cat) && (owner === "전체" || i.owner === owner));

  // 담당별 진행 요약
  const byOwner = useMemo(() => {
    const m = new Map<string, { total: number; done: number }>();
    for (const i of items) {
      const k = i.owner || "미지정";
      const e = m.get(k) ?? { total: 0, done: 0 };
      e.total++; if (i.status === "완료") e.done++;
      m.set(k, e);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].total - a[1].total);
  }, [items]);
  const total = items.length;
  const done = items.filter((i) => i.status === "완료").length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  // 카테고리별 그룹(필터 반영)
  const groups = useMemo(() => {
    const m = new Map<string, CheckItem[]>();
    for (const i of filtered) { const a = m.get(i.category) ?? []; a.push(i); m.set(i.category, a); }
    return Array.from(m.entries());
  }, [filtered]);

  return (
    <div>
      {/* 진행 요약 */}
      <div className="card" style={{ padding: 14, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900, fontSize: 20 }}>{done}<span className="muted" style={{ fontSize: 14, fontWeight: 700 }}> / {total} 완료</span></div>
          <div style={{ fontWeight: 900, fontSize: 16, color: "#4ade80" }}>{pct}%</div>
        </div>
        <div style={{ height: 8, borderRadius: 999, background: "rgba(148,163,184,.18)", marginTop: 8, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg,#22c55e,#4ade80)" }} />
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {byOwner.map(([k, v]) => (
            <span key={k} style={{ background: "rgba(148,163,184,.1)", borderRadius: 8, padding: "4px 8px", fontSize: 11.5, fontWeight: 700 }}>
              {ownerLabel(k === "미지정" ? null : k)} <span className="muted">{v.done}/{v.total}</span>
            </span>
          ))}
        </div>
      </div>

      {/* 필터 */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {cats.map((c) => (
          <button key={c} className="btn sm" onClick={() => setCat(c)}
            style={{ fontWeight: 700, ...(cat === c ? { background: "var(--accent, #6366f1)", color: "#fff" } : {}) }}>{c}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {owners.map((o) => (
          <button key={o} className="btn sm" onClick={() => setOwner(o)}
            style={{ fontSize: 12, ...(owner === o ? { background: "rgba(99,102,241,.2)", color: "#a5b4fc", fontWeight: 800 } : {}) }}>
            {o === "전체" ? "담당 전체" : ownerLabel(o)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card"><div className="empty">해당 조건의 항목이 없습니다.</div></div>
      ) : groups.map(([g, list]) => (
        <div key={g} style={{ marginBottom: 16 }}>
          <div className="section-title">{g} <span className="muted" style={{ fontWeight: 700 }}>· {list.length}</span></div>
          <div style={{ display: "grid", gap: 8 }}>
            {list.map((i) => {
              const ps = PRIO_STYLE[i.priority] ?? PRIO_STYLE.일반;
              const ss = SCOPE_STYLE[i.scope] ?? SCOPE_STYLE.전사;
              return (
                <div key={i.id} className="card" style={{ padding: "12px 14px" }}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
                    <Chip text={i.scope} style={ss} />
                    <Chip text={i.priority} style={ps} />
                    {i.due && <span className="muted" style={{ fontSize: 11.5, fontWeight: 700 }}>~{i.due}</span>}
                    <span style={{ marginLeft: "auto" }}><StatusSelect id={i.id} status={i.status} canEdit={canEdit} /></span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14.5, lineHeight: 1.4 }}>{i.item}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 6, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <span>담당 <b style={{ color: "var(--text, #e2e8f0)" }}>{ownerLabel(i.owner)}</b></span>
                    {i.collab && <span>협업 {i.collab}</span>}
                    {i.reviewer && <span>검수 {i.reviewer}</span>}
                  </div>
                  {i.prereq && <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>선행 · {i.prereq}</div>}
                  {i.note && <div className="muted" style={{ fontSize: 11.5, marginTop: 4, opacity: .85 }}>{i.note}</div>}
                  <SubChecklist initial={i.checklist} canEdit={canEdit} compact onSave={(items) => setLaunchChecklist(i.id, items)} />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function RevisionTab({ revisions }: { revisions: Revision[] }) {
  const products = useMemo(() => Array.from(new Set(revisions.map((r) => r.product))), [revisions]);
  const [prod, setProd] = useState<string>(products[0] ?? "");
  const list = revisions.filter((r) => r.product === prod);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of revisions.filter((x) => x.product === prod)) { const g = r.grade === "C" || r.grade === "유지" ? "유지" : (r.grade || "-"); c[g] = (c[g] || 0) + 1; }
    return c;
  }, [revisions, prod]);

  return (
    <div>
      <div className="card" style={{ padding: 12, marginBottom: 12, fontSize: 12.5 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Chip text="A" style={GRADE_STYLE.A} size={12} /> <span className="muted">질병·기능성 표방·허위 → 전면 삭제</span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 5 }}>
          <Chip text="B" style={GRADE_STYLE.B} size={12} /> <span className="muted">원료 수준 설명·근거 수치 → 각주 병기 조건부</span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 5 }}>
          <Chip text="C" style={GRADE_STYLE.C} size={12} /> <span className="muted">상황·정서·사실 표기 → 자유 사용 (페이지 중심 축)</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {products.map((p) => (
          <button key={p} className="btn sm" onClick={() => setProd(p)}
            style={{ fontWeight: 800, ...(prod === p ? { background: "var(--accent, #6366f1)", color: "#fff" } : {}) }}>{p}</button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {Object.entries(counts).map(([g, n]) => (
          <span key={g} style={{ background: (GRADE_STYLE[g] ?? GRADE_STYLE.유지).bg, color: (GRADE_STYLE[g] ?? GRADE_STYLE.유지).fg, borderRadius: 8, padding: "3px 9px", fontSize: 12, fontWeight: 800 }}>
            {g} {n}건
          </span>
        ))}
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {list.map((r) => {
          const gk = r.grade === "C" || r.grade === "유지" ? "유지" : (r.grade || "");
          const gs = GRADE_STYLE[gk] ?? { bg: "rgba(148,163,184,.14)", fg: "#94a3b8", label: r.grade || "-" };
          const keep = gk === "유지";
          return (
            <div key={r.id} className="card" style={{ padding: "12px 14px" }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
                <span style={{ background: "rgba(99,102,241,.14)", color: "#a5b4fc", borderRadius: 6, padding: "2px 8px", fontSize: 11.5, fontWeight: 800 }}>{r.section}</span>
                <Chip text={gs.label} style={gs} />
                {r.action && <span className="muted" style={{ fontSize: 11.5, fontWeight: 800 }}>{r.action}</span>}
              </div>
              {r.original && (
                <div style={{ fontSize: 13, lineHeight: 1.45, color: keep ? "var(--text, #e2e8f0)" : "#94a3b8", textDecoration: keep ? "none" : "line-through", textDecorationColor: "rgba(239,68,68,.5)" }}>
                  {r.original}
                </div>
              )}
              {r.revision && !keep && (
                <div style={{ fontSize: 13.5, lineHeight: 1.45, marginTop: 6, fontWeight: 600, display: "flex", gap: 6 }}>
                  <span style={{ color: "#4ade80", fontWeight: 900 }}>→</span>
                  <span>{r.revision}</span>
                </div>
              )}
              {r.rationale && <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>{r.rationale}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function LaunchPrepClient({ items, revisions, canEdit }: { items: CheckItem[]; revisions: Revision[]; canEdit: boolean }) {
  const [tab, setTab] = useState<"check" | "rev">("check");
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>🚀 런칭준비</h1>
          <p>하루바른·나아 런칭 체크리스트와 상세페이지 표현 수정안.</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        <button className="btn" onClick={() => setTab("check")}
          style={{ fontWeight: 800, ...(tab === "check" ? { background: "var(--accent, #6366f1)", color: "#fff" } : {}) }}>
          체크리스트 <span style={{ opacity: .8 }}>{items.length}</span>
        </button>
        <button className="btn" onClick={() => setTab("rev")}
          style={{ fontWeight: 800, ...(tab === "rev" ? { background: "var(--accent, #6366f1)", color: "#fff" } : {}) }}>
          상세페이지 수정안 <span style={{ opacity: .8 }}>{revisions.length}</span>
        </button>
      </div>

      {tab === "check" ? <ChecklistTab items={items} canEdit={canEdit} /> : <RevisionTab revisions={revisions} />}
    </div>
  );
}
