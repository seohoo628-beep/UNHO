"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DbSetupNotice } from "@/components/DbSetupNotice";
import CopyForKakaoButton from "@/components/CopyForKakaoButton";
import NoticeBoard from "@/components/NoticeBoard";
import { incentivePay } from "@/lib/money";
import type { Notice } from "../todos/actions";

export type WorklogNotice = { items: Notice[]; canManage: boolean; tableMissing?: boolean; loadError?: string };
import {
  createLog,
  updateLog,
  deleteLog,
  saveIncentive,
  deleteIncentive,
  type LogInput,
  type IncentiveInput,
} from "./actions";

export interface Log extends LogInput {
  id: string;
}
export interface Incentive extends IncentiveInput {
  id: string;
}

const SETUP_SQL = `create table if not exists public.manager_logs (
  id uuid primary key default gen_random_uuid(),
  log_date date not null default current_date,
  category text not null, task text not null,
  status text not null default '예정', note text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists manager_logs_date_idx on public.manager_logs(log_date desc);
create table if not exists public.manager_incentives (
  id uuid primary key default gen_random_uuid(),
  month text not null unique,
  gonggu_count integer not null default 0,
  gonggu_sales bigint not null default 0,
  promo_sales bigint not null default 0,
  rate_pct numeric not null default 5, note text,
  updated_at timestamptz not null default now()
);
alter table public.manager_logs enable row level security;
alter table public.manager_incentives enable row level security;
drop policy if exists manager_logs_all on public.manager_logs;
create policy manager_logs_all on public.manager_logs for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));
drop policy if exists manager_incentives_all on public.manager_incentives;
create policy manager_incentives_all on public.manager_incentives for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));`;

const CATEGORIES = ["경리·회계·손익", "물류", "CS", "거래처·프로모션", "툴·AI", "외국어", "행사·박람회", "기타"];
const STATUSES = ["예정", "진행", "완료", "보류"];

const won = (n: number) => (n ? n.toLocaleString("ko-KR") : "-");
// 카톡 복사용 한 줄.
const logLine = (l: Log) => `· ${l.category} | ${l.task} (${l.status})${l.note ? ` · ${l.note}` : ""}`;
const dayCopyText = (d: string, rows: Log[]) => `📋 경영지원 업무일지 · ${d}\n──────────\n` + rows.map(logLine).join("\n");
const statusColor = (s: string) =>
  s === "완료" ? "var(--ok, #16a34a)" : s === "진행" ? "var(--accent)" : s === "보류" ? "var(--owner, #b91c1c)" : "var(--ink-2)";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  border: "1px solid var(--line-2)",
  borderRadius: "var(--radius)",
  background: "var(--surface)",
  color: "var(--ink)",
};

export default function ManagerLogClient({
  logs,
  incentives,
  dbReady,
  today,
  notice,
}: {
  logs: Log[];
  incentives: Incentive[];
  dbReady: boolean;
  today: string;
  notice?: WorklogNotice;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [date, setDate] = useState(today);
  const [err, setErr] = useState("");
  const [logModal, setLogModal] = useState<Log | null | undefined>(undefined); // undefined=닫힘
  const [incModal, setIncModal] = useState<Incentive | null | undefined>(undefined);
  const [view, setView] = useState<"day" | "week" | "month">("day");

  const run = (p: Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await p;
      if (!r.ok) setErr(r.error ?? "오류가 발생했습니다.");
      else {
        setErr("");
        router.refresh();
      }
    });

  // 선택 날짜(date)가 속한 주(월~일) 범위
  const [weekStart, weekEnd] = useMemo(() => {
    const d = new Date(date + "T00:00:00");
    const dow = (d.getDay() + 6) % 7; // 월=0
    const s = new Date(d); s.setDate(d.getDate() - dow);
    const e = new Date(s); e.setDate(s.getDate() + 6);
    const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
    return [iso(s), iso(e)];
  }, [date]);

  // 보기 모드(일/주/월)에 따른 업무일지
  const viewLogs = useMemo(() => {
    let arr: Log[];
    if (view === "month") {
      const m = date.slice(0, 7);
      arr = logs.filter((l) => (l.logDate ?? "").slice(0, 7) === m);
    } else if (view === "week") {
      arr = logs.filter((l) => l.logDate >= weekStart && l.logDate <= weekEnd);
    } else {
      arr = logs.filter((l) => l.logDate === date);
    }
    return view === "day" ? arr : [...arr].sort((a, b) => (a.logDate < b.logDate ? 1 : -1));
  }, [logs, date, view, weekStart, weekEnd]);

  const rangeLabel =
    view === "month" ? date.slice(0, 7) + " 한 달" : view === "week" ? `${weekStart.slice(5)}~${weekEnd.slice(5)}` : date;
  // 기간 보기에서 날짜별로 묶기(일자별 복사용).
  const dayGroups = useMemo(() => {
    const m = new Map<string, Log[]>();
    for (const l of viewLogs) (m.get(l.logDate) ?? m.set(l.logDate, []).get(l.logDate)!).push(l);
    return [...m.entries()];
  }, [viewLogs]);
  const recentDates = useMemo(() => {
    const set = new Map<string, number>();
    logs.forEach((l) => set.set(l.logDate, (set.get(l.logDate) ?? 0) + 1));
    return Array.from(set.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 10);
  }, [logs]);

  if (!dbReady) {
    return (
      <div>
        <div className="page-head">
          <h1 style={{ margin: 0 }}>📓 경영지원매니저 업무일지</h1>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>경리·물류·CS·거래처 통합 운영직 일일 업무 기록.</p>
        </div>
        <DbSetupNotice title="경영지원매니저 업무일지" sql={SETUP_SQL} />
      </div>
    );
  }

  return (
    <div>
      <div className="page-head" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>📓 경영지원매니저 업무일지</h1>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
            경리·물류·CS·거래처 통합 운영직 · 일일 기록 {logs.length}건 · <span style={{ color: "var(--ok, #16a34a)" }}>DB 공유</span>
            {pending ? " · 저장 중…" : ""}
          </p>
        </div>
      </div>

      {notice && (
        <NoticeBoard
          scope="worklog"
          initial={notice.items}
          canManage={notice.canManage}
          tableMissing={notice.tableMissing}
          loadError={notice.loadError}
        />
      )}

      {err && <div className="card" style={{ padding: 10, marginBottom: 12, color: "var(--owner, #b91c1c)", background: "var(--owner-bg, #fef2f2)" }}>{err}</div>}

      {/* ── 일일 업무일지 ── */}
      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <strong style={{ fontSize: 15 }}>🗓 업무일지</strong>
            {/* 일별 / 주별 / 월별 전환 */}
            <div style={{ display: "inline-flex", border: "1px solid var(--line-2)", borderRadius: "var(--radius)", overflow: "hidden" }}>
              {([["day", "일별"], ["week", "주별"], ["month", "월별"]] as const).map(([v, lbl]) => (
                <button
                  key={v}
                  className="btn"
                  onClick={() => setView(v)}
                  style={{
                    border: "none",
                    borderRadius: 0,
                    padding: "6px 12px",
                    fontSize: 13,
                    background: view === v ? "var(--accent)" : "var(--surface)",
                    color: view === v ? "var(--accent-ink)" : "var(--ink-2)",
                  }}
                >
                  {lbl}
                </button>
              ))}
            </div>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "6px 9px" }} />
            <span className="muted" style={{ fontSize: 12 }}>
              {view === "day" ? (date === today ? "오늘" : "") : `${rangeLabel} · ${viewLogs.length}건`}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {view === "day" && viewLogs.length > 0 && (
              <>
                <CopyForKakaoButton className="btn" label={`📋 복사 (${viewLogs.length})`} text={() => dayCopyText(date, viewLogs)} />
                <CopyForKakaoButton className="btn" share label="📤 카톡 발송" text={() => dayCopyText(date, viewLogs)} />
              </>
            )}
            <button
              className="btn"
              onClick={() => setLogModal(null)}
              style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}
            >
              + 업무 기록
            </button>
          </div>
        </div>

        {recentDates.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {recentDates.map(([d, n]) => (
              <button
                key={d}
                className="btn"
                onClick={() => setDate(d)}
                style={{ padding: "3px 9px", fontSize: 12, ...(d === date ? { background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" } : {}) }}
              >
                {d.slice(5)} · {n}
              </button>
            ))}
          </div>
        )}

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 640 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--ink-2)" }}>
                {view !== "day" && <th style={th}>날짜</th>}
                <th style={th}>구분</th>
                <th style={th}>업무 내용</th>
                <th style={th}>상태</th>
                <th style={th}>비고</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {viewLogs.length === 0 && (
                <tr><td colSpan={view === "day" ? 5 : 6} className="muted" style={{ padding: 22, textAlign: "center" }}>
                  {view === "day" ? "이 날짜의 기록이 없습니다. ‘+ 업무 기록’으로 직접 입력하세요." : "이 기간에 입력된 업무일지가 없습니다."}
                </td></tr>
              )}
              {dayGroups.map(([d, rows]) => (
                <Fragment key={d}>
                  {view !== "day" && (
                    <tr style={{ background: "var(--surface-2, #f6f7f9)" }}>
                      <td colSpan={6} style={{ ...td, fontWeight: 800 }}>
                        🗓 {d} <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>· {rows.length}건</span>
                        <CopyForKakaoButton className="btn sm" style={{ marginLeft: 8, padding: "1px 8px", fontSize: 11 }} label="📋 복사" text={() => dayCopyText(d, rows)} />
                        <CopyForKakaoButton className="btn sm" share style={{ marginLeft: 4, padding: "1px 8px", fontSize: 11 }} label="📤 발송" text={() => dayCopyText(d, rows)} />
                      </td>
                    </tr>
                  )}
                  {rows.map((l) => (
                    <tr key={l.id} style={{ borderTop: "1px solid var(--line)" }}>
                      {view !== "day" && <td style={{ ...td, whiteSpace: "nowrap", color: "var(--ink-2)", fontVariantNumeric: "tabular-nums" }}>{l.logDate.slice(5)}</td>}
                      <td style={{ ...td, whiteSpace: "nowrap", color: "var(--ink-2)" }}>{l.category}</td>
                      <td style={{ ...td, fontWeight: 500 }}>{l.task}</td>
                      <td style={{ ...td, whiteSpace: "nowrap", color: statusColor(l.status), fontWeight: 700 }}>{l.status}</td>
                      <td style={{ ...td, color: "var(--ink-2)", maxWidth: 220 }}>{l.note || "-"}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        <button className="btn" style={smBtn} onClick={() => setLogModal(l)}>수정</button>{" "}
                        <button className="btn" style={{ ...smBtn, color: "var(--owner, #b91c1c)" }} disabled={pending} onClick={() => { if (confirm("삭제할까요?")) run(deleteLog(l.id)); }}>삭제</button>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 월간 성과·인센티브 ── */}
      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
          <div>
            <strong style={{ fontSize: 15 }}>💵 월간 성과·인센티브</strong>
            <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>인센티브 = (공구+프로모션 기여매출) × 기준%</span>
          </div>
          <button className="btn" onClick={() => setIncModal(null)} style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}>+ 월 입력</button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 720 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--ink-2)" }}>
                <th style={th}>월</th>
                <th style={{ ...th, textAlign: "right" }}>공구 건수</th>
                <th style={{ ...th, textAlign: "right" }}>공구 매출</th>
                <th style={{ ...th, textAlign: "right" }}>프로모션 매출</th>
                <th style={{ ...th, textAlign: "right" }}>기여 합계</th>
                <th style={{ ...th, textAlign: "right" }}>기준%</th>
                <th style={{ ...th, textAlign: "right" }}>지급액</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {incentives.length === 0 && (
                <tr><td colSpan={8} className="muted" style={{ padding: 22, textAlign: "center" }}>입력된 월이 없습니다.</td></tr>
              )}
              {incentives.map((v) => {
                const { total, pay } = incentivePay(v.gongguSales, v.promoSales, v.ratePct);
                return (
                  <tr key={v.id} style={{ borderTop: "1px solid var(--line)" }}>
                    <td style={{ ...td, fontWeight: 600, whiteSpace: "nowrap" }}>{v.month}</td>
                    <td style={{ ...td, textAlign: "right" }}>{v.gongguCount || "-"}</td>
                    <td style={{ ...td, textAlign: "right" }}>{won(v.gongguSales)}</td>
                    <td style={{ ...td, textAlign: "right" }}>{won(v.promoSales)}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{won(total)}</td>
                    <td style={{ ...td, textAlign: "right" }}>{v.ratePct}%</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 700, color: "var(--accent)" }}>{won(pay)}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      <button className="btn" style={smBtn} onClick={() => setIncModal(v)}>수정</button>{" "}
                      <button className="btn" style={{ ...smBtn, color: "var(--owner, #b91c1c)" }} disabled={pending} onClick={() => { if (confirm("삭제할까요?")) run(deleteIncentive(v.id)); }}>삭제</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {logModal !== undefined && (
        <LogModal
          initial={logModal}
          date={date}
          pending={pending}
          onClose={() => setLogModal(undefined)}
          onSave={(inp, id) => {
            run(id ? updateLog(id, inp) : createLog(inp));
            setLogModal(undefined);
          }}
        />
      )}
      {incModal !== undefined && (
        <IncentiveModal
          initial={incModal}
          pending={pending}
          onClose={() => setIncModal(undefined)}
          onSave={(inp) => {
            run(saveIncentive(inp));
            setIncModal(undefined);
          }}
        />
      )}
    </div>
  );
}

function LogModal({
  initial,
  date,
  pending,
  onClose,
  onSave,
}: {
  initial: Log | null;
  date: string;
  pending: boolean;
  onClose: () => void;
  onSave: (inp: LogInput, id?: string) => void;
}) {
  const [f, setF] = useState<LogInput>(
    initial ?? { logDate: date, category: CATEGORIES[0], task: "", status: "예정", note: "" }
  );
  const set = (k: keyof LogInput, v: any) => setF((p) => ({ ...p, [k]: v }));
  return (
    <div onMouseDown={onClose} style={backdrop}>
      <div className="card" onMouseDown={(e) => e.stopPropagation()} style={{ padding: 20, width: "100%", maxWidth: 460 }}>
        <h3 style={{ marginTop: 0 }}>{initial ? "업무 수정" : "업무 기록"}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="날짜"><input type="date" style={inputStyle} value={f.logDate} onChange={(e) => set("logDate", e.target.value)} /></Field>
          <Field label="구분">
            <select style={inputStyle} value={f.category} onChange={(e) => set("category", e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="업무 내용"><input style={inputStyle} value={f.task} onChange={(e) => set("task", e.target.value)} placeholder="예: 스마트스토어 리뷰 12건 답글" /></Field>
          </div>
          <Field label="상태">
            <select style={inputStyle} value={f.status} onChange={(e) => set("status", e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <div />
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="비고"><textarea rows={2} style={{ ...inputStyle, resize: "vertical" }} value={f.note} onChange={(e) => set("note", e.target.value)} /></Field>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn" disabled={!f.task.trim() || pending} onClick={() => onSave(f, initial?.id)} style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}>저장</button>
        </div>
      </div>
    </div>
  );
}

function IncentiveModal({
  initial,
  pending,
  onClose,
  onSave,
}: {
  initial: Incentive | null;
  pending: boolean;
  onClose: () => void;
  onSave: (inp: IncentiveInput) => void;
}) {
  const [f, setF] = useState<IncentiveInput>(
    initial ?? { month: new Date().toISOString().slice(0, 7), gongguCount: 0, gongguSales: 0, promoSales: 0, ratePct: 5, note: "" }
  );
  const set = (k: keyof IncentiveInput, v: any) => setF((p) => ({ ...p, [k]: v }));
  const total = (Number(f.gongguSales) || 0) + (Number(f.promoSales) || 0);
  const pay = Math.round((total * (Number(f.ratePct) || 0)) / 100);
  return (
    <div onMouseDown={onClose} style={backdrop}>
      <div className="card" onMouseDown={(e) => e.stopPropagation()} style={{ padding: 20, width: "100%", maxWidth: 460 }}>
        <h3 style={{ marginTop: 0 }}>{initial ? "월 성과 수정" : "월 성과 입력"}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="월 (YYYY-MM)"><input style={inputStyle} value={f.month} onChange={(e) => set("month", e.target.value)} placeholder="2026-08" disabled={!!initial} /></Field>
          <Field label="공구 성사 건수"><input type="number" style={inputStyle} value={f.gongguCount} onChange={(e) => set("gongguCount", Number(e.target.value))} /></Field>
          <Field label="공구 기여매출(원)"><input type="number" style={inputStyle} value={f.gongguSales} onChange={(e) => set("gongguSales", Number(e.target.value))} /></Field>
          <Field label="프로모션 기여매출(원)"><input type="number" style={inputStyle} value={f.promoSales} onChange={(e) => set("promoSales", Number(e.target.value))} /></Field>
          <Field label="인센티브 기준(%)"><input type="number" step="0.1" style={inputStyle} value={f.ratePct} onChange={(e) => set("ratePct", Number(e.target.value))} /></Field>
          <div />
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="비고"><input style={inputStyle} value={f.note} onChange={(e) => set("note", e.target.value)} /></Field>
          </div>
        </div>
        <div className="muted" style={{ fontSize: 13, marginTop: 12 }}>
          기여 합계 <b>{won(total)}원</b> × {f.ratePct || 0}% = 예상 지급액 <b style={{ color: "var(--accent)" }}>{won(pay)}원</b>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn" disabled={!/^\d{4}-\d{2}$/.test(f.month) || pending} onClick={() => onSave(f)} style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}>저장</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginBottom: 4, fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

const th: React.CSSProperties = { padding: "9px 12px", fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.03em", fontWeight: 700 };
const td: React.CSSProperties = { padding: "9px 12px", verticalAlign: "top" };
const smBtn: React.CSSProperties = { padding: "3px 9px", fontSize: 12 };
const backdrop: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(16,20,24,0.5)", display: "grid", placeItems: "center", zIndex: 100, padding: 20 };
