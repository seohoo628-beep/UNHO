"use client";

import { useState } from "react";
import { useData, inScope } from "@fnb/lib/store";
import { Card, Badge, Stat, Modal, Field, Chips } from "@fnb/components/ui";
import { storeName, STORES, STORE_MAP } from "@fnb/lib/stores";
import { uid, weekOf, weekdayKo, isWeekend, shortDate, toMin, pct } from "@fnb/lib/format";
import type { Reservation, ReservationStatus, StoreId } from "@fnb/lib/types";

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

  // 좌석 수용력 (scope=all이면 두 매장 합)
  const capacity = scope === "all" ? STORES.reduce((s, x) => s + x.seats, 0) : STORE_MAP[scope].seats;
  const seatRate = capacity ? (guests / capacity) * 100 : 0;

  // 노쇼율(기간): 노쇼 / 비취소 예약
  const booked = all.filter((r) => r.status !== "cancelled");
  const noshowCnt = all.filter((r) => r.status === "noshow").length;
  const noshowRate = booked.length ? (noshowCnt / booked.length) * 100 : 0;

  // 주간 뷰 (선택일 기준 주)
  const week = weekOf(day);
  const weekRows = week.map((d) => {
    const rs = all.filter((r) => r.date === d && r.status !== "cancelled");
    return {
      date: d,
      teams: rs.length,
      guests: rs.reduce((s, r) => s + r.partySize, 0),
      noshow: all.filter((r) => r.date === d && r.status === "noshow").length,
    };
  });
  const maxWeekGuests = Math.max(1, ...weekRows.map((w) => w.guests));

  // 선택일 타임라인 (비취소, 시간순)
  const timeline = all
    .filter((r) => r.date === day && r.status !== "cancelled")
    .sort((a, b) => toMin(a.time) - toMin(b.time));

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
        <Stat
          icon="🪑"
          label="좌석 예약률(선택일)"
          value={pct(seatRate, 0)}
          accent={seatRate >= 80 ? "var(--green)" : seatRate >= 40 ? "var(--amber)" : undefined}
          foot={`예약 ${guests}명 / 좌석 ${capacity}석`}
        />
        <Stat icon="⏳" label="대기" value={`${all.filter((r) => r.date === day && r.status === "pending").length}팀`} accent="var(--amber)" />
        <Stat
          icon="🚫"
          label="노쇼율(기간)"
          value={pct(noshowRate, 1)}
          accent={noshowRate >= 5 ? "var(--red)" : undefined}
          foot={`노쇼 ${noshowCnt}건 / 예약 ${booked.length}건`}
        />
      </div>

      {/* 주간 뷰 */}
      <div className="mt-24">
        <Card title={`🗓 주간 예약 현황 (${week[0].slice(5)} ~ ${week[6].slice(5)})`} pad>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
            {weekRows.map((w) => {
              const sel = w.date === day;
              const wknd = isWeekend(w.date);
              return (
                <button
                  key={w.date}
                  onClick={() => setDay(w.date)}
                  style={{
                    textAlign: "center",
                    border: sel ? "1.5px solid var(--brand)" : "1px solid var(--border)",
                    background: sel ? "var(--brand-soft)" : "var(--surface)",
                    borderRadius: 10,
                    padding: "10px 6px",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 11, color: wknd ? "var(--brand)" : "var(--text-3)", fontWeight: 700 }}>
                    {weekdayKo(w.date)}
                  </div>
                  <div className="muted" style={{ fontSize: 11 }}>{shortDate(w.date)}</div>
                  <div style={{ fontWeight: 780, fontSize: 18, margin: "6px 0 2px" }}>{w.teams}</div>
                  <div className="muted" style={{ fontSize: 11 }}>{w.guests}명</div>
                  <div style={{ height: 4, borderRadius: 2, marginTop: 6, background: "var(--surface-2)" }}>
                    <div style={{ height: "100%", width: `${(w.guests / maxWeekGuests) * 100}%`, background: "var(--brand)", borderRadius: 2 }} />
                  </div>
                  {w.noshow > 0 && <div style={{ fontSize: 10, color: "var(--red)", marginTop: 4 }}>노쇼 {w.noshow}</div>}
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      {/* 선택일 타임라인 */}
      {timeline.length > 0 && (
        <div className="mt-24">
          <Card title={`⏱ ${day} 타임라인`} pad>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {timeline.map((r) => (
                <div key={r.id} className="row" style={{ gap: 12 }}>
                  <span style={{ fontWeight: 700, width: 48, fontVariantNumeric: "tabular-nums" }}>{r.time}</span>
                  <div
                    style={{
                      flex: 1,
                      background: "var(--surface-2)",
                      borderRadius: 8,
                      padding: "8px 12px",
                      borderLeft: `3px solid var(--${toneOf(r.status) === "gray" ? "text-3" : toneOf(r.status)})`,
                    }}
                    className="row between"
                  >
                    <span>
                      <b>{r.name}</b> <span className="muted">· {r.partySize}명 · {r.channel}</span>
                      {scope === "all" && <span className="muted"> · {storeName(r.storeId)}</span>}
                      {r.memo && <span className="muted"> · {r.memo}</span>}
                    </span>
                    <Badge tone={toneOf(r.status) as any}>{labelOf(r.status)}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

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
