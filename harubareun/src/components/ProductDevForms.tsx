"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createProductDev,
  updateProductDev,
  updateProductDevStage,
  deleteProductDev,
} from "@/app/(app)/product-dev/actions";
import AttachmentPicker from "@/components/AttachmentPicker";
import UserSelectAdd from "@/components/UserSelectAdd";
import type { ProductDevelopment } from "@/lib/types";

type Opt = { id: string; name: string };

export const PD_STAGES = ["아이디어", "기획", "샘플", "검토", "양산", "출시", "보류"];

function Fields({ pd, brands, vendors, users }: { pd?: ProductDevelopment; brands: Opt[]; vendors: Opt[]; users: Opt[] }) {
  return (
    <>
      <div className="row">
        <label className="field">
          <span>제품(개발건)명 *</span>
          <input name="name" required defaultValue={pd?.name ?? ""} />
        </label>
        <label className="field">
          <span>브랜드</span>
          <select name="brand_id" defaultValue={pd?.brand_id ?? ""}>
            <option value="">(없음)</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>카테고리</span>
          <input name="category" placeholder="식품/뷰티/생활 등" defaultValue={pd?.category ?? ""} />
        </label>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        {!pd && (
          <label className="field" style={{ marginBottom: 0 }}>
            <span>단계</span>
            <select name="stage" defaultValue="아이디어">
              {PD_STAGES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
        )}
        <label className="field" style={{ marginBottom: 0 }}>
          <span>목표 출시일</span>
          <input type="date" name="target_date" defaultValue={pd?.target_date ?? ""} />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>예상 개발비/원가</span>
          <input name="cost_estimate" type="number" defaultValue={pd?.cost_estimate ?? ""} />
        </label>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>담당자</span>
          <UserSelectAdd name="owner_user_id" users={users} defaultValue={pd?.owner_user_id ?? ""} />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>제조/개발 파트너</span>
          <select name="vendor_id" defaultValue={pd?.vendor_id ?? ""}>
            <option value="">(없음)</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>참고 링크</span>
          <input name="link" placeholder="URL" defaultValue={pd?.link ?? ""} />
        </label>
      </div>
      <label className="field" style={{ marginTop: 10 }}>
        <span>메모</span>
        <input name="note" defaultValue={pd?.note ?? ""} />
      </label>
      <div className="field" style={{ marginTop: 10 }}>
        <span>파일 첨부 (여러 개 가능)</span>
        <AttachmentPicker initial={pd?.files ?? []} />
      </div>
    </>
  );
}

export function ProductDevForm({ brands, vendors, users }: { brands: Opt[]; vendors: Opt[]; users: Opt[] }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await createProductDev(fd);
      if (!r.ok) setError(r.error ?? "실패");
      else {
        ref.current?.reset();
        setOpen(false);
        router.refresh();
      }
    });
  };

  if (!open)
    return (
      <button className="btn primary" onClick={() => setOpen(true)}>
        + 개발건 등록
      </button>
    );
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <form ref={ref} onSubmit={onSubmit}>
        <Fields brands={brands} vendors={vendors} users={users} />
        {error && <p style={{ color: "var(--owner)", fontSize: 13 }}>{error}</p>}
        <div className="btn-row" style={{ marginTop: 10 }}>
          <button className="btn primary" disabled={pending}>{pending ? "저장 중..." : "저장"}</button>
          <button type="button" className="btn" onClick={() => setOpen(false)}>취소</button>
        </div>
      </form>
    </div>
  );
}

export function StageSelect({ id, stage }: { id: string; stage: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <select
      defaultValue={stage}
      disabled={pending}
      style={{ maxWidth: 110 }}
      onChange={(e) =>
        start(async () => {
          await updateProductDevStage(id, e.target.value);
          router.refresh();
        })
      }
    >
      {PD_STAGES.map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
}

export function ProductDevRowActions({
  pd,
  brands,
  vendors,
  users,
}: {
  pd: ProductDevelopment;
  brands: Opt[];
  vendors: Opt[];
  users: Opt[];
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();

  const onSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await updateProductDev(pd.id, fd);
      if (!r.ok) setError(r.error ?? "실패");
      else {
        setEditing(false);
        router.refresh();
      }
    });
  };

  const onDelete = () => {
    if (!confirm(`'${pd.name}' 개발건을 삭제할까요?`)) return;
    start(async () => {
      const r = await deleteProductDev(pd.id);
      if (!r.ok) setError(r.error ?? "실패");
      else router.refresh();
    });
  };

  if (editing) {
    return (
      <div className="card" style={{ margin: "6px 0" }}>
        <form ref={ref} onSubmit={onSave}>
          <Fields pd={pd} brands={brands} vendors={vendors} users={users} />
          {error && <p style={{ color: "var(--owner)", fontSize: 13 }}>{error}</p>}
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button className="btn primary sm" disabled={pending}>{pending ? "저장 중..." : "저장"}</button>
            <button type="button" className="btn sm" onClick={() => { setEditing(false); setError(null); }}>취소</button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <span style={{ display: "inline-flex", gap: 5, flexWrap: "wrap" }}>
      <button className="btn sm" disabled={pending} onClick={() => setEditing(true)}>수정</button>
      <button className="btn sm" disabled={pending} onClick={onDelete}>삭제</button>
      {error && <span style={{ color: "var(--owner)", fontSize: 12 }}>{error}</span>}
    </span>
  );
}
