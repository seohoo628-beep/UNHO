"use client";

import { useState } from "react";
import { useData, inScope } from "@fnb/lib/store";
import { Card, Stat, Bar, Modal, Field } from "@fnb/components/ui";
import { STORES, storeName } from "@fnb/lib/stores";
import { won, manwon, num, pct, ratio, uid, weekdayKo, weekOf, addDays, shortDate, isWeekend } from "@fnb/lib/format";
import { totals, byWeekday, hourHeat, deriveMenus } from "@fnb/lib/analytics";
import type { DailySales, StoreId } from "@fnb/lib/types";

const WD = ["일", "월", "화", "수", "목", "금", "토"];
const TODAY = "2026-08-01";

export default function SalesPage() {
  const { data, scope, update, ready } = useData();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<DailySales | null>(null);
  if (!ready) return null;

  const rows = inScope(data.dailySales, scope).slice().sort((a, b) => a.date.localeCompare(b.date));
  const menus = deriveMenus(inScope(data.menus, scope));
  const t = totals(rows);

  // 주말/주중 일평균
  const wkend = rows.filter((r) => isWeekend(r.date));
  const wkday = rows.filter((r) => !isWeekend(r.date));
  const wkendAvg = totals(wkend).dailyAvg;
  const wkdayAvg = totals(wkday).dailyAvg;

  // 이번주 vs 지난주 (월~일)
  const thisWk = weekOf(TODAY);
  const lastWk = weekOf(addDays(TODAY, -7));
  const inDates = (ds: string[]) => rows.filter((r) => ds.includes(r.date));
  const twT = totals(inDates(thisWk));
  const lwT = totals(inDates(lastWk));
  const delta = (a: number, b: number) => (b ? ((a - b) / b) * 100 : 0);

  const wdData = byWeekday(rows);
  const maxWd = Math.max(1, ...wdData.map((d) => d.avg));
  const maxDay = Math.max(1, ...rows.map((r) => r.lunch + r.dinner));

  const save = (d: DailySales) =>
    update((s) => {
      const i = s.dailySales.findIndex((x) => x.id === d.id);
      if (i >= 0) s.dailySales[i] = d;
      else s.dailySales.push(d);
      return s;
    });
  const remove = (id: string) =>
    update((s) => ({ ...s, dailySales: s.dailySales.filter((d) => d.id !== id) }));

  const heatStores: StoreId[] = scope === "all" ? STORES.map((s) => s.id) : [scope];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>매출분석</h1>
          <p>일매출·객단가·요일/시간대 패턴·메뉴 매출믹스 — {storeName(scope)}</p>
        </div>
        <button
          className="btn primary"
          onClick={() => {
            setEdit(null);
            setOpen(true);
          }}
        >
          + 일매출 입력
        </button>
      </div>

      <div className="grid grid-4">
        <Stat icon="💳" label={`기간 매출 (${t.days}일)`} value={manwon(t.revenue)} foot={`일평균 ${manwon(t.dailyAvg)}`} />
        <Stat icon="🧾" label="객단가" value={won(Math.round(t.avgCheck))} foot={`누적 ${num(t.covers)}명`} />
        <Stat
          icon="📅"
          label="주말 vs 주중 (일평균)"
          value={manwon(wkendAvg)}
          foot={`주중 ${manwon(wkdayAvg)} · ${wkdayAvg ? pct(delta(wkendAvg, wkdayAvg), 0) : "-"} 높음`}
        />
        <Stat
          icon="🍽"
          label="런치 : 디너"
          value={t.revenue ? `${pct(ratio(t.lunch, t.revenue), 0)} : ${pct(ratio(t.dinner, t.revenue), 0)}` : "-"}
          foot={`디너 ${manwon(t.dinner)}`}
        />
      </div>

      {/* 주간 요약 */}
      <div className="mt-24">
        <Card title="🗓 주간 요약 (이번주 vs 지난주)" pad>
          <div className="grid grid-3">
            <WeekDelta label="매출" now={twT.revenue} prev={lwT.revenue} fmt={manwon} />
            <WeekDelta label="방문객수" now={twT.covers} prev={lwT.covers} fmt={(n) => num(n) + "명"} />
            <WeekDelta label="객단가" now={Math.round(twT.avgCheck)} prev={Math.round(lwT.avgCheck)} fmt={won} />
          </div>
        </Card>
      </div>

      <div className="grid grid-2 mt-24" style={{ alignItems: "start" }}>
        {/* 일별 매출 추이 (런치/디너 스택) */}
        <Card title="일별 매출 추이 (런치·디너)" pad>
          <div className="minibars" style={{ height: 150 }}>
            {rows.map((r) => {
              const totalV = r.lunch + r.dinner;
              const h = (totalV / maxDay) * 100;
              const lunchPct = totalV ? (r.lunch / totalV) * 100 : 0;
              return (
                <div key={r.id} className="col" title={`${r.date} · ${won(totalV)}`}>
                  <div style={{ fontSize: 9.5, color: "var(--text-3)" }}>{Math.round(totalV / 10000)}</div>
                  <div className="fill" style={{ height: `${h}%`, background: "transparent", display: "flex", flexDirection: "column", justifyContent: "flex-end", width: "100%", maxWidth: 42 }}>
                    <div style={{ height: `${100 - lunchPct}%`, background: "var(--brand)", borderRadius: "5px 5px 0 0" }} />
                    <div style={{ height: `${lunchPct}%`, background: "var(--amber)" }} />
                  </div>
                  <div className="cap" style={{ fontSize: 10 }}>{shortDate(r.date)}</div>
                </div>
              );
            })}
          </div>
          <div className="chips mt-16" style={{ fontSize: 12 }}>
            <span className="row" style={{ gap: 6 }}>
              <span className="dot" style={{ background: "var(--amber)" }} /> 런치
            </span>
            <span className="row" style={{ gap: 6 }}>
              <span className="dot" style={{ background: "var(--brand)" }} /> 디너
            </span>
            <span className="muted">(단위: 만원)</span>
          </div>
        </Card>

        {/* 요일별 평균 */}
        <Card title="요일별 평균 매출" pad>
          <div className="minibars" style={{ height: 150 }}>
            {wdData.map((d) => (
              <div key={d.wd} className="col" title={`${WD[d.wd]}요일 평균 ${won(Math.round(d.avg))}`}>
                <div style={{ fontSize: 10, fontWeight: 700 }}>{d.avg ? Math.round(d.avg / 10000) : ""}</div>
                <div
                  className="fill"
                  style={{
                    height: `${(d.avg / maxWd) * 100}%`,
                    background: d.wd === 0 || d.wd === 6 ? "var(--brand)" : "var(--blue)",
                  }}
                />
                <div className="cap">{WD[d.wd]}</div>
              </div>
            ))}
          </div>
          <div className="muted mt-16" style={{ fontSize: 12 }}>주말(토·일) 보라색 · 단위 만원</div>
        </Card>
      </div>

      {/* 시간대 히트맵 */}
      <div className="mt-24 stack">
        {heatStores.map((sid) => (
          <HeatCard key={sid} storeId={sid} rows={data.dailySales.filter((r) => r.storeId === sid)} showTitle={scope === "all"} />
        ))}
      </div>

      {/* 메뉴 매출믹스 */}
      <div className="grid grid-2 mt-24" style={{ alignItems: "start" }}>
        <Card title="🏆 인기 메뉴 Top" pad>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {menus.slice(0, 6).map((m, i) => {
              const top = menus[0]?.sales || 1;
              return (
                <div key={m.id}>
                  <div className="row between" style={{ marginBottom: 5 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>
                      <span className="muted">{i + 1}. </span>
                      {scope === "all" && <span className="muted" style={{ fontWeight: 400 }}>[{storeName(m.storeId)}] </span>}
                      {m.name}
                    </span>
                    <span className="num" style={{ fontWeight: 700, fontSize: 12.5 }}>{manwon(m.sales)}</span>
                  </div>
                  <Bar value={ratio(m.sales, top)} />
                </div>
              );
            })}
          </div>
        </Card>

        <Card title="메뉴별 수익성" pad={false}>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>메뉴</th>
                  <th>분류</th>
                  <th className="num">판매</th>
                  <th className="num">매출</th>
                  <th className="num">원가율</th>
                  <th className="num">마진</th>
                </tr>
              </thead>
              <tbody>
                {menus.map((m) => (
                  <tr key={m.id}>
                    <td style={{ fontWeight: 600 }}>{m.name}</td>
                    <td>
                      <span className="badge gray">{m.category}</span>
                    </td>
                    <td className="num">{num(m.soldQty)}</td>
                    <td className="num">{manwon(m.sales)}</td>
                    <td className="num" style={{ color: m.costRate > 40 ? "var(--amber)" : "var(--text-2)" }}>
                      {pct(m.costRate, 0)}
                    </td>
                    <td className="num" style={{ fontWeight: 600, color: "var(--green)" }}>{manwon(m.margin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* 일매출 데이터 (편집) */}
      <div className="mt-24">
        <Card title="일매출 데이터" pad={false}>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>요일</th>
                  {scope === "all" && <th>매장</th>}
                  <th className="num">런치</th>
                  <th className="num">디너</th>
                  <th className="num">합계</th>
                  <th className="num">객수</th>
                  <th className="num">객단가</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .slice()
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((r) => {
                    const tot = r.lunch + r.dinner;
                    return (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 600 }}>{r.date}</td>
                        <td className={isWeekend(r.date) ? "" : "muted"} style={isWeekend(r.date) ? { color: "var(--brand)", fontWeight: 600 } : undefined}>
                          {weekdayKo(r.date)}
                        </td>
                        {scope === "all" && <td className="muted">{storeName(r.storeId)}</td>}
                        <td className="num muted">{won(r.lunch)}</td>
                        <td className="num muted">{won(r.dinner)}</td>
                        <td className="num" style={{ fontWeight: 700 }}>{won(tot)}</td>
                        <td className="num">{r.covers}</td>
                        <td className="num muted">{r.covers ? won(Math.round(tot / r.covers)) : "-"}</td>
                        <td>
                          <div className="row" style={{ gap: 4 }}>
                            <button className="btn ghost sm" onClick={() => { setEdit(r); setOpen(true); }}>수정</button>
                            <button className="btn danger sm" onClick={() => remove(r.id)}>삭제</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {open && (
        <SalesModal
          initial={edit}
          defaultStore={scope === "all" ? "chdo" : scope}
          onClose={() => setOpen(false)}
          onSave={(d) => { save(d); setOpen(false); }}
        />
      )}
    </>
  );
}

function WeekDelta({ label, now, prev, fmt }: { label: string; now: number; prev: number; fmt: (n: number) => string }) {
  const d = prev ? ((now - prev) / prev) * 100 : 0;
  const up = d >= 0;
  return (
    <div style={{ padding: "4px 0" }}>
      <div className="muted" style={{ fontSize: 12.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 780, marginTop: 4 }}>{fmt(now)}</div>
      <div style={{ fontSize: 12, marginTop: 2, color: up ? "var(--green)" : "var(--red)" }}>
        {up ? "▲" : "▼"} {pct(Math.abs(d), 1)} <span className="muted">지난주 {fmt(prev)}</span>
      </div>
    </div>
  );
}

function HeatCard({ storeId, rows, showTitle }: { storeId: StoreId; rows: DailySales[]; showTitle: boolean }) {
  const { hours, cells, max } = hourHeat(rows, storeId);
  const cell = (wd: number, hour: number) => cells.find((c) => c.wd === wd && c.hour === hour)?.value ?? 0;
  const color = (v: number) => {
    if (!v || !max) return "var(--surface-2)";
    const a = 0.12 + (v / max) * 0.88;
    return `rgba(124,58,237,${a.toFixed(2)})`;
  };
  return (
    <Card title={`시간대 매출 분포${showTitle ? ` · ${storeName(storeId)}` : ""} (추정)`} pad>
      <div className="table-wrap">
        <table style={{ borderCollapse: "collapse", fontSize: 11.5 }}>
          <thead>
            <tr>
              <th style={{ padding: "4px 8px", textAlign: "left", color: "var(--text-3)" }}></th>
              {hours.map((h) => (
                <th key={h} style={{ padding: "4px 6px", color: "var(--text-3)", fontWeight: 600 }}>{h}시</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
              <tr key={wd}>
                <td style={{ padding: "4px 8px", fontWeight: 700, color: wd === 0 || wd === 6 ? "var(--brand)" : "var(--text-2)" }}>{WD[wd]}</td>
                {hours.map((h) => {
                  const v = cell(wd, h);
                  return (
                    <td key={h} style={{ padding: 3 }}>
                      <div
                        title={`${WD[wd]} ${h}시 · ${won(Math.round(v))}`}
                        style={{ width: 34, height: 26, borderRadius: 5, background: color(v), display: "grid", placeItems: "center", color: v / max > 0.55 ? "#fff" : "var(--text-3)", fontSize: 10 }}
                      >
                        {v ? Math.round(v / 10000) : ""}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="muted mt-16" style={{ fontSize: 11.5 }}>셀 숫자: 예상 매출(만원) · 요일별 평균을 시간 가중치로 배분한 추정치</div>
    </Card>
  );
}

function SalesModal({
  initial,
  defaultStore,
  onClose,
  onSave,
}: {
  initial: DailySales | null;
  defaultStore: StoreId;
  onClose: () => void;
  onSave: (d: DailySales) => void;
}) {
  const [f, setF] = useState<DailySales>(
    initial ?? { id: uid("d"), storeId: defaultStore, date: TODAY, lunch: 0, dinner: 0, covers: 0 }
  );
  const set = (k: keyof DailySales, v: any) => setF((p) => ({ ...p, [k]: v }));
  const tot = f.lunch + f.dinner;
  return (
    <Modal
      title={initial ? "일매출 수정" : "일매출 입력"}
      onClose={onClose}
      footer={
        <>
          <div className="spacer" style={{ fontSize: 13 }}>
            합계 <b>{won(tot)}</b>
            {f.covers ? <span className="muted"> · 객단가 {won(Math.round(tot / f.covers))}</span> : null}
          </div>
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn primary" onClick={() => onSave(f)}>저장</button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="매장">
          <select className="field" value={f.storeId} onChange={(e) => set("storeId", e.target.value)}>
            {STORES.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </Field>
        <Field label="날짜">
          <input type="date" className="field" value={f.date} onChange={(e) => set("date", e.target.value)} />
        </Field>
        <Field label="런치 매출(원)">
          <input type="number" className="field" value={f.lunch} onChange={(e) => set("lunch", Number(e.target.value))} />
        </Field>
        <Field label="디너 매출(원)">
          <input type="number" className="field" value={f.dinner} onChange={(e) => set("dinner", Number(e.target.value))} />
        </Field>
        <Field label="방문 객수(명)" full>
          <input type="number" className="field" value={f.covers} onChange={(e) => set("covers", Number(e.target.value))} />
        </Field>
      </div>
    </Modal>
  );
}
