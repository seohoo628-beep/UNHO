"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleDailyCheck, addDailyItem, updateDailyItem, deleteDailyItem, setUserPrefs, reorderDailyItems } from "@/app/(app)/hub/actions";
import { DbSetupNotice } from "@/components/DbSetupNotice";
import { CHECKLIST, ALL_KEYS, mergeForDay, WEEKDAY_LABELS, type DailyGroup, type SmartItem, type CustomDailyItem, type WeeklyReport, type MonthlyReport } from "@/lib/dailyChecklist";

export { CHECKLIST, ALL_KEYS };

const DAILY_SQL = `create table if not exists public.daily_checks (
  check_date date not null, item_key text not null,
  done boolean not null default false, note text,
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (check_date, item_key)
);
alter table public.daily_checks enable row level security;
drop policy if exists daily_checks_all on public.daily_checks;
create policy daily_checks_all on public.daily_checks for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));`;


export default function DailyChecklist({
  today, initialDone, smartItems = [], streak = 0, customItems = [], todayDow = 0, hiddenDailyKeys = [], weekly = null, monthly = null, eveningNudge = false, members = [], currentUserName = "", baseGroups = CHECKLIST, title = "✅ 오늘의 체크리스트",
}: {
  today: string; initialDone: Record<string, boolean>; smartItems?: SmartItem[]; streak?: number;
  customItems?: CustomDailyItem[]; todayDow?: number; hiddenDailyKeys?: string[]; weekly?: WeeklyReport | null; monthly?: MonthlyReport | null; eveningNudge?: boolean;
  members?: string[]; currentUserName?: string; baseGroups?: DailyGroup[]; title?: string;
}) {
  const router = useRouter();
  const [done, setDone] = useState<Record<string, boolean>>(initialDone);
  const [saveFailed, setSaveFailed] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [managing, setManaging] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [, start] = useTransition();

  const hiddenSet = useMemo(() => new Set(hiddenDailyKeys), [hiddenDailyKeys]);
  const hasAssignees = useMemo(() => customItems.some((c) => c.assignee), [customItems]);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("daily-checklist-collapsed") === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const toggleCollapse = () => {
    setCollapsed((v) => {
      const n = !v;
      try {
        localStorage.setItem("daily-checklist-collapsed", n ? "1" : "0");
      } catch {
        /* ignore */
      }
      return n;
    });
  };

  // 오늘 표시할 그룹(고정 + 오늘 요일에 해당하는 사용자 항목). 내가 숨긴 고정 항목은 제외.
  // '내 담당만' 켜면 담당자가 나이거나 미지정인 항목만(고정 항목은 항상 표시).
  const groups = useMemo(
    () => mergeForDay(customItems, todayDow, baseGroups)
      .map((g) => ({
        group: g.group,
        items: g.items.filter((i) => !hiddenSet.has(i.key) && (!mineOnly || !i.custom || !i.assignee || i.assignee === currentUserName)),
      }))
      .filter((g) => g.items.length > 0),
    [customItems, todayDow, hiddenSet, mineOnly, currentUserName, baseGroups]
  );
  const allKeys = useMemo(() => groups.flatMap((g) => g.items.map((i) => i.key)), [groups]);

  const total = allKeys.length;
  const doneCount = allKeys.filter((k) => done[k]).length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  const toggle = (key: string) => {
    const next = !done[key];
    setDone((d) => ({ ...d, [key]: next })); // 클릭한 상태를 그대로 유지(되돌리지 않음)
    start(async () => {
      let ok = false;
      try {
        const r = await toggleDailyCheck(today, key, next);
        ok = r.ok;
      } catch {
        ok = false;
      }
      setSaveFailed(!ok); // 저장 실패해도 화면은 유지하고 안내만 표시
    });
  };

  return (
    <div className="card" style={{ padding: 16 }}>
      {saveFailed && (
        <div style={{ marginBottom: 12 }}>
          <DbSetupNotice title="일일 체크리스트 저장(최초 1회)" sql={DAILY_SQL} />
        </div>
      )}
      <button
        onClick={toggleCollapse}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10, width: "100%", border: "none", background: "transparent", cursor: "pointer", padding: 0, textAlign: "left" }}
      >
        <strong style={{ fontSize: 15, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ display: "inline-block", transform: collapsed ? "none" : "rotate(90deg)", transition: "transform .15s", fontSize: 11 }}>▸</span>
          {title}
          {streak > 0 && <span className="badge" style={{ fontSize: 11, background: "var(--warn-bg,#fef3c7)", color: "var(--warn,#b45309)" }}>🔥 {streak}일 연속</span>}
        </strong>
        <span className="muted" style={{ fontSize: 12.5 }}>{doneCount}/{total} 완료 · {pct}%</span>
      </button>
      <div style={{ height: 6, background: "var(--line)", borderRadius: 999, overflow: "hidden", marginBottom: collapsed ? 0 : 14 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: pct === 100 ? "var(--ok, #16a34a)" : "var(--accent)", transition: "width .2s" }} />
      </div>

      {eveningNudge && total > 0 && doneCount < total && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", marginBottom: collapsed ? 0 : 14, marginTop: collapsed ? 10 : 0, borderRadius: 10, background: "var(--owner-bg,#fdecea)", border: "1px solid var(--owner,#dc2626)" }}>
          <span style={{ fontSize: 16 }}>🌙</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--owner,#b3261e)", flex: 1, minWidth: 0 }}>
            오늘 마감 전이에요 · 아직 <b>{total - doneCount}개</b> 미완료
          </span>
          {collapsed && <button className="btn sm" onClick={toggleCollapse} style={{ flexShrink: 0 }}>펼치기</button>}
        </div>
      )}

      {!collapsed && smartItems.length > 0 && (
        <div style={{ marginBottom: 14, padding: "10px 12px", border: "1px solid var(--accent)", borderRadius: 10, background: "var(--accent-bg)" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--accent)", marginBottom: 6 }}>📌 오늘 자동 할 일 (실시간)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {smartItems.map((s) => (
              <Link key={s.key} href={s.href} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, textDecoration: "none", color: "var(--ink)" }}>
                <span className="badge owner" style={{ fontSize: 11, flexShrink: 0 }}>{s.count}</span>
                <span style={{ flex: 1, minWidth: 0 }}>{s.label}</span>
                <span style={{ fontSize: 11, color: "var(--accent)" }}>처리 →</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {!collapsed && (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
        {groups.map((g) => (
          <div key={g.group}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "var(--ink-2)", marginBottom: 6, letterSpacing: "0.02em" }}>{g.group}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {g.items.map((it) => (
                <label key={it.key} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "5px 4px", cursor: "pointer", borderRadius: 6, fontSize: 13.5, opacity: done[it.key] ? 0.55 : 1 }}>
                  <input type="checkbox" checked={!!done[it.key]} onChange={() => toggle(it.key)} style={{ width: 17, height: 17, flexShrink: 0, marginTop: 1 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ textDecoration: done[it.key] ? "line-through" : "none" }}>{it.label}</span>
                    {it.assignee && <span className="badge" style={{ fontSize: 10, marginLeft: 6, background: it.assignee === currentUserName ? "var(--accent-bg)" : "var(--line)", color: it.assignee === currentUserName ? "var(--accent)" : "var(--ink-2)" }}>👤 {it.assignee}</span>}
                    {it.note && <span style={{ display: "block", fontSize: 11.5, color: "var(--ink-2)", marginTop: 1 }}>💬 {it.note}</span>}
                  </span>
                  {it.href && (
                    <Link href={it.href} onClick={(e) => e.stopPropagation()} style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none", flexShrink: 0, marginTop: 1 }}>이동 ↗</Link>
                  )}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      )}

      {!collapsed && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <p className="muted" style={{ fontSize: 11.5, margin: 0 }}>체크는 날짜별로 저장돼요. 매일 아침 새로 시작됩니다.{customItems.length > 0 ? " · 요일 지정 항목은 해당 요일에만 표시됩니다." : ""}</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {hasAssignees && <button className="btn sm" onClick={() => setMineOnly((v) => !v)} style={mineOnly ? { background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" } : undefined}>👤 내 담당만</button>}
            {(weekly || monthly) && <button className="btn sm" onClick={() => setShowReport((v) => !v)}>{showReport ? "닫기" : "📊 리포트"}</button>}
            <button className="btn sm" onClick={() => setManaging((v) => !v)}>{managing ? "닫기" : "✏️ 항목 편집"}</button>
          </div>
        </div>
      )}

      {!collapsed && showReport && (weekly || monthly) && <ReportPanel weekly={weekly} monthly={monthly} />}

      {!collapsed && managing && (
        <ManagePanel customItems={customItems} hiddenSet={hiddenSet} members={members} baseGroups={baseGroups} onChanged={() => router.refresh()} start={start} />
      )}
    </div>
  );
}

function ManagePanel({ customItems, hiddenSet, members, baseGroups = CHECKLIST, onChanged, start }: { customItems: CustomDailyItem[]; hiddenSet: Set<string>; members: string[]; baseGroups?: DailyGroup[]; onChanged: () => void; start: (fn: () => Promise<void>) => void }) {
  const groupOptions = useMemo(() => {
    const s = new Set<string>(baseGroups.map((g) => g.group));
    customItems.forEach((c) => s.add(c.group));
    return [...s];
  }, [customItems, baseGroups]);

  // 낙관적 숨김 상태(토글 즉시 반영).
  const [hidden, setHidden] = useState<Set<string>>(new Set(hiddenSet));
  useEffect(() => { setHidden(new Set(hiddenSet)); }, [hiddenSet]);

  // 사용자 항목 순서(낙관적).
  const [order, setOrder] = useState<CustomDailyItem[]>(customItems);
  useEffect(() => { setOrder(customItems); }, [customItems]);
  const move = (id: string, dir: "up" | "down") => {
    setOrder((prev) => {
      const i = prev.findIndex((x) => x.id === id);
      if (i < 0) return prev;
      const j = dir === "up" ? i - 1 : i + 1;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      start(async () => { await reorderDailyItems(next.map((x) => x.id)); onChanged(); });
      return next;
    });
  };

  const toggleHide = (key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      const arr = [...next];
      start(async () => { await setUserPrefs({ hiddenDailyKeys: arr }); onChanged(); });
      return next;
    });
  };

  return (
    <div style={{ marginTop: 12, padding: 12, border: "1px dashed var(--line-2)", borderRadius: 10, background: "var(--surface-2, var(--surface))" }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 8 }}>✏️ 내 체크리스트 항목 편집</div>

      {/* 고정 항목 표시/숨김 — 본인 해당 업무만 보이게 */}
      <details style={{ marginBottom: 12 }}>
        <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 700, color: "var(--ink-2)" }}>기본 항목 표시/숨김 (본인 담당만 남기기)</summary>
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
          {baseGroups.map((g) => (
            <div key={g.group}>
              <div className="muted" style={{ fontSize: 11, fontWeight: 800, marginBottom: 4 }}>{g.group}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {g.items.map((it) => {
                  const off = hidden.has(it.key);
                  return (
                    <button key={it.key} type="button" onClick={() => toggleHide(it.key)} className="btn sm"
                      title={off ? "숨김 → 클릭 시 표시" : "표시 중 → 클릭 시 숨김"}
                      style={{ padding: "3px 9px", fontSize: 12, opacity: off ? 0.5 : 1, textDecoration: off ? "line-through" : "none" }}>
                      {off ? "🙈" : "👁"} {it.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </details>

      <ItemEditor mode="add" groupOptions={groupOptions} members={members} onDone={onChanged} start={start} />
      {order.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          {order.map((c, i) => (
            <ItemEditor key={c.id} mode="edit" item={c} groupOptions={groupOptions} members={members} onDone={onChanged} start={start}
              onMove={move} idx={i} total={order.length} />
          ))}
        </div>
      )}
      {order.length === 0 && <p className="muted" style={{ fontSize: 11.5, margin: "8px 0 0" }}>아직 추가한 항목이 없어요. 위에서 새 항목을 만들어 보세요.</p>}
    </div>
  );
}

function ReportPanel({ weekly, monthly }: { weekly: WeeklyReport | null; monthly: MonthlyReport | null }) {
  const barColor = (pct: number) => (pct >= 100 ? "var(--ok,#16a34a)" : pct >= 60 ? "var(--accent)" : pct >= 30 ? "var(--warn,#f59e0b)" : "var(--owner,#dc2626)");

  const exportCsv = () => {
    const src = monthly ?? weekly;
    if (!src) return;
    const rows = [["날짜", "요일", "완료수", "전체", "달성률(%)"], ...src.dayStats.map((d) => [d.date, d.label, String(d.done), String(src.need), String(d.pct)])];
    const csv = "﻿" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `daily-checklist-${(monthly ? "30d" : "7d")}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div style={{ marginTop: 12, padding: 14, border: "1px dashed var(--line-2)", borderRadius: 10, background: "var(--surface-2, var(--surface))" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800 }}>📊 달성 리포트</div>
        <button className="btn sm" onClick={exportCsv}>⬇ CSV 내보내기</button>
      </div>

      {weekly && <>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-2)" }}>최근 7일</div>
        <div className="muted" style={{ fontSize: 12 }}>평균 <b style={{ color: barColor(weekly.avgPct) }}>{weekly.avgPct}%</b> · 완벽한 날 {weekly.dayStats.filter((d) => d.pct >= 100).length}일</div>
      </div>
      <WeekBars dayStats={weekly.dayStats} need={weekly.need} barColor={barColor} />
      </>}

      {monthly && (
        <div style={{ marginTop: weekly ? 14 : 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-2)" }}>최근 30일</div>
            <div className="muted" style={{ fontSize: 12 }}>평균 <b style={{ color: barColor(monthly.avgPct) }}>{monthly.avgPct}%</b> · 완벽한 날 {monthly.perfectDays}일</div>
          </div>
          {/* 30일 미니 히트 막대 */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 54 }}>
            {monthly.dayStats.map((d) => {
              const h = Math.round((d.pct / 100) * 46) + 2;
              return <div key={d.date} title={`${d.date} · ${d.done}/${monthly.need} (${d.pct}%)`} style={{ flex: 1, minWidth: 0, height: h, background: barColor(d.pct), borderRadius: 2 }} />;
            })}
          </div>
        </div>
      )}

      {/* 자주 놓친 항목 */}
      {weekly && (weekly.missed.length > 0 ? (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--owner,#b45309)", marginBottom: 6 }}>⚠️ 자주 놓친 항목 (최근 7일)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {weekly.missed.map((m) => (
              <div key={m.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <span className="badge" style={{ fontSize: 10.5, flexShrink: 0, background: m.done === 0 ? "var(--owner-bg,#fdecea)" : "var(--warn-bg,#fdf3e2)", color: m.done === 0 ? "var(--owner,#b3261e)" : "var(--warn,#b26a00)" }}>{m.done}/7일</span>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>👏 이번 주 놓친 항목이 거의 없어요. 아주 좋습니다!</p>
      ))}
    </div>
  );
}

function WeekBars({ dayStats, need, barColor }: { dayStats: WeeklyReport["dayStats"]; need: number; barColor: (pct: number) => string }) {
  const maxDone = Math.max(need, ...dayStats.map((d) => d.done), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 92 }}>
      {dayStats.map((d) => {
        const h = Math.round((d.done / maxDone) * 74) + 2;
        return (
          <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 0 }}>
            <span style={{ fontSize: 10, color: "var(--ink-2)" }}>{d.pct}%</span>
            <div title={`${d.date} · ${d.done}/${need}`} style={{ width: "100%", maxWidth: 34, height: h, background: barColor(d.pct), borderRadius: "4px 4px 0 0", transition: "height .2s" }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)" }}>{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

const editInput: React.CSSProperties = {
  padding: "7px 9px", border: "1px solid var(--line-2)", borderRadius: 8,
  background: "var(--surface)", color: "var(--ink)", fontSize: 13,
};

function ItemEditor({ mode, item, groupOptions, members, onDone, start, onMove, idx = 0, total = 1 }: {
  mode: "add" | "edit"; item?: CustomDailyItem; groupOptions: string[]; members: string[];
  onDone: () => void; start: (fn: () => Promise<void>) => void;
  onMove?: (id: string, dir: "up" | "down") => void; idx?: number; total?: number;
}) {
  const [open, setOpen] = useState(mode === "add");
  const [label, setLabel] = useState(item?.label ?? "");
  const [group, setGroup] = useState(item?.group ?? (groupOptions[0] ?? "내 항목"));
  const [href, setHref] = useState(item?.href ?? "");
  const [note, setNote] = useState(item?.note ?? "");
  const [weekdays, setWeekdays] = useState<number[]>(item?.weekdays ?? []);
  const [assignee, setAssignee] = useState(item?.assignee ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reset = () => { setLabel(item?.label ?? ""); setGroup(item?.group ?? (groupOptions[0] ?? "내 항목")); setHref(item?.href ?? ""); setNote(item?.note ?? ""); setWeekdays(item?.weekdays ?? []); setAssignee(item?.assignee ?? ""); setErr(null); };

  const toggleDay = (d: number) => setWeekdays((w) => w.includes(d) ? w.filter((x) => x !== d) : [...w, d].sort());

  const submit = () => {
    if (!label.trim()) { setErr("항목 내용을 입력하세요."); return; }
    setBusy(true); setErr(null);
    start(async () => {
      const payload = { group, label, href, note, weekdays, assignee };
      const res = mode === "add" ? await addDailyItem(payload) : await updateDailyItem(item!.id, payload);
      setBusy(false);
      if (!res.ok) { setErr(res.error ?? "저장 실패"); return; }
      if (mode === "add") { setLabel(""); setHref(""); setNote(""); setWeekdays([]); setAssignee(""); }
      onDone();
    });
  };

  const remove = () => {
    if (!confirm("이 항목을 삭제할까요?")) return;
    setBusy(true);
    start(async () => { const res = await deleteDailyItem(item!.id); setBusy(false); if (res.ok) onDone(); else setErr(res.error ?? "삭제 실패"); });
  };

  // 편집 모드에서 접혀 있을 때는 한 줄 요약.
  if (mode === "edit" && !open) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 8 }}>
        {onMove && (
          <span style={{ display: "flex", flexDirection: "column", gap: 1, flexShrink: 0 }}>
            <button className="btn sm" title="위로" onClick={() => onMove(item!.id, "up")} disabled={idx === 0} style={{ padding: "0 5px", lineHeight: 1.3, fontSize: 10 }}>▲</button>
            <button className="btn sm" title="아래로" onClick={() => onMove(item!.id, "down")} disabled={idx === total - 1} style={{ padding: "0 5px", lineHeight: 1.3, fontSize: 10 }}>▼</button>
          </span>
        )}
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <span className="muted" style={{ fontSize: 11 }}>{item!.group}</span> · {item!.label}
          {item!.assignee && <span className="muted" style={{ fontSize: 11 }}> · 👤{item!.assignee}</span>}
          {item!.weekdays && item!.weekdays.length > 0 && <span className="muted" style={{ fontSize: 11 }}> · {item!.weekdays.map((d) => WEEKDAY_LABELS[d]).join("")}</span>}
        </span>
        <button className="btn sm" onClick={() => { reset(); setOpen(true); }}>수정</button>
        <button className="btn sm" onClick={remove} disabled={busy} style={{ color: "var(--owner)" }}>삭제</button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: mode === "add" ? 0 : "8px", border: mode === "add" ? "none" : "1px solid var(--line)", borderRadius: 8 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="항목 내용(예: 인스타 DM 확인)" style={{ ...editInput, flex: "1 1 180px" }} />
        <select value={group} onChange={(e) => setGroup(e.target.value)} style={{ ...editInput }}>
          {groupOptions.map((g) => <option key={g} value={g}>{g}</option>)}
          {!groupOptions.includes("내 항목") && <option value="내 항목">내 항목</option>}
        </select>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <input value={href} onChange={(e) => setHref(e.target.value)} placeholder="이동 링크(선택, 예: /todos)" style={{ ...editInput, flex: "1 1 140px" }} />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="메모(선택)" style={{ ...editInput, flex: "1 1 140px" }} />
        <select value={assignee} onChange={(e) => setAssignee(e.target.value)} style={{ ...editInput }} title="담당자">
          <option value="">담당자 없음(공용)</option>
          {members.map((m) => <option key={m} value={m}>{m}</option>)}
          {assignee && !members.includes(assignee) && <option value={assignee}>{assignee}</option>}
        </select>
      </div>
      <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
        <span className="muted" style={{ fontSize: 11 }}>반복:</span>
        {WEEKDAY_LABELS.map((lbl, d) => (
          <button key={d} type="button" onClick={() => toggleDay(d)} className="btn sm"
            style={weekdays.includes(d) ? { background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)", padding: "2px 8px" } : { padding: "2px 8px" }}>{lbl}</button>
        ))}
        <span className="muted" style={{ fontSize: 11 }}>{weekdays.length === 0 ? "(매일)" : ""}</span>
      </div>
      {err && <div style={{ color: "var(--owner)", fontSize: 11.5 }}>{err}</div>}
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn sm primary" onClick={submit} disabled={busy || !label.trim()}>{busy ? "저장 중…" : mode === "add" ? "+ 추가" : "저장"}</button>
        {mode === "edit" && <button className="btn sm" onClick={() => setOpen(false)} disabled={busy}>취소</button>}
      </div>
    </div>
  );
}
