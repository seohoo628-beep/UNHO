import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { computeLedger, DEDUCT, LeaveMember, LeaveUsage } from "@/lib/leave";
import LeaveMemberForm from "@/components/LeaveMemberForm";
import LeaveMemberRow from "@/components/LeaveMemberRow";
import { LeaveUsageForm, DeleteUsageButton } from "@/components/LeaveUsageForm";
import LeaveApproveButtons from "@/components/LeaveApproveButtons";
import { DbSetupNotice } from "@/components/DbSetupNotice";

const STATUS_SQL = `alter table public.leave_usages
  add column if not exists status text not null default 'approved'
  check (status in ('pending','approved','rejected'));
alter table public.leave_usages add column if not exists requested_by uuid references public.users(id) on delete set null;
alter table public.leave_usages add column if not exists decided_by uuid references public.users(id) on delete set null;
alter table public.leave_usages add column if not exists decided_at timestamptz;`;

export const dynamic = "force-dynamic";

const LEAVE_SQL = `create table if not exists public.leave_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  join_date date not null,
  carryover numeric not null default 0,
  note text,
  active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.leave_usages (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.leave_members(id) on delete cascade,
  use_date date not null,
  type text not null default '연차' check (type in ('연차','반차(오전)','반차(오후)')),
  approver text,
  note text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.leave_members enable row level security;
alter table public.leave_usages  enable row level security;
drop policy if exists leave_members_all on public.leave_members;
create policy leave_members_all on public.leave_members for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));
drop policy if exists leave_usages_all on public.leave_usages;
create policy leave_usages_all on public.leave_usages for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));`;

const MONTHS = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];
const n1 = (x: number) => (Number.isInteger(x) ? `${x}` : x.toFixed(1));

export default async function LeavePage({
  searchParams,
}: {
  searchParams: { year?: string; asof?: string };
}) {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");
  const supabase = createSupabaseServerClient();

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
  const curYear = +today.slice(0, 4);
  const year = searchParams.year ? +searchParams.year : curYear;
  const asof = searchParams.asof || today;
  const years = [curYear - 2, curYear - 1, curYear, curYear + 1];

  const membersRes = await supabase
    .from("leave_members")
    .select("id, name, join_date, carryover, note")
    .eq("active", true)
    .order("join_date");

  if (membersRes.error) {
    return (
      <div>
        <div className="page-head">
          <div>
            <h1>연차관리</h1>
            <p>근로기준법 제60조 기준 자동 계산 대장.</p>
          </div>
        </div>
        <DbSetupNotice title="연차관리" sql={LEAVE_SQL} />
      </div>
    );
  }

  // status 컬럼 유무에 관대하게: 있으면 함께, 없으면 옛 스키마로 조회.
  const selWith = "id, member_id, use_date, type, approver, note, status, leave_members(name)";
  const selBase = "id, member_id, use_date, type, approver, note, leave_members(name)";
  let statusMissing = false;
  let uRes = await supabase
    .from("leave_usages")
    .select(selWith)
    .gte("use_date", `${year}-01-01`)
    .lte("use_date", `${year}-12-31`)
    .order("use_date", { ascending: false });
  if (uRes.error) {
    statusMissing = true;
    uRes = (await supabase
      .from("leave_usages")
      .select(selBase)
      .gte("use_date", `${year}-01-01`)
      .lte("use_date", `${year}-12-31`)
      .order("use_date", { ascending: false })) as typeof uRes;
  }

  const members = (membersRes.data ?? []) as LeaveMember[];
  const usages = (uRes.data ?? []) as unknown as (LeaveUsage & {
    approver: string | null;
    note: string | null;
    status?: string | null;
    leave_members: { name: string } | null;
  })[];

  const isApproved = (u: { status?: string | null }) => (u.status ?? "approved") === "approved";
  const pendingUsages = usages.filter((u) => (u.status ?? "approved") === "pending");
  const decidedUsages = usages.filter((u) => (u.status ?? "approved") !== "pending");
  const isOwner = user.role === "owner";

  // 잔여 계산은 '승인된' 사용만 차감.
  const ledger = computeLedger(members, usages.filter(isApproved) as LeaveUsage[], year, asof);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>연차관리</h1>
          <p>근로기준법 제60조 기준 자동 계산 — 입사연도는 월 개근 1일(첫해 최대 11일), 만 1년+는 15일+근속가산(한도 25일).</p>
        </div>
        <LeaveMemberForm />
      </div>

      {/* 기준 */}
      <form method="get" className="card" style={{ marginBottom: 14 }}>
        <div className="row" style={{ alignItems: "end" }}>
          <label className="field" style={{ marginBottom: 0 }}>
            <span>기준연도</span>
            <select name="year" defaultValue={String(year)}>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
          <label className="field" style={{ marginBottom: 0 }}>
            <span>기준일 (부여 계산 기준)</span>
            <input type="date" name="asof" defaultValue={asof} />
          </label>
          <div style={{ flex: "0 0 auto" }}>
            <button className="btn">적용</button>
          </div>
        </div>
      </form>

      {/* 구성원 관리 (입력) */}
      <div className="section-title">직원 (입사일·이월 입력)</div>
      <div className="card" style={{ padding: 0 }}>
        {members.length === 0 ? (
          <div className="empty">등록된 직원이 없습니다. &ldquo;직원 추가&rdquo;로 입사일을 등록하세요.</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>성명</th>
                <th>입사일</th>
                <th style={{ textAlign: "right" }}>이월</th>
                <th>비고</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <LeaveMemberRow key={m.id} member={m} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 연차 대장 (자동 계산) */}
      <div className="section-title">연차 대장 ({year}년 · 기준일 {asof})</div>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        {ledger.length === 0 ? (
          <div className="empty">직원을 추가하면 자동으로 계산됩니다.</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ position: "sticky", left: 0, background: "#fafbfc" }}>성명</th>
                <th>근속</th>
                <th>부여 구분</th>
                <th style={{ textAlign: "right" }}>부여</th>
                <th style={{ textAlign: "right" }}>이월</th>
                <th style={{ textAlign: "right" }}>총보유</th>
                {MONTHS.map((m) => (
                  <th key={m} style={{ textAlign: "right" }}>{m}</th>
                ))}
                <th style={{ textAlign: "right" }}>사용</th>
                <th style={{ textAlign: "right" }}>잔여</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((r) => (
                <tr key={r.id}>
                  <td style={{ position: "sticky", left: 0, background: "#fff", whiteSpace: "nowrap" }}>{r.name}</td>
                  <td>{r.tenure}</td>
                  <td style={{ whiteSpace: "nowrap", fontSize: 12 }}>{r.kind}</td>
                  <td style={{ textAlign: "right" }}>{n1(r.granted)}</td>
                  <td style={{ textAlign: "right" }}>{n1(r.carryover)}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>{n1(r.held)}</td>
                  {r.monthly.map((v, i) => (
                    <td
                      key={i}
                      style={{
                        textAlign: "right",
                        color: v === 0 ? "var(--ink-3)" : v >= 2 ? "var(--owner)" : "var(--ink)",
                        fontWeight: v >= 2 ? 700 : 400,
                      }}
                    >
                      {v === 0 ? "·" : n1(v)}
                    </td>
                  ))}
                  <td style={{ textAlign: "right" }}>{n1(r.used)}</td>
                  <td style={{ textAlign: "right", fontWeight: 700, color: r.remaining < 0 ? "var(--owner)" : "var(--ok)" }}>
                    {n1(r.remaining)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        월별 사용에서 <b>한 달에 2일 이상</b>은 빨간색으로 표시됩니다(분산 사용 원칙 모니터링). 반차 2회 = 연차 1일.
      </p>

      {statusMissing && (
        <div style={{ marginTop: 18 }}>
          <DbSetupNotice title="연차 승인 기능 — DB 한 줄 실행" sql={STATUS_SQL} />
        </div>
      )}

      {/* 승인 대기(대표가 승인) */}
      {!statusMissing && (
        <>
          <div className="section-title">🔔 연차 신청 승인 대기 ({pendingUsages.length}건)</div>
          <div className="card" style={{ padding: 0, marginBottom: 4 }}>
            {pendingUsages.length === 0 ? (
              <div className="empty">승인 대기 중인 연차 신청이 없습니다.</div>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>신청일자</th>
                    <th>성명</th>
                    <th>구분</th>
                    <th style={{ textAlign: "right" }}>차감</th>
                    <th>비고</th>
                    <th>처리</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingUsages.map((u) => (
                    <tr key={u.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{u.use_date}</td>
                      <td>{u.leave_members?.name ?? "-"}</td>
                      <td>{u.type}</td>
                      <td style={{ textAlign: "right" }}>{n1(DEDUCT[u.type] ?? 1)}</td>
                      <td>{u.note ?? "-"}</td>
                      <td>
                        {isOwner ? (
                          <LeaveApproveButtons id={u.id} />
                        ) : (
                          <span className="badge warn">승인 대기</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>
            직원이 연차를 신청하면 여기로 올라오고, <b>대표가 승인해야 잔여에서 차감</b>됩니다. 대표가 직접 등록한 건은 바로 승인 처리됩니다.
          </p>
        </>
      )}

      {/* 사용 내역 */}
      <div className="section-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>사용 내역 ({year}년 · {decidedUsages.length}건)</span>
        <LeaveUsageForm members={members.map((m) => ({ id: m.id, name: m.name }))} />
      </div>
      <div className="card" style={{ padding: 0 }}>
        {decidedUsages.length === 0 ? (
          <div className="empty">사용 기록이 없습니다.</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>사용일자</th>
                <th>성명</th>
                <th>구분</th>
                <th style={{ textAlign: "right" }}>차감</th>
                <th>상태</th>
                <th>승인자</th>
                <th>비고</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {decidedUsages.map((u) => {
                const st = u.status ?? "approved";
                const rejected = st === "rejected";
                return (
                  <tr key={u.id} style={rejected ? { opacity: 0.55 } : undefined}>
                    <td style={{ whiteSpace: "nowrap" }}>{u.use_date}</td>
                    <td>{u.leave_members?.name ?? "-"}</td>
                    <td>{u.type}</td>
                    <td style={{ textAlign: "right" }}>{rejected ? "-" : n1(DEDUCT[u.type] ?? 1)}</td>
                    <td>
                      {rejected ? <span className="badge owner">반려</span> : <span className="badge ok">승인</span>}
                    </td>
                    <td>{u.approver ?? "-"}</td>
                    <td>{u.note ?? "-"}</td>
                    <td><DeleteUsageButton id={u.id} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
