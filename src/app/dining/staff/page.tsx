"use client";

import { useState } from "react";
import { useData, inScope } from "@dining/lib/store";
import { Card, Badge, Stat, Modal, Field } from "@dining/components/ui";
import { storeName, STORES } from "@dining/lib/stores";
import { won, manwon, uid, today, pct, weekOf, weekdayKo, isWeekend, shiftHours, shortDate } from "@dining/lib/format";
import type { Staff, StoreId, EmployStatus } from "@dining/lib/types";

const STATUS: Record<EmployStatus, [string, string]> = {
  active: ["green", "재직"],
  leave: ["amber", "휴직"],
  resigned: ["gray", "퇴사"],
};

export default function StaffPage() {
  const { data, scope, update, ready } = useData();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Staff | null>(null);
  if (!ready) return null;

  const staff = inScope(data.staff, scope);
  const shifts = inScope(data.shifts, scope).filter((s) => s.date === "2026-08-01");
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

  // 주간 근무 캘린더 (2026-08-01 기준 주)
  const week = weekOf("2026-08-01");
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

  const save = (s: Staff) =>
    update((d) => {
      const i = d.staff.findIndex((x) => x.id === s.id);
      if (i >= 0) d.staff[i] = s;
      else d.staff.unshift(s);
      return d;
    });
  const remove = (id: string) => update((d) => ({ ...d, staff: d.staff.filter((s) => s.id !== id) }));

  const nameOf = (id: string) => data.staff.find((s) => s.id === id)?.name ?? "-";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>직원관리</h1>
          <p>직원 명부·근무 스케줄·인건비 — {storeName(scope)}</p>
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

      {/* 주간 근무 캘린더 */}
      <div className="mt-24">
        <Card title={`🗓 주간 근무표 (${week[0].slice(5)} ~ ${week[6].slice(5)})`} pad={false}>
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
                        <td key={d} style={{ textAlign: "center", padding: "8px 6px" }}>
                          {sh ? (
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                background: "var(--brand-soft)",
                                color: "var(--brand)",
                                borderRadius: 6,
                                padding: "3px 4px",
                                whiteSpace: "nowrap",
                              }}
                              title={sh.note ?? ""}
                            >
                              {sh.start}~{sh.end}
                            </div>
                          ) : (
                            <span className="muted" style={{ fontSize: 11 }}>휴무</span>
                          )}
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
                  <td className="num" style={{ fontWeight: 700 }}>
                    {week.reduce((h, d) => h + dayHours(d), 0)}h
                  </td>
                </tr>
              </tbody>
            </table>
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

        <Card title="🗓 오늘 근무표 (2026-08-01)" pad={false}>
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
                {shifts.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted" style={{ textAlign: "center", padding: 24 }}>
                      등록된 근무가 없습니다.
                    </td>
                  </tr>
                )}
                {shifts.map((sh) => (
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
          defaultStore={scope === "all" ? "smjp" : scope}
          onClose={() => setOpen(false)}
          onSave={(s) => {
            save(s);
            setOpen(false);
          }}
        />
      )}
    </>
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
