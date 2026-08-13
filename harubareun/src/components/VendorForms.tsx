"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createVendor, createPO } from "@/app/(app)/vendors/actions";

type Vendor = { id: string; name: string };

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

export function VendorForm() {
  const [open, setOpen] = useState(false);
  const { error, pending, ref, onSubmit } = useSubmit(createVendor);
  if (!open)
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        거래처 등록
      </button>
    );
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <form ref={ref} onSubmit={(e) => onSubmit(e, () => setOpen(false))}>
        <div className="row">
          <label className="field">
            <span>거래처명 *</span>
            <input name="name" required />
          </label>
          <label className="field">
            <span>코드</span>
            <input name="code" placeholder="V-RB-02" />
          </label>
          <label className="field">
            <span>구분</span>
            <input name="kind" placeholder="제조/유통/물류/시딩/촬영/디자인" />
          </label>
        </div>
        <div className="row">
          <label className="field">
            <span>담당 브랜드</span>
            <input name="brand_name" />
          </label>
          <label className="field">
            <span>담당자</span>
            <input name="contact_name" />
          </label>
          <label className="field">
            <span>연락처</span>
            <input name="phone" />
          </label>
        </div>
        <div className="row">
          <label className="field">
            <span>결제조건</span>
            <input name="payment_terms" placeholder="발주 후 50/50" />
          </label>
          <label className="field">
            <span>리드타임(일)</span>
            <input name="lead_time_days" type="text" inputMode="numeric" />
          </label>
          <label className="field">
            <span>MOQ</span>
            <input name="moq" type="text" inputMode="numeric" />
          </label>
          <label className="field">
            <span>계약</span>
            <input name="contract_status" placeholder="계약/무계약/협의중" />
          </label>
        </div>
        <label className="field">
          <span>비고</span>
          <input name="note" />
        </label>
        {error && <p style={{ color: "var(--owner)", fontSize: 13 }}>{error}</p>}
        <div className="btn-row">
          <button className="btn primary" disabled={pending}>
            {pending ? "저장 중..." : "저장"}
          </button>
          <button type="button" className="btn" onClick={() => setOpen(false)}>
            취소
          </button>
        </div>
      </form>
    </div>
  );
}

export function POForm({ vendors }: { vendors: Vendor[] }) {
  const [open, setOpen] = useState(false);
  const { error, pending, ref, onSubmit } = useSubmit(createPO);
  if (!open)
    return (
      <button className="btn primary" onClick={() => setOpen(true)}>
        발주 등록
      </button>
    );
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <form ref={ref} onSubmit={(e) => onSubmit(e, () => setOpen(false))}>
        <div className="row">
          <label className="field">
            <span>발주번호</span>
            <input name="po_number" placeholder="PO-RB-260801-01" />
          </label>
          <label className="field">
            <span>발주일</span>
            <input name="po_date" type="date" />
          </label>
          <label className="field">
            <span>거래처</span>
            <select name="vendor_id" defaultValue="">
              <option value="">(선택)</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="row">
          <label className="field">
            <span>품목 *</span>
            <input name="item" required />
          </label>
          <label className="field">
            <span>발주수량</span>
            <input name="order_qty" type="text" inputMode="numeric" />
          </label>
          <label className="field">
            <span>단가(원) — 대표 확정값만</span>
            <input name="unit_price" type="text" inputMode="numeric" placeholder="비우면 확인 필요" />
          </label>
          <label className="field">
            <span>상태</span>
            <select name="status" defaultValue="발주">
              {["발주", "부분입고", "입고완료", "계산서수취", "지급완료"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>비고</span>
          <input name="note" />
        </label>
        {error && <p style={{ color: "var(--owner)", fontSize: 13 }}>{error}</p>}
        <div className="btn-row">
          <button className="btn primary" disabled={pending}>
            {pending ? "저장 중..." : "저장"}
          </button>
          <button type="button" className="btn" onClick={() => setOpen(false)}>
            취소
          </button>
        </div>
      </form>
    </div>
  );
}
