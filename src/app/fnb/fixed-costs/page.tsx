"use client";

import { useState } from "react";
import { useData, inScope } from "@fnb/lib/store";
import { Card, Stat, Modal, Field } from "@fnb/components/ui";
import { STORES, storeName } from "@fnb/lib/stores";
import { won, manwon, uid } from "@fnb/lib/format";
import type { FixedCost, StoreId } from "@fnb/lib/types";

const KIND: Record<FixedCost["kind"], string> = { labor: "인건비", operating: "운영비" };

export default function FixedCostsPage() {
  const { data, scope, update, ready } = useData();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<FixedCost | null>(null);
  if (!ready) return null;

  const rows = inScope(data.fixedCosts, scope);
  const labor = rows.filter((r) => r.kind === "labor").reduce((s, r) => s + r.amount, 0);
  const operating = rows.filter((r) => r.kind === "operating").reduce((s, r) => s + r.amount, 0);
  const total = labor + operating;

  const save = (c: FixedCost) =>
    update((d) => {
      const i = d.fixedCosts.findIndex((x) => x.id === c.id);
      if (i >= 0) d.fixedCosts[i] = c;
      else d.fixedCosts.push(c);
      return d;
    });
  const remove = (id: string) => update((d) => ({ ...d, fixedCosts: d.fixedCosts.filter((c) => c.id !== id) }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>고정비 관리</h1>
          <p>월 고정비를 인건비·운영비로 나눠 입력 — {storeName(scope)}</p>
        </div>
        <button className="btn primary" onClick={() => { setEdit(null); setOpen(true); }}>+ 고정비 추가</button>
      </div>

      <div className="grid grid-3">
        <Stat icon="🏦" label="월 고정비 합계" value={manwon(total)} foot={`${rows.length}개 항목`} />
        <Stat icon="👥" label="인건비" value={manwon(labor)} foot={total ? `${Math.round((labor / total) * 100)}%` : "-"} />
        <Stat icon="🏢" label="운영비" value={manwon(operating)} foot={total ? `${Math.round((operating / total) * 100)}%` : "-"} />
      </div>

      {(["labor", "operating"] as const).map((kind) => {
        const list = rows.filter((r) => r.kind === kind);
        return (
          <div className="mt-24" key={kind}>
            <Card title={`${kind === "labor" ? "👥 인건비" : "🏢 운영비"} (${manwon(list.reduce((s, r) => s + r.amount, 0))})`} pad={false}>
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>항목</th>
                      {scope === "all" && <th>매장</th>}
                      <th className="num">월 금액</th>
                      <th>비고</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.length === 0 && (
                      <tr><td colSpan={5} className="muted" style={{ textAlign: "center", padding: 20 }}>등록된 {KIND[kind]} 항목이 없습니다.</td></tr>
                    )}
                    {list.map((c) => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 600 }}>{c.name}</td>
                        {scope === "all" && <td className="muted">{storeName(c.storeId)}</td>}
                        <td className="num" style={{ fontWeight: 700 }}>{won(c.amount)}</td>
                        <td className="muted" style={{ fontSize: 12 }}>{c.note ?? "-"}</td>
                        <td>
                          <div className="row" style={{ gap: 4 }}>
                            <button className="btn ghost sm" onClick={() => { setEdit(c); setOpen(true); }}>수정</button>
                            <button className="btn danger sm" onClick={() => remove(c.id)}>삭제</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        );
      })}

      {open && (
        <FixedCostModal
          initial={edit}
          defaultStore={scope === "all" ? "chdo" : scope}
          onClose={() => setOpen(false)}
          onSave={(c) => { save(c); setOpen(false); }}
        />
      )}
    </>
  );
}

function FixedCostModal({
  initial, defaultStore, onClose, onSave,
}: {
  initial: FixedCost | null; defaultStore: StoreId; onClose: () => void; onSave: (c: FixedCost) => void;
}) {
  const [f, setF] = useState<FixedCost>(
    initial ?? { id: uid("fc"), storeId: defaultStore, kind: "labor", name: "", amount: 0, note: "" }
  );
  const set = (k: keyof FixedCost, v: any) => setF((p) => ({ ...p, [k]: v }));
  return (
    <Modal
      title={initial ? "고정비 수정" : "고정비 추가"}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn primary" disabled={!f.name.trim()} onClick={() => onSave(f)}>저장</button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="매장">
          <select className="field" value={f.storeId} onChange={(e) => set("storeId", e.target.value)}>
            {STORES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="분류">
          <select className="field" value={f.kind} onChange={(e) => set("kind", e.target.value)}>
            <option value="labor">인건비</option>
            <option value="operating">운영비</option>
          </select>
        </Field>
        <Field label="항목명" full>
          <input className="field" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="예: 점장 급여, 임대료, 관리비" />
        </Field>
        <Field label="월 금액(원)">
          <input type="number" className="field" value={f.amount} onChange={(e) => set("amount", Number(e.target.value))} />
        </Field>
        <Field label="비고(선택)">
          <input className="field" value={f.note ?? ""} onChange={(e) => set("note", e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
