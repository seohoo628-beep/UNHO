"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DbSetupNotice } from "@/components/DbSetupNotice";
import {
  toggleChecklistMark,
  createChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  moveChecklistItem,
} from "@/app/(app)/hub/checklist-actions";
import { saveMyPrefs } from "@/app/(app)/hub/prefs-actions";
import {
  ROLE_OPTIONS,
  ROLE_LABEL,
  RECURRENCE_LABEL,
  WEEKDAY_LABELS,
  itemVisibleFor,
  type ChecklistItem,
  type DueItem,
  type Recurrence,
} from "@/lib/checklist";

const DAILY_SQL = `-- 0095_checklist_v2.sql 를 Supabase SQL Editor에 실행하세요.
create table if not exists public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  group_name text not null default '운영', label text not null, href text, role text,
  recurrence text not null default 'daily', weekday int, month_day int,
  sort_order int not null default 0, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.checklist_marks (
  check_date date not null, item_id uuid not null references public.checklist_items(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade, note text,
  updated_at timestamptz not null default now(), primary key (check_date, item_id, user_id));`;

export type WeekDay = { date: string; label: string; due: number; done: number; pct: number | null };
export type ChecklistBundle = {
  ready: boolean;
  items: DueItem[];
  allItems: ChecklistItem[];
  myRole: string | null;
  week: WeekDay[];
  streak: number;
};

function heat(pct: number | null): string {
  if (pct == null) return "var(--line)";
  if (pct >= 100) return "var(--ok, #16a34a)";
  if (pct <= 0) return "rgba(148,163,184,.35)";
  return "var(--accent)";
}

function recurrenceBadge(it: { recurrence: Recurrence; weekday: number | null; monthDay: number | null }): string | null {
  if (it.recurrence === "weekly") return `매주 ${it.weekday != null ? WEEKDAY_LABELS[it.weekday] : ""}`.trim();
  if (it.recurrence === "monthly") return `매월 ${it.monthDay ?? "-"}일`;
  return null;
}

export default function DailyChecklist({ today, bundle, isOwner, initialRole, initialCollapsed }: { today: string; bundle: ChecklistBundle; isOwner: boolean; initialRole?: string; initialCollapsed?: boolean }) {
  const router = useRouter();
  const [done, setDone] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(bundle.items.map((i) => [i.id, i.done]))
  );
  const [teamDelta, setTeamDelta] = useState<Record<string, number>>({});
  const [saveFailed, setSaveFailed] = useState(!bundle.ready);
  const [collapsed, setCollapsed] = useState(!!initialCollapsed);
  // 계정 저장값 우선, 없으면 직무 자동감지(대표는 전체)
  const [viewRole, setViewRole] = useState<string>(
    initialRole !== undefined ? initialRole : (bundle.myRole && bundle.myRole !== "owner" ? bundle.myRole : "")
  );
  const [manage, setManage] = useState(false);
  const [, start] = useTransition();

  const toggleCollapse = () => setCollapsed((v) => {
    const n = !v;
    start(async () => { await saveMyPrefs({ checklistCollapsed: n }); });
    return n;
  });
  const pickRole = (r: string) => {
    setViewRole(r);
    start(async () => { await saveMyPrefs({ checklistRole: r }); });
  };

  // 역할 필터 적용된 오늘 항목
  const visible = useMemo(() => bundle.items.filter((i) => itemVisibleFor(i, viewRole)), [bundle.items, viewRole]);
  const groups = useMemo(() => {
    const m = new Map<string, DueItem[]>();
    for (const it of visible) { if (!m.has(it.group)) m.set(it.group, []); m.get(it.group)!.push(it); }
    return Array.from(m.entries());
  }, [visible]);

  const total = visible.length;
  const doneCount = visible.filter((i) => done[i.id]).length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  // 필터에 실제 존재하는 역할 칩만 노출
  const roleChips = useMemo(() => {
    const present = new Set(bundle.items.map((i) => i.role ?? ""));
    return ROLE_OPTIONS.filter((r) => r.code === "" || present.has(r.code));
  }, [bundle.items]);

  const toggle = (id: string) => {
    const next = !done[id];
    setDone((d) => ({ ...d, [id]: next }));
    setTeamDelta((t) => ({ ...t, [id]: (t[id] ?? 0) + (next ? 1 : -1) }));
    start(async () => {
      let ok = false;
      try { ok = (await toggleChecklistMark(today, id, next)).ok; } catch { ok = false; }
      setSaveFailed(!ok);
    });
  };

  if (!bundle.ready) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <DbSetupNotice title="오늘의 체크리스트 (최초 1회 설정)" sql={DAILY_SQL} />
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 16 }}>
      {saveFailed && <div style={{ marginBottom: 12 }}><DbSetupNotice title="오늘의 체크리스트 저장(최초 1회)" sql={DAILY_SQL} /></div>}

      <button
        onClick={toggleCollapse}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10, width: "100%", border: "none", background: "transparent", cursor: "pointer", padding: 0, textAlign: "left" }}
      >
        <strong style={{ fontSize: 15, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ display: "inline-block", transform: collapsed ? "none" : "rotate(90deg)", transition: "transform .15s", fontSize: 11 }}>▸</span>
          ✅ 오늘의 체크리스트
          {bundle.streak > 0 && <span className="badge" style={{ background: "rgba(234,88,12,.14)", color: "#ea580c", fontWeight: 700 }}>🔥 {bundle.streak}일 연속</span>}
        </strong>
        <span className="muted" style={{ fontSize: 12.5 }}>{doneCount}/{total} 완료 · {pct}%</span>
      </button>

      <div style={{ height: 6, background: "var(--line)", borderRadius: 999, overflow: "hidden", marginBottom: collapsed ? 0 : 12 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: pct === 100 ? "var(--ok, #16a34a)" : "var(--accent)", transition: "width .2s" }} />
      </div>

      {!collapsed && (
        <>
          {/* 주간 달성률 히트맵 */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <span className="muted" style={{ fontSize: 11.5, fontWeight: 700 }}>최근 7일</span>
            <div style={{ display: "flex", gap: 5 }}>
              {bundle.week.map((d, i) => (
                <div key={d.date} title={`${d.date} · ${d.pct == null ? "해당 없음" : d.done + "/" + d.due + " (" + d.pct + "%)"}`} style={{ textAlign: "center" }}>
                  <div style={{ width: 20, height: 20, borderRadius: 6, background: heat(d.pct), opacity: i === bundle.week.length - 1 ? 1 : 0.85, border: i === bundle.week.length - 1 ? "1.5px solid var(--ink-2)" : "none" }} />
                  <div className="muted" style={{ fontSize: 9.5, marginTop: 2 }}>{d.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 역할 필터 */}
          {roleChips.length > 2 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {roleChips.map((r) => (
                <button key={r.code} className={`btn sm${viewRole === r.code ? " primary" : ""}`} onClick={() => pickRole(r.code)} style={{ fontSize: 12 }}>
                  {r.code === "" ? "전체" : r.label}
                </button>
              ))}
            </div>
          )}

          {total === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>오늘 표시할 항목이 없습니다.{viewRole ? " (필터: " + (ROLE_LABEL[viewRole] ?? "전체") + ")" : ""}</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
              {groups.map(([group, gitems]) => (
                <div key={group}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "var(--ink-2)", marginBottom: 6, letterSpacing: "0.02em" }}>{group}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {gitems.map((it) => {
                      const rb = recurrenceBadge(it);
                      const team = it.teamDone + (teamDelta[it.id] ?? 0);
                      return (
                        <label key={it.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 4px", cursor: "pointer", borderRadius: 6, fontSize: 13.5, opacity: done[it.id] ? 0.55 : 1 }}>
                          <input type="checkbox" checked={!!done[it.id]} onChange={() => toggle(it.id)} style={{ width: 17, height: 17, flexShrink: 0 }} />
                          <span style={{ textDecoration: done[it.id] ? "line-through" : "none", minWidth: 0 }}>{it.label}</span>
                          {it.role && <span className="badge" style={{ fontSize: 10, background: "rgba(99,102,241,.12)", color: "var(--accent)" }}>{ROLE_LABEL[it.role] ?? it.role}</span>}
                          {rb && <span className="badge" style={{ fontSize: 10, background: "rgba(148,163,184,.16)", color: "var(--ink-2)" }}>{rb}</span>}
                          {team > 0 && <span className="muted" style={{ fontSize: 10.5 }} title="오늘 완료한 팀원 수">👥 {team}</span>}
                          {it.href && <Link href={it.href} onClick={(e) => e.stopPropagation()} style={{ marginLeft: "auto", fontSize: 11, color: "var(--accent)", textDecoration: "none" }}>이동 ↗</Link>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, gap: 8, flexWrap: "wrap" }}>
            <p className="muted" style={{ fontSize: 11.5, margin: 0 }}>완료는 개인별·날짜별로 저장됩니다. 매일 아침 새로 시작돼요.</p>
            {isOwner && (
              <button className="btn sm" onClick={() => setManage((v) => !v)}>{manage ? "관리 닫기" : "⚙ 항목 관리"}</button>
            )}
          </div>

          {isOwner && manage && <ItemManager items={bundle.allItems} onChanged={() => router.refresh()} />}
        </>
      )}
    </div>
  );
}

// ── 대표 전용 항목 편집 ───────────────────────────────────────────────────────
function ItemManager({ items, onChanged }: { items: ChecklistItem[]; onChanged: () => void }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [nl, setNl] = useState("");
  const [ng, setNg] = useState("운영");
  const [nr, setNr] = useState("");

  const run = (p: Promise<{ ok: boolean; error?: string }>) => start(async () => {
    setErr(null);
    const r = await p;
    if (!r.ok) setErr(r.error ?? "오류");
    else onChanged();
  });

  const add = () => {
    if (!nl.trim()) return;
    run(createChecklistItem({ group: ng, label: nl, role: nr }));
    setNl("");
  };

  return (
    <div className="card" style={{ padding: 12, marginTop: 12, background: "rgba(148,163,184,.05)" }}>
      <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>항목 관리 <span className="muted" style={{ fontWeight: 400 }}>({items.length}개)</span></div>
      {err && <div style={{ color: "var(--owner)", fontSize: 12, marginBottom: 8 }}>{err}</div>}

      {/* 추가 */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        <input value={ng} onChange={(e) => setNg(e.target.value)} placeholder="그룹" style={{ width: 100, padding: "6px 8px", border: "1px solid var(--line-2)", borderRadius: 6, background: "var(--surface)", color: "var(--ink)", fontSize: 12.5 }} />
        <input value={nl} onChange={(e) => setNl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder="새 항목 이름" style={{ flex: 1, minWidth: 140, padding: "6px 8px", border: "1px solid var(--line-2)", borderRadius: 6, background: "var(--surface)", color: "var(--ink)", fontSize: 12.5 }} />
        <select value={nr} onChange={(e) => setNr(e.target.value)} style={{ padding: "6px 8px", borderRadius: 6, fontSize: 12.5 }}>
          {ROLE_OPTIONS.map((r) => <option key={r.code} value={r.code}>{r.code === "" ? "전원" : r.label}</option>)}
        </select>
        <button className="btn sm primary" disabled={pending || !nl.trim()} onClick={add}>추가</button>
      </div>

      {/* 목록 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {items.map((it, idx) => (
          <ManagerRow key={it.id} it={it} first={idx === 0} last={idx === items.length - 1} pending={pending} run={run} />
        ))}
      </div>
    </div>
  );
}

function ManagerRow({ it, first, last, pending, run }: {
  it: ChecklistItem; first: boolean; last: boolean; pending: boolean;
  run: (p: Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const rb = recurrenceBadge(it);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", padding: "6px 8px", borderRadius: 6, background: it.active ? "var(--surface)" : "rgba(148,163,184,.12)", border: "1px solid var(--line)" }}>
      <span className="muted" style={{ fontSize: 11, width: 54, flexShrink: 0 }}>{it.group}</span>
      <span style={{ flex: 1, minWidth: 120, fontSize: 13, opacity: it.active ? 1 : 0.5, textDecoration: it.active ? "none" : "line-through" }}>{it.label}</span>

      <select value={it.role ?? ""} disabled={pending} onChange={(e) => run(updateChecklistItem(it.id, { role: e.target.value }))} style={{ fontSize: 11.5, padding: "3px 5px", borderRadius: 6 }}>
        {ROLE_OPTIONS.map((r) => <option key={r.code} value={r.code}>{r.code === "" ? "전원" : r.label}</option>)}
      </select>

      <select value={it.recurrence} disabled={pending} onChange={(e) => run(updateChecklistItem(it.id, { recurrence: e.target.value }))} style={{ fontSize: 11.5, padding: "3px 5px", borderRadius: 6 }}>
        {(["daily", "weekly", "monthly"] as Recurrence[]).map((r) => <option key={r} value={r}>{RECURRENCE_LABEL[r]}</option>)}
      </select>
      {it.recurrence === "weekly" && (
        <select value={it.weekday ?? 1} disabled={pending} onChange={(e) => run(updateChecklistItem(it.id, { weekday: Number(e.target.value) }))} style={{ fontSize: 11.5, padding: "3px 5px", borderRadius: 6 }}>
          {WEEKDAY_LABELS.map((w, i) => <option key={i} value={i}>{w}</option>)}
        </select>
      )}
      {it.recurrence === "monthly" && (
        <select value={it.monthDay ?? 1} disabled={pending} onChange={(e) => run(updateChecklistItem(it.id, { monthDay: Number(e.target.value) }))} style={{ fontSize: 11.5, padding: "3px 5px", borderRadius: 6 }}>
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}일</option>)}
        </select>
      )}

      <button className="btn sm" disabled={pending || first} onClick={() => run(moveChecklistItem(it.id, "up"))} title="위로" style={{ padding: "1px 6px" }}>↑</button>
      <button className="btn sm" disabled={pending || last} onClick={() => run(moveChecklistItem(it.id, "down"))} title="아래로" style={{ padding: "1px 6px" }}>↓</button>
      <button className="btn sm" disabled={pending} onClick={() => run(updateChecklistItem(it.id, { active: !it.active }))} title={it.active ? "숨김" : "표시"} style={{ padding: "1px 7px" }}>{it.active ? "끄기" : "켜기"}</button>
      <button className="btn sm" disabled={pending} onClick={() => { if (confirm(`'${it.label}' 항목을 삭제할까요?`)) run(deleteChecklistItem(it.id)); }} style={{ padding: "1px 7px", color: "var(--owner)" }}>✕</button>
    </div>
  );
}
