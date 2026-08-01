"use client";

import { useState } from "react";
import { useData, inScope } from "@dining/lib/store";
import { Card, Badge, Stat, Modal, Field } from "@dining/components/ui";
import { storeName, STORES } from "@dining/lib/stores";
import { won, manwon, uid, today } from "@dining/lib/format";
import type { Ingredient, PurchaseOrder, PoStatus, StoreId } from "@dining/lib/types";

const PO_STATUS: Record<PoStatus, [string, string]> = {
  requested: ["amber", "발주요청"],
  ordered: ["blue", "발주완료"],
  received: ["green", "입고완료"],
};

export default function IngredientsPage() {
  const { data, scope, update, ready } = useData();
  const [tab, setTab] = useState<"stock" | "po">("stock");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Ingredient | null>(null);
  if (!ready) return null;

  const items = inScope(data.ingredients, scope);
  const pos = inScope(data.purchaseOrders, scope);
  const low = items.filter((i) => i.stock < i.parLevel);
  const stockValue = items.reduce((s, i) => s + i.stock * i.unitPrice, 0);

  const save = (it: Ingredient) =>
    update((d) => {
      const i = d.ingredients.findIndex((x) => x.id === it.id);
      if (i >= 0) d.ingredients[i] = it;
      else d.ingredients.unshift(it);
      return d;
    });
  const remove = (id: string) =>
    update((d) => ({ ...d, ingredients: d.ingredients.filter((i) => i.id !== id) }));

  // 적정재고까지 발주 → PO 생성
  const reorder = (it: Ingredient) =>
    update((d) => {
      const qty = Math.max(it.parLevel - it.stock, 1);
      d.purchaseOrders.unshift({
        id: uid("po"),
        storeId: it.storeId,
        vendor: it.vendor,
        itemName: it.name,
        qty,
        unit: it.unit,
        unitPrice: it.unitPrice,
        status: "requested",
        orderDate: today(),
        eta: today(),
      });
      return d;
    });

  const setPoStatus = (id: string, status: PoStatus) =>
    update((d) => {
      const po = d.purchaseOrders.find((x) => x.id === id);
      if (!po) return d;
      po.status = status;
      // 입고 완료 시 재고 반영
      if (status === "received") {
        const ing = d.ingredients.find((i) => i.storeId === po.storeId && i.name === po.itemName);
        if (ing) {
          ing.stock += po.qty;
          ing.lastIn = today();
        }
      }
      return d;
    });
  const removePo = (id: string) =>
    update((d) => ({ ...d, purchaseOrders: d.purchaseOrders.filter((p) => p.id !== id) }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>식자재관리</h1>
          <p>재고·발주점 관리와 발주(PO) 처리 — {storeName(scope)}</p>
        </div>
        {tab === "stock" && (
          <button
            className="btn primary"
            onClick={() => {
              setEdit(null);
              setOpen(true);
            }}
          >
            + 품목 등록
          </button>
        )}
      </div>

      <div className="grid grid-4">
        <Stat icon="📦" label="품목 수" value={`${items.length}종`} />
        <Stat icon="⚠️" label="발주 필요" value={`${low.length}종`} accent={low.length ? "var(--amber)" : undefined} foot="현재고 < 적정재고" />
        <Stat icon="🚚" label="진행 발주" value={`${pos.filter((p) => p.status !== "received").length}건`} />
        <Stat icon="💰" label="재고 자산" value={manwon(stockValue)} />
      </div>

      <div className="chips mt-24" style={{ marginBottom: 16 }}>
        <button className={`chip ${tab === "stock" ? "active" : ""}`} onClick={() => setTab("stock")}>
          재고 현황
        </button>
        <button className={`chip ${tab === "po" ? "active" : ""}`} onClick={() => setTab("po")}>
          발주 관리 ({pos.length})
        </button>
      </div>

      {tab === "stock" && (
        <Card pad={false}>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>품목</th>
                  <th>분류</th>
                  {scope === "all" && <th>매장</th>}
                  <th className="num">현재고</th>
                  <th className="num">적정</th>
                  <th className="num">단가</th>
                  <th>거래처</th>
                  <th>최근입고</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => {
                  const isLow = i.stock < i.parLevel;
                  return (
                    <tr key={i.id}>
                      <td style={{ fontWeight: 600 }}>
                        {isLow && <span style={{ color: "var(--amber)" }}>● </span>}
                        {i.name}
                      </td>
                      <td>
                        <span className="badge gray">{i.category}</span>
                      </td>
                      {scope === "all" && <td className="muted">{storeName(i.storeId)}</td>}
                      <td className="num" style={{ fontWeight: 700, color: isLow ? "var(--amber)" : undefined }}>
                        {i.stock} {i.unit}
                      </td>
                      <td className="num muted">
                        {i.parLevel} {i.unit}
                      </td>
                      <td className="num">{won(i.unitPrice)}</td>
                      <td className="muted">{i.vendor}</td>
                      <td className="muted">{i.lastIn}</td>
                      <td>
                        <div className="row" style={{ gap: 4 }}>
                          {isLow && (
                            <button className="btn sm" onClick={() => reorder(i)} title="적정재고까지 발주 생성">
                              발주
                            </button>
                          )}
                          <button
                            className="btn ghost sm"
                            onClick={() => {
                              setEdit(i);
                              setOpen(true);
                            }}
                          >
                            수정
                          </button>
                          <button className="btn danger sm" onClick={() => remove(i.id)}>
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
      )}

      {tab === "po" && (
        <Card pad={false}>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>품목</th>
                  {scope === "all" && <th>매장</th>}
                  <th>거래처</th>
                  <th className="num">수량</th>
                  <th className="num">금액</th>
                  <th>발주일</th>
                  <th>입고예정</th>
                  <th>상태</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pos.length === 0 && (
                  <tr>
                    <td colSpan={9} className="muted" style={{ textAlign: "center", padding: 28 }}>
                      발주 내역이 없습니다. 재고 현황에서 부족 품목을 발주하세요.
                    </td>
                  </tr>
                )}
                {pos.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.itemName}</td>
                    {scope === "all" && <td className="muted">{storeName(p.storeId)}</td>}
                    <td className="muted">{p.vendor}</td>
                    <td className="num">
                      {p.qty} {p.unit}
                    </td>
                    <td className="num">{won(p.qty * p.unitPrice)}</td>
                    <td className="muted">{p.orderDate}</td>
                    <td className="muted">{p.eta}</td>
                    <td>
                      <select
                        className="field"
                        style={{ padding: "4px 8px", width: "auto", fontSize: 12 }}
                        value={p.status}
                        onChange={(e) => setPoStatus(p.id, e.target.value as PoStatus)}
                      >
                        <option value="requested">발주요청</option>
                        <option value="ordered">발주완료</option>
                        <option value="received">입고완료</option>
                      </select>
                    </td>
                    <td>
                      <button className="btn danger sm" onClick={() => removePo(p.id)}>
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {open && (
        <IngModal
          initial={edit}
          defaultStore={scope === "all" ? "smjp" : scope}
          onClose={() => setOpen(false)}
          onSave={(it) => {
            save(it);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function IngModal({
  initial,
  defaultStore,
  onClose,
  onSave,
}: {
  initial: Ingredient | null;
  defaultStore: StoreId;
  onClose: () => void;
  onSave: (i: Ingredient) => void;
}) {
  const [f, setF] = useState<Ingredient>(
    initial ?? {
      id: uid("i"),
      storeId: defaultStore,
      name: "",
      category: "육류",
      unit: "kg",
      stock: 0,
      parLevel: 10,
      unitPrice: 0,
      vendor: "",
      lastIn: today(),
    }
  );
  const set = (k: keyof Ingredient, v: any) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Modal
      title={initial ? "품목 수정" : "품목 등록"}
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
        <Field label="품목명">
          <input className="field" value={f.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="분류">
          <select className="field" value={f.category} onChange={(e) => set("category", e.target.value)}>
            {["육류", "수산", "채소", "주류", "소스", "소모품"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
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
        <Field label="단위">
          <input className="field" value={f.unit} onChange={(e) => set("unit", e.target.value)} />
        </Field>
        <Field label="현재고">
          <input type="number" className="field" value={f.stock} onChange={(e) => set("stock", Number(e.target.value))} />
        </Field>
        <Field label="적정재고(발주점)">
          <input type="number" className="field" value={f.parLevel} onChange={(e) => set("parLevel", Number(e.target.value))} />
        </Field>
        <Field label="단가(원)">
          <input type="number" className="field" value={f.unitPrice} onChange={(e) => set("unitPrice", Number(e.target.value))} />
        </Field>
        <Field label="거래처">
          <input className="field" value={f.vendor} onChange={(e) => set("vendor", e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
