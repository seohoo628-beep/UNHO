"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  adjustStock,
} from "@/app/(app)/inventory/actions";
import type { InventoryItem } from "@/lib/types";

type Opt = { id: string; name: string };

function useSubmit(action: (fd: FormData) => Promise<{ ok: boolean; error?: string }>) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  function onSubmit(e: React.FormEvent<HTMLFormElement>, onDone: () => void) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await action(fd);
      if (!res.ok) setError(res.error ?? "실패");
      else {
        ref.current?.reset();
        onDone();
        router.refresh();
      }
    });
  }
  return { error, pending, ref, onSubmit };
}

function ItemFields({ item, brands, vendors }: { item?: InventoryItem; brands: Opt[]; vendors: Opt[] }) {
  return (
    <>
      <div className="row">
        <label className="field">
          <span>품목명 *</span>
          <input name="item" required defaultValue={item?.item ?? ""} />
        </label>
        <label className="field">
          <span>브랜드</span>
          <select name="brand_id" defaultValue={item?.brand_id ?? ""}>
            <option value="">(없음)</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>거래처(공급)</span>
          <select name="vendor_id" defaultValue={item?.vendor_id ?? ""}>
            <option value="">(없음)</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>현재고</span>
          <input name="current_stock" type="number" step="any" defaultValue={item?.current_stock ?? ""} />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>최근 30일 출고</span>
          <input name="out_30d" type="number" step="any" defaultValue={item?.out_30d ?? ""} />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>리드타임(일)</span>
          <input name="lead_time_days" type="number" defaultValue={item?.lead_time_days ?? ""} />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>안전여유(일)</span>
          <input name="safety_days" type="number" defaultValue={item?.safety_days ?? 7} />
        </label>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>생산일</span>
          <input name="production_date" type="date" defaultValue={item?.production_date ?? ""} />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>유효기간</span>
          <input name="expiry_date" type="date" defaultValue={item?.expiry_date ?? ""} />
        </label>
      </div>
      <label className="field" style={{ marginTop: 10 }}>
        <span>메모</span>
        <input name="note" defaultValue={item?.note ?? ""} />
      </label>
    </>
  );
}

export function InventoryItemForm({ brands, vendors }: { brands: Opt[]; vendors: Opt[] }) {
  const [open, setOpen] = useState(false);
  const { error, pending, ref, onSubmit } = useSubmit(createInventoryItem);
  if (!open)
    return (
      <button className="btn primary" onClick={() => setOpen(true)}>
        + 품목 등록
      </button>
    );
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <form ref={ref} onSubmit={(e) => onSubmit(e, () => setOpen(false))}>
        <ItemFields brands={brands} vendors={vendors} />
        {error && <p style={{ color: "var(--owner)", fontSize: 13 }}>{error}</p>}
        <div className="btn-row" style={{ marginTop: 10 }}>
          <button className="btn primary" disabled={pending}>{pending ? "저장 중..." : "저장"}</button>
          <button type="button" className="btn" onClick={() => setOpen(false)}>취소</button>
        </div>
      </form>
    </div>
  );
}

// 각 행에 붙는 조작부: 입고/출고 조정 + 수정 + 삭제.
export function InventoryRowActions({
  item,
  brands,
  vendors,
}: {
  item: InventoryItem;
  brands: Opt[];
  vendors: Opt[];
}) {
  const [mode, setMode] = useState<null | "in" | "out" | "edit">(null);
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const editRef = useRef<HTMLFormElement>(null);

  const onSaveEdit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await updateInventoryItem(item.id, fd);
      if (!r.ok) setError(r.error ?? "실패");
      else {
        setMode(null);
        router.refresh();
      }
    });
  };

  const doAdjust = () => {
    setError(null);
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) {
      setError("수량을 입력하세요.");
      return;
    }
    start(async () => {
      const r = await adjustStock(item.id, mode as "in" | "out", n, note);
      if (!r.ok) setError(r.error ?? "실패");
      else {
        setMode(null);
        setQty("");
        setNote("");
        router.refresh();
      }
    });
  };

  const doDelete = () => {
    if (!confirm(`'${item.item}' 품목을 삭제할까요?`)) return;
    start(async () => {
      const r = await deleteInventoryItem(item.id);
      if (!r.ok) setError(r.error ?? "실패");
      else router.refresh();
    });
  };

  if (mode === "edit") {
    return (
      <div className="card" style={{ margin: "6px 0" }}>
        <form ref={editRef} onSubmit={onSaveEdit}>
          <ItemFields item={item} brands={brands} vendors={vendors} />
          {error && <p style={{ color: "var(--owner)", fontSize: 13 }}>{error}</p>}
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button className="btn primary sm" disabled={pending}>{pending ? "저장 중..." : "저장"}</button>
            <button type="button" className="btn sm" onClick={() => { setMode(null); setError(null); }}>취소</button>
          </div>
        </form>
      </div>
    );
  }

  if (mode === "in" || mode === "out") {
    return (
      <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ fontSize: 12 }}>{mode === "in" ? "입고" : "출고"}</b>
        <input
          type="number"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder="수량"
          style={{ width: 70 }}
          autoFocus
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="메모(선택)"
          style={{ width: 100 }}
        />
        <button className="btn primary sm" disabled={pending} onClick={doAdjust}>확인</button>
        <button className="btn sm" disabled={pending} onClick={() => { setMode(null); setQty(""); setNote(""); setError(null); }}>취소</button>
        {error && <span style={{ color: "var(--owner)", fontSize: 12 }}>{error}</span>}
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", gap: 5, flexWrap: "wrap" }}>
      <button className="btn sm" disabled={pending} onClick={() => setMode("in")} title="입고">＋입고</button>
      <button className="btn sm" disabled={pending} onClick={() => setMode("out")} title="출고">－출고</button>
      <button className="btn sm" disabled={pending} onClick={() => setMode("edit")}>수정</button>
      <button className="btn sm" disabled={pending} onClick={doDelete}>삭제</button>
      {error && <span style={{ color: "var(--owner)", fontSize: 12 }}>{error}</span>}
    </span>
  );
}
