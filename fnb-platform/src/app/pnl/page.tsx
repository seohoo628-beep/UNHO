"use client";

import { useState } from "react";
import { useData, inScope } from "@/lib/store";
import { Card, Stat, Modal, Field } from "@/components/ui";
import { storeName, STORES } from "@/lib/stores";
import { won, manwon, pct, uid } from "@/lib/format";
import { derivePnl, sumPnl, PNL_ROWS } from "@/lib/pnl";
import type { PnlMonth, StoreId } from "@/lib/types";

export default function PnlPage() {
  const { data, scope, update, ready } = useData();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<PnlMonth | null>(null);
  if (!ready) return null;

  const rows = inScope(data.pnl, scope);
  const months = Array.from(new Set(rows.map((r) => r.month))).sort();

  // 월별 합계(scope 내) — 합산 후 월 라벨 보존
  const perMonth = months.map((m) => ({ ...sumPnl(rows.filter((r) => r.month === m)), month: m }));
  const latest = perMonth[perMonth.length - 1];
  const prev = perMonth[perMonth.length - 2];

  const revDelta = latest && prev ? ((latest.revenue - prev.revenue) / (prev.revenue || 1)) * 100 : 0;
  const maxRev = Math.max(1, ...perMonth.map((p) => p.revenue));

  const save = (p: PnlMonth) =>
    update((d) => {
      const i = d.pnl.findIndex((x) => x.id === p.id);
      if (i >= 0) d.pnl[i] = p;
      else d.pnl.push(p);
      return d;
    });
  const remove = (id: string) => update((d) => ({ ...d, pnl: d.pnl.filter((p) => p.id !== id) }));

  const compositionColors = ["#c2410c", "#f79009", "#2e90fa", "#12b76a", "#7c3aed", "#98a2b3"];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>P&amp;L 관리</h1>
          <p>월별 손익계산·원가율·영업이익 — {storeName(scope)}</p>
        </div>
        <button
          className="btn primary"
          onClick={() => {
            setEdit(null);
            setOpen(true);
          }}
        >
          + 월 실적 입력
        </button>
      </div>

      {latest && (
        <div className="grid grid-4">
          <Stat
            icon="💳"
            label={`매출 (${latest.month})`}
            value={manwon(latest.revenue)}
            foot={
              prev ? (
                <span style={{ color: revDelta >= 0 ? "var(--green)" : "var(--red)" }}>
                  전월 대비 {revDelta >= 0 ? "▲" : "▼"} {pct(Math.abs(revDelta), 1)}
                </span>
              ) : undefined
            }
          />
          <Stat
            icon="📈"
            label="영업이익"
            value={manwon(latest.operatingProfit)}
            accent={latest.operatingProfit >= 0 ? "var(--green)" : "var(--red)"}
            foot={`영업이익률 ${pct(latest.opMargin)}`}
          />
          <Stat icon="🍖" label="식자재 원가율" value={pct(latest.foodCostRate)} accent={latest.foodCostRate > 35 ? "var(--amber)" : undefined} foot="목표 33% 이하" />
          <Stat icon="🧑‍🍳" label="인건비율" value={pct(latest.laborRate)} foot="목표 25% 이하" />
        </div>
      )}

      <div className="grid grid-2 mt-24" style={{ alignItems: "start" }}>
        <Card title="매출 추이" pad>
          <div className="minibars">
            {perMonth.map((p) => (
              <div key={p.month} className="col">
                <div style={{ fontSize: 11, fontWeight: 700 }}>{manwon(p.revenue)}</div>
                <div className="fill" style={{ height: `${(p.revenue / maxRev) * 100}%` }} />
                <div className="cap">{p.month.slice(5)}월</div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="영업이익 추이" pad>
          <div className="minibars">
            {perMonth.map((p) => {
              const max = Math.max(1, ...perMonth.map((x) => x.operatingProfit));
              return (
                <div key={p.month} className="col">
                  <div style={{ fontSize: 11, fontWeight: 700 }}>{manwon(p.operatingProfit)}</div>
                  <div
                    className="fill"
                    style={{
                      height: `${(p.operatingProfit / max) * 100}%`,
                      background: "var(--green)",
                    }}
                  />
                  <div className="cap">{p.month.slice(5)}월</div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* 손익계산서 (월별 컬럼) */}
      <div className="mt-24">
        <Card title="월별 손익계산서" pad={false}>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>항목</th>
                  {perMonth.map((p) => (
                    <th key={p.month} className="num">
                      {p.month}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PNL_ROWS.map((row) => (
                  <tr key={row.key}>
                    <td style={{ fontWeight: row.kind === "rev" ? 700 : 500 }}>
                      {row.kind === "cost" && <span className="muted">└ </span>}
                      {row.label}
                    </td>
                    {perMonth.map((p) => (
                      <td key={p.month} className="num" style={{ color: row.kind === "cost" ? "var(--text-2)" : undefined }}>
                        {won((p as any)[row.key])}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr style={{ borderTop: "2px solid var(--border-strong)" }}>
                  <td style={{ fontWeight: 700 }}>영업이익</td>
                  {perMonth.map((p) => (
                    <td
                      key={p.month}
                      className="num"
                      style={{ fontWeight: 700, color: p.operatingProfit >= 0 ? "var(--green)" : "var(--red)" }}
                    >
                      {won(p.operatingProfit)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="muted">영업이익률</td>
                  {perMonth.map((p) => (
                    <td key={p.month} className="num muted">
                      {pct(p.opMargin)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* 원가 구성 (최신월) */}
      {latest && (
        <div className="mt-24">
          <Card title={`비용 구성 (${latest.month})`} pad>
            <div className="stackbar">
              {PNL_ROWS.filter((r) => r.kind === "cost").map((r, idx) => {
                const v = (latest as any)[r.key] as number;
                const w = (v / latest.totalCost) * 100;
                return (
                  <div
                    key={r.key}
                    style={{ width: `${w}%`, background: compositionColors[idx] }}
                    title={`${r.label} ${pct(w, 0)}`}
                  />
                );
              })}
            </div>
            <div className="chips mt-16">
              {PNL_ROWS.filter((r) => r.kind === "cost").map((r, idx) => (
                <span key={r.key} className="row" style={{ gap: 6, fontSize: 12.5 }}>
                  <span className="dot" style={{ background: compositionColors[idx] }} />
                  {r.label} {won((latest as any)[r.key])}
                </span>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* 실적 데이터 (편집) */}
      <div className="mt-24">
        <Card title="실적 데이터 (매장·월별)" pad={false}>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>월</th>
                  <th>매장</th>
                  <th className="num">매출</th>
                  <th className="num">영업이익</th>
                  <th className="num">이익률</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .slice()
                  .sort((a, b) => b.month.localeCompare(a.month) || a.storeId.localeCompare(b.storeId))
                  .map((r) => {
                    const d = derivePnl(r);
                    return (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 600 }}>{r.month}</td>
                        <td className="muted">{storeName(r.storeId)}</td>
                        <td className="num">{won(r.revenue)}</td>
                        <td className="num" style={{ color: d.operatingProfit >= 0 ? "var(--green)" : "var(--red)" }}>
                          {won(d.operatingProfit)}
                        </td>
                        <td className="num muted">{pct(d.opMargin)}</td>
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
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {open && (
        <PnlModal
          initial={edit}
          defaultStore={scope === "all" ? "chdo" : scope}
          onClose={() => setOpen(false)}
          onSave={(p) => {
            save(p);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function PnlModal({
  initial,
  defaultStore,
  onClose,
  onSave,
}: {
  initial: PnlMonth | null;
  defaultStore: StoreId;
  onClose: () => void;
  onSave: (p: PnlMonth) => void;
}) {
  const [f, setF] = useState<PnlMonth>(
    initial ?? {
      id: uid("p"),
      storeId: defaultStore,
      month: "2026-08",
      revenue: 0,
      foodCost: 0,
      labor: 0,
      rent: 0,
      utilities: 0,
      marketing: 0,
      other: 0,
    }
  );
  const set = (k: keyof PnlMonth, v: any) => setF((p) => ({ ...p, [k]: v }));
  const d = derivePnl(f);

  return (
    <Modal
      title={initial ? "월 실적 수정" : "월 실적 입력"}
      onClose={onClose}
      footer={
        <>
          <div className="spacer" style={{ fontSize: 13 }}>
            영업이익{" "}
            <b style={{ color: d.operatingProfit >= 0 ? "var(--green)" : "var(--red)" }}>
              {won(d.operatingProfit)}
            </b>{" "}
            ({pct(d.opMargin)})
          </div>
          <button className="btn" onClick={onClose}>
            취소
          </button>
          <button className="btn primary" onClick={() => onSave(f)}>
            저장
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="매장">
          <select className="field" value={f.storeId} onChange={(e) => set("storeId", e.target.value)}>
            {STORES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="월 (YYYY-MM)">
          <input className="field" value={f.month} onChange={(e) => set("month", e.target.value)} />
        </Field>
        {PNL_ROWS.map((r) => (
          <Field key={r.key} label={r.label + "(원)"}>
            <input
              type="number"
              className="field"
              value={(f as any)[r.key]}
              onChange={(e) => set(r.key, Number(e.target.value))}
            />
          </Field>
        ))}
      </div>
    </Modal>
  );
}
