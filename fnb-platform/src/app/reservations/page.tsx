"use client";

import { useState } from "react";
import { useData, inScope } from "@/lib/store";
import { Card, Badge, Stat, Modal, Field, Chips } from "@/components/ui";
import { storeName, STORES } from "@/lib/stores";
import { uid } from "@/lib/format";
import type { Reservation, ReservationStatus, StoreId } from "@/lib/types";

const STATUS: { value: ReservationStatus; label: string; tone: string }[] = [
  { value: "confirmed", label: "확정", tone: "green" },
  { value: "pending", label: "대기", tone: "amber" },
  { value: "seated", label: "착석", tone: "blue" },
  { value: "cancelled", label: "취소", tone: "gray" },
  { value: "noshow", label: "노쇼", tone: "red" },
];
const toneOf = (s: string) => STATUS.find((x) => x.value === s)?.tone ?? "gray";
const labelOf = (s: string) => STATUS.find((x) => x.value === s)?.label ?? s;

export default function ReservationsPage() {
  const { data, scope, update, ready } = useData();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Reservation | null>(null);
  const [day, setDay] = useState("2026-08-01");
  const [filter, setFilter] = useState<"all" | ReservationStatus>("all");
  if (!ready) return null;

  const all = inScope(data.reservations, scope);
  const dates = Array.from(new Set(all.map((r) => r.date))).sort();
  let list = all.filter((r) => r.date === day);
  if (filter !== "all") list = list.filter((r) => r.status === filter);
  list = list.sort((a, b) => a.time.localeCompare(b.time));

  const dayAll = all.filter((r) => r.date === day && r.status !== "cancelled");
  const guests = dayAll.reduce((s, r) => s + r.partySize, 0);

  const save = (r: Reservation) =>
    update((d) => {
      const i = d.reservations.findIndex((x) => x.id === r.id);
      if (i >= 0) d.reservations[i] = r;
      else d.reservations.unshift(r);
      return d;
    });
  const setStatus = (id: string, status: ReservationStatus) =>
    update((d) => {
      const r = d.reservations.find((x) => x.id === id);
      if (r) r.status = status;
      return d;
    });
  const remove = (id: string) =>
    update((d) => ({ ...d, reservations: d.reservations.filter((r) => r.id !== id) }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>예약관리</h1>
          <p>일자별 예약 현황과 상태 관리 — {storeName(scope)}</p>
        </div>
        <button
          className="btn primary"
          onClick={() => {
            setEdit(null);
            setOpen(true);
          }}
        >
          + 예약 추가
        </button>
      </div>

      <div className="grid grid-4">
        <Stat icon="📅" label={`${day} 예약`} value={`${dayAll.length}팀`} foot={`총 ${guests}명`} />
        <Stat icon="✅" label="확정" value={`${all.filter((r) => r.date === day && r.status === "confirmed").length}팀`} />
        <Stat icon="⏳" label="대기" value={`${all.filter((r) => r.date === day && r.status === "pending").length}팀`} accent="var(--amber)" />
        <Stat icon="🚫" label="취소·노쇼" value={`${all.filter((r) => r.date === day && (r.status === "cancelled" || r.status === "noshow")).length}팀`} />
      </div>

      <Card
        title={
          <div className="row" style={{ gap: 10 }}>
            <span>예약 목록</span>
            <select className="field" style={{ width: "auto", padding: "5px 9px" }} value={day} onChange={(e) => setDay(e.target.value)}>
              {dates.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </div>
        }
        action={
          <Chips
            value={filter}
            onChange={setFilter}
            options={[{ value: "all", label: "전체" }, ...STATUS.map((s) => ({ value: s.value, label: s.label }))]}
          />
        }
        pad={false}
      >
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>시간</th>
                <th>고객</th>
                {scope === "all" && <th>매장</th>}
                <th className="num">인원</th>
                <th>채널</th>
                <th>메모</th>
                <th>상태</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr>
                  <td colSpan={8} className="muted" style={{ textAlign: "center", padding: 28 }}>
                    해당 조건의 예약이 없습니다.
                  </td>
                </tr>
              )}
              {list.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 700 }}>{r.time}</td>
                  <td>
                    {r.name}
                    <div className="muted" style={{ fontSize: 11 }}>
                      {r.phone}
                    </div>
                  </td>
                  {scope === "all" && <td className="muted">{storeName(r.storeId)}</td>}
                  <td className="num">{r.partySize}</td>
                  <td>
                    <span className="badge gray">{r.channel}</span>
                  </td>
                  <td className="muted" style={{ maxWidth: 180 }}>
                    {r.memo ?? "-"}
                  </td>
                  <td>
                    <select
                      className="field"
                      style={{ padding: "4px 8px", width: "auto", fontSize: 12 }}
                      value={r.status}
                      onChange={(e) => setStatus(r.id, e.target.value as ReservationStatus)}
                    >
                      {STATUS.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div className="row" style={{ gap: 4 }}>
                      <button
                        className="btn ghost sm"
                        onClick={() => {
                          setEdit(r);
                          setOpen(true);
                        }}
                      >
                        수정
                      </button>
                      <button className="btn danger sm" onClick={() => remove(r.id)}>
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

      {open && (
        <ResModal
          initial={edit}
          defaultStore={scope === "all" ? "chdo" : scope}
          defaultDate={day}
          onClose={() => setOpen(false)}
          onSave={(r) => {
            save(r);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function ResModal({
  initial,
  defaultStore,
  defaultDate,
  onClose,
  onSave,
}: {
  initial: Reservation | null;
  defaultStore: StoreId;
  defaultDate: string;
  onClose: () => void;
  onSave: (r: Reservation) => void;
}) {
  const [f, setF] = useState<Reservation>(
    initial ?? {
      id: uid("r"),
      storeId: defaultStore,
      name: "",
      phone: "",
      date: defaultDate,
      time: "18:00",
      partySize: 2,
      status: "confirmed",
      channel: "전화",
      memo: "",
    }
  );
  const set = (k: keyof Reservation, v: any) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Modal
      title={initial ? "예약 수정" : "예약 추가"}
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
        <Field label="고객명">
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
        <Field label="채널">
          <select className="field" value={f.channel} onChange={(e) => set("channel", e.target.value)}>
            {["전화", "네이버", "캐치테이블", "워크인", "인스타DM"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="날짜">
          <input type="date" className="field" value={f.date} onChange={(e) => set("date", e.target.value)} />
        </Field>
        <Field label="시간">
          <input type="time" className="field" value={f.time} onChange={(e) => set("time", e.target.value)} />
        </Field>
        <Field label="인원">
          <input type="number" min={1} className="field" value={f.partySize} onChange={(e) => set("partySize", Number(e.target.value))} />
        </Field>
        <Field label="상태">
          <select className="field" value={f.status} onChange={(e) => set("status", e.target.value)}>
            {STATUS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="메모" full>
          <input className="field" value={f.memo} onChange={(e) => set("memo", e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
