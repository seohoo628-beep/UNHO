"use client";

import { useState } from "react";
import { useData, inScope } from "@/lib/store";
import { Card, Badge, Stat, Modal, Field } from "@/components/ui";
import { storeName, STORES } from "@/lib/stores";
import { won, manwon, uid, today } from "@/lib/format";
import type { Staff, StoreId, EmployStatus } from "@/lib/types";

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
        <Stat icon="🕐" label="오늘 근무" value={`${shifts.length}명`} />
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
          defaultStore={scope === "all" ? "chdo" : scope}
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
