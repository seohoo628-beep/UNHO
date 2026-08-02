"use client";

import { useState } from "react";
import { useData, inScope } from "@fnb/lib/store";
import { Card, Badge, Stat, Modal, Field } from "@fnb/components/ui";
import { storeName, STORES } from "@fnb/lib/stores";
import { won, manwon, uid, today, pct, weekOf, weekdayKo, isWeekend, shiftHours, shortDate, addDays } from "@fnb/lib/format";
import type { Staff, StoreId, EmployStatus, ShiftEntry } from "@fnb/lib/types";

const STATUS: Record<EmployStatus, [string, string]> = {
  active: ["green", "재직"],
  leave: ["amber", "휴직"],
  resigned: ["gray", "퇴사"],
};

// 자주 쓰는 근무 시간대 프리셋(빠른 입력용)
const SHIFT_PRESETS: { label: string; start: string; end: string }[] = [
  { label: "오픈", start: "10:00", end: "15:00" },
  { label: "미들", start: "15:00", end: "22:00" },
  { label: "마감", start: "17:00", end: "23:00" },
  { label: "종일", start: "10:00", end: "22:00" },
];

type ShiftCtx = { staffId: string; storeId: StoreId; date: string; shift?: ShiftEntry; name: string };

export default function StaffPage() {
  const { data, scope, update, ready } = useData();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Staff | null>(null);
  const [anchor, setAnchor] = useState(today()); // 근무표 기준 주
  const [shiftCtx, setShiftCtx] = useState<ShiftCtx | null>(null);
  if (!ready) return null;

  const staff = inScope(data.staff, scope);
  const active = staff.filter((s) => s.status === "active");

  // 월 인건비 추정: 월급은 그대로, 시급은 209시간(주 40h) 가정
  const monthlyLabor = active.reduce(
    (sum, s) => sum + (s.wageType === "월급" ? s.wage : s.wage * 209),
    0
  );

  // 인건비율 = 월 인건비 / 최근월 매출(P&L 기준)
  const pnlRows = inScope(data.pnl, scope);
  const latestMonth = [...pnlRows].sort((a, b) => b.month.localeCompare(a.month))[0]?.month;
  const monthRevenue = pnlRows.filter((p) => p.month === latestMonth).reduce((s, p) => s + p.revenue, 0);
  const laborRate = monthRevenue ? (monthlyLabor / monthRevenue) * 100 : 0;

  // 주간 근무 캘린더 (anchor 기준 주)
  const week = weekOf(anchor);
  const weekShifts = inScope(data.shifts, scope);
  const shiftFor = (staffId: string, date: string) =>
    weekShifts.find((sh) => sh.staffId === staffId && sh.date === date);
  const staffWeekHours = (staffId: string) =>
    week.reduce((h, d) => {
      const sh = shiftFor(staffId, d);
      return h + (sh ? shiftHours(sh.start, sh.end) : 0);
    }, 0);
  const dayHours = (date: string) =>
    weekShifts.filter((sh) => sh.date === date).reduce((h, sh) => h + shiftHours(sh.start, sh.end), 0);
  const rosterStaff = staff.filter((s) => s.status !== "resigned");

  const weekTotalHours = week.reduce((h, d) => h + dayHours(d), 0);
  // 주간 시급직 인건비(추정): 스케줄된 시간 × 시급
  const weekHourlyLabor = rosterStaff
    .filter((s) => s.wageType === "시급")
    .reduce((sum, s) => sum + staffWeekHours(s.id) * s.wage, 0);
  const isThisWeek = weekOf(today())[0] === week[0];

  const save = (s: Staff) =>
    update((d) => {
      const i = d.staff.findIndex((x) => x.id === s.id);
      if (i >= 0) d.staff[i] = s;
      else d.staff.unshift(s);
      return d;
    });
  const remove = (id: string) => update((d) => ({ ...d, staff: d.staff.filter((s) => s.id !== id) }));

  // ── 근무(shift) CRUD ──────────────────────────────
  const saveShift = (sh: ShiftEntry) =>
    update((d) => {
      const i = d.shifts.findIndex((x) => x.id === sh.id);
      if (i >= 0) d.shifts[i] = sh;
      else d.shifts.push(sh);
      return d;
    });
  const removeShift = (id: string) => update((d) => ({ ...d, shifts: d.shifts.filter((s) => s.id !== id) }));

  // 지난주 스케줄을 이번 주 빈 칸에 복사(기존 입력은 유지)
  const copyPrevWeek = () => {
    const prev = weekOf(addDays(anchor, -7));
    update((d) => {
      const add: ShiftEntry[] = [];
      for (const s of rosterStaff) {
        for (let i = 0; i < 7; i++) {
          const p = d.shifts.find((x) => x.staffId === s.id && x.date === prev[i]);
          const c = d.shifts.find((x) => x.staffId === s.id && x.date === week[i]);
          if (p && !c) add.push({ ...p, id: uid("sh"), date: week[i] });
        }
      }
      return { ...d, shifts: [...d.shifts, ...add] };
    });
  };
  // 이번 주(스코프 대상) 근무 전체 삭제
  const clearWeek = () => {
    if (!confirm(`${shortDate(week[0])}~${shortDate(week[6])} 주간 근무표를 모두 지울까요?`)) return;
    const ids = new Set(
      rosterStaff.flatMap((s) => week.map((d) => shiftFor(s.id, d)?.id).filter(Boolean) as string[])
    );
    update((d) => ({ ...d, shifts: d.shifts.filter((x) => !ids.has(x.id)) }));
  };

  const nameOf = (id: string) => data.staff.find((s) => s.id === id)?.name ?? "-";
  const todayShifts = inScope(data.shifts, scope).filter((s) => s.date === today());

  return (
    <>
      <div className="page-head">
        <div>
          <h1>직원관리</h1>
          <p>직원 명부·출근 스케줄표·인건비 — {storeName(scope)}</p>
        </div>
        <button
          className="btn primary"
          onClick={() => {
            setEdit(null);
            setOpen(true);
          }}
        >
          + 직원 등록
        </button>
      </div>

      <div className="grid grid-4">
        <Stat icon="👥" label="총 인원" value={`${staff.length}명`} foot={`재직 ${active.length}명`} />
        <Stat
          icon="🧑‍🍳"
          label="정직원 / 파트"
          value={`${active.filter((s) => s.employType !== "파트타임").length} / ${
            active.filter((s) => s.employType === "파트타임").length
          }`}
        />
        <Stat icon="💵" label="월 인건비(추정)" value={manwon(monthlyLabor)} foot="시급직 209h 기준" />
        <Stat
          icon="📊"
          label="인건비율"
          value={latestMonth ? pct(laborRate) : "-"}
          accent={laborRate > 27 ? "var(--amber)" : "var(--green)"}
          foot={latestMonth ? `${latestMonth} 매출 대비 · 목표 25%` : "매출 데이터 필요"}
        />
      </div>

      {/* 출근 스케줄표 (입력·수정) */}
      <div className="mt-24">
        <Card pad={false} title={
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span>🗓 출근 스케줄표</span>
            <span className="muted" style={{ fontSize: 12, fontWeight: 500 }}>
              {shortDate(week[0])} ~ {shortDate(week[6])}{isThisWeek ? " · 이번 주" : ""}
            </span>
          </div>
        } action={
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <button className="btn ghost sm" onClick={() => setAnchor(addDays(anchor, -7))} aria-label="이전 주">◀</button>
            <button className="btn ghost sm" onClick={() => setAnchor(today())}>오늘</button>
            <button className="btn ghost sm" onClick={() => setAnchor(addDays(anchor, 7))} aria-label="다음 주">▶</button>
            <button className="btn sm" onClick={copyPrevWeek} title="지난주 스케줄을 이번 주 빈 칸에 복사">지난주 복사</button>
            <button className="btn danger sm" onClick={clearWeek}>주간 비우기</button>
          </div>
        }>
          <div style={{ padding: "8px 14px 0", fontSize: 12 }} className="muted">
            표의 칸을 눌러 출근·퇴근 시간을 입력/수정하세요. 빈 칸은 휴무입니다.
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>직원</th>
                  {week.map((d) => (
                    <th key={d} className="num" style={{ textAlign: "center", color: isWeekend(d) ? "var(--brand)" : undefined }}>
                      {weekdayKo(d)}
                      <div className="muted" style={{ fontSize: 10, fontWeight: 400 }}>{shortDate(d)}</div>
                    </th>
                  ))}
                  <th className="num">주간</th>
                </tr>
              </thead>
              <tbody>
                {rosterStaff.length === 0 && (
                  <tr><td colSpan={9} className="muted" style={{ textAlign: "center", padding: 24 }}>재직 중인 직원이 없습니다. 먼저 직원을 등록하세요.</td></tr>
                )}
                {rosterStaff.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{s.name}</div>
                      <div className="muted" style={{ fontSize: 11 }}>
                        {scope === "all" ? `${storeName(s.storeId)} · ` : ""}{s.role}
                      </div>
                    </td>
                    {week.map((d) => {
                      const sh = shiftFor(s.id, d);
                      return (
                        <td key={d} style={{ textAlign: "center", padding: 4 }}>
                          <button
                            onClick={() => setShiftCtx({ staffId: s.id, storeId: s.storeId, date: d, shift: sh, name: s.name })}
                            title={sh?.note ? sh.note : "클릭해서 입력/수정"}
                            style={{
                              width: "100%", minWidth: 58, cursor: "pointer", border: "1px solid",
                              borderColor: sh ? "transparent" : "var(--border)",
                              borderRadius: 6, padding: "5px 4px",
                              fontSize: 11, fontWeight: 600, lineHeight: 1.3,
                              background: sh ? "var(--brand-soft)" : "transparent",
                              color: sh ? "var(--brand)" : "var(--muted)",
                            }}
                          >
                            {sh ? <>{sh.start}<br />{sh.end}</> : "＋"}
                          </button>
                        </td>
                      );
                    })}
                    <td className="num" style={{ fontWeight: 700 }}>{staffWeekHours(s.id)}h</td>
                  </tr>
                ))}
                <tr style={{ borderTop: "2px solid var(--border-strong)" }}>
                  <td style={{ fontWeight: 700 }}>일 근무시간</td>
                  {week.map((d) => (
                    <td key={d} className="num muted" style={{ textAlign: "center" }}>{dayHours(d)}h</td>
                  ))}
                  <td className="num" style={{ fontWeight: 700 }}>{weekTotalHours}h</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="row wrap" style={{ gap: 16, padding: "12px 14px", borderTop: "1px solid var(--border)", fontSize: 12.5 }}>
            <span className="muted">주간 총 근무 <b style={{ color: "var(--text)" }}>{weekTotalHours}h</b></span>
            <span className="muted">시급직 인건비(추정) <b style={{ color: "var(--text)" }}>{weekHourlyLabor ? manwon(weekHourlyLabor) : "-"}</b></span>
          </div>
        </Card>
      </div>

      <div className="grid grid-2 mt-24" style={{ alignItems: "start" }}>
        <Card title="직원 명부" pad={false}>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>이름</th>
                  <th>직무</th>
                  {scope === "all" && <th>매장</th>}
                  <th>고용형태</th>
                  <th className="num">급여</th>
                  <th>상태</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{s.name}</div>
                      <div className="muted" style={{ fontSize: 11 }}>
                        {s.phone}
                      </div>
                    </td>
                    <td>{s.role}</td>
                    {scope === "all" && <td className="muted">{storeName(s.storeId)}</td>}
                    <td>
                      <span className="badge gray">{s.employType}</span>
                    </td>
                    <td className="num">
                      {won(s.wage)}
                      <div className="muted" style={{ fontSize: 11 }}>
                        {s.wageType}
                      </div>
                    </td>
                    <td>
                      <Badge tone={STATUS[s.status][0] as any}>{STATUS[s.status][1]}</Badge>
                    </td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        <button
                          className="btn ghost sm"
                          onClick={() => {
                            setEdit(s);
                            setOpen(true);
                          }}
                        >
                          수정
                        </button>
                        <button className="btn danger sm" onClick={() => remove(s.id)}>
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title={`🗓 오늘 근무 (${shortDate(today())})`} pad={false}>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>직원</th>
                  {scope === "all" && <th>매장</th>}
                  <th>시간</th>
                  <th>비고</th>
                </tr>
              </thead>
              <tbody>
                {todayShifts.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted" style={{ textAlign: "center", padding: 24 }}>
                      오늘 등록된 근무가 없습니다.
                    </td>
                  </tr>
                )}
                {todayShifts.map((sh) => (
                  <tr key={sh.id}>
                    <td style={{ fontWeight: 600 }}>{nameOf(sh.staffId)}</td>
                    {scope === "all" && <td className="muted">{storeName(sh.storeId)}</td>}
                    <td>
                      {sh.start} – {sh.end}
                    </td>
                    <td className="muted">{sh.note ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {open && (
        <StaffModal
          initial={edit}
          defaultStore={scope === "all" ? "chdo" : scope}
          onClose={() => setOpen(false)}
          onSave={(s) => {
            save(s);
            setOpen(false);
          }}
        />
      )}

      {shiftCtx && (
        <ShiftModal
          ctx={shiftCtx}
          onClose={() => setShiftCtx(null)}
          onSave={(sh) => {
            saveShift(sh);
            setShiftCtx(null);
          }}
          onRemove={(id) => {
            removeShift(id);
            setShiftCtx(null);
          }}
        />
      )}
    </>
  );
}

function ShiftModal({
  ctx,
  onClose,
  onSave,
  onRemove,
}: {
  ctx: ShiftCtx;
  onClose: () => void;
  onSave: (sh: ShiftEntry) => void;
  onRemove: (id: string) => void;
}) {
  const [start, setStart] = useState(ctx.shift?.start ?? "10:00");
  const [end, setEnd] = useState(ctx.shift?.end ?? "22:00");
  const [note, setNote] = useState(ctx.shift?.note ?? "");
  const hours = shiftHours(start, end);
  const valid = hours > 0;

  const submit = () =>
    onSave({
      id: ctx.shift?.id ?? uid("sh"),
      storeId: ctx.storeId,
      staffId: ctx.staffId,
      date: ctx.date,
      start,
      end,
      note: note.trim() || undefined,
    });

  return (
    <Modal
      title={`${ctx.name} · ${shortDate(ctx.date)}(${weekdayKo(ctx.date)}) 근무`}
      onClose={onClose}
      footer={
        <>
          {ctx.shift && (
            <button className="btn danger" style={{ marginRight: "auto" }} onClick={() => onRemove(ctx.shift!.id)}>
              휴무로(삭제)
            </button>
          )}
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn primary" disabled={!valid} onClick={submit}>저장</button>
        </>
      }
    >
      <div>
        <div className="form-label">빠른 선택</div>
        <div className="row wrap" style={{ gap: 6, marginBottom: 14 }}>
          {SHIFT_PRESETS.map((p) => {
            const on = start === p.start && end === p.end;
            return (
              <button
                key={p.label}
                className={`btn sm${on ? " primary" : ""}`}
                onClick={() => { setStart(p.start); setEnd(p.end); }}
              >
                {p.label} {p.start}~{p.end}
              </button>
            );
          })}
        </div>
        <div className="form-grid">
          <Field label="출근">
            <input type="time" className="field" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="퇴근">
            <input type="time" className="field" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
          <Field label="비고(선택)" full>
            <input className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 마감 정산 담당" />
          </Field>
        </div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
          근무시간 <b style={{ color: valid ? "var(--brand)" : "var(--red)" }}>{hours}h</b>
          {!valid && " · 퇴근 시간이 출근보다 뒤여야 합니다."}
        </div>
      </div>
    </Modal>
  );
}

function StaffModal({
  initial,
  defaultStore,
  onClose,
  onSave,
}: {
  initial: Staff | null;
  defaultStore: StoreId;
  onClose: () => void;
  onSave: (s: Staff) => void;
}) {
  const [f, setF] = useState<Staff>(
    initial ?? {
      id: uid("s"),
      storeId: defaultStore,
      name: "",
      role: "홀 서버",
      phone: "",
      employType: "정직원",
      status: "active",
      hireDate: today(),
      wageType: "월급",
      wage: 2_600_000,
    }
  );
  const set = (k: keyof Staff, v: any) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Modal
      title={initial ? "직원 수정" : "직원 등록"}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            취소
          </button>
          <button className="btn primary" disabled={!f.name.trim()} onClick={() => onSave(f)}>
            저장
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="이름">
          <input className="field" value={f.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="연락처">
          <input className="field" value={f.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="매장">
          <select className="field" value={f.storeId} onChange={(e) => set("storeId", e.target.value)}>
            {STORES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="직무">
          <input className="field" value={f.role} onChange={(e) => set("role", e.target.value)} />
        </Field>
        <Field label="고용형태">
          <select className="field" value={f.employType} onChange={(e) => set("employType", e.target.value)}>
            {["정직원", "파트타임", "매니저"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="상태">
          <select className="field" value={f.status} onChange={(e) => set("status", e.target.value)}>
            <option value="active">재직</option>
            <option value="leave">휴직</option>
            <option value="resigned">퇴사</option>
          </select>
        </Field>
        <Field label="급여형태">
          <select className="field" value={f.wageType} onChange={(e) => set("wageType", e.target.value)}>
            <option value="월급">월급</option>
            <option value="시급">시급</option>
          </select>
        </Field>
        <Field label={f.wageType === "월급" ? "월급(원)" : "시급(원)"}>
          <input
            type="number"
            className="field"
            value={f.wage}
            onChange={(e) => set("wage", Number(e.target.value))}
          />
        </Field>
        <Field label="입사일" full>
          <input type="date" className="field" value={f.hireDate} onChange={(e) => set("hireDate", e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
