"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateBrand } from "@/app/(app)/brands/actions";
import type { Brand } from "@/lib/types";

function Swatch({ hex, label }: { hex: string | null; label: string }) {
  return (
    <div className="swatch">
      <div className="chip" style={{ background: hex ?? "#eee" }} />
      <div className="meta">
        <b>{label}</b>
        <span className="mono">{hex ?? "-"}</span>
      </div>
    </div>
  );
}

export default function BrandCard({
  brand,
  corpName,
  canEdit,
}: {
  brand: Brand;
  corpName: string;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateBrand(fd);
      if (!res.ok) setError(res.error ?? "저장 실패");
      else {
        setEditing(false);
        router.refresh();
      }
    });
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div>
          <strong style={{ fontSize: 16 }}>{brand.name}</strong>{" "}
          <span className="badge">{brand.slug}</span>{" "}
          <span className="badge">{corpName}</span>{" "}
          {brand.vi_confirmed === "확정" ? (
            <span className="badge ok">VI 확정</span>
          ) : (
            <span className="badge warn">VI 제안</span>
          )}{" "}
          {brand.ai_enabled ? (
            <span className="badge accent">AI 생성 대상</span>
          ) : (
            <span className="badge">AI 제외</span>
          )}
        </div>
        {canEdit && !editing && (
          <button className="btn sm" onClick={() => setEditing(true)}>
            편집
          </button>
        )}
      </div>

      {!editing ? (
        <>
          <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
            {brand.category ?? "-"} · 규제: {brand.regulation ?? "-"}
          </div>
          {brand.tone && (
            <div style={{ marginTop: 8, fontSize: 14 }}>{brand.tone}</div>
          )}
          <div className="swatches">
            <Swatch hex={brand.vi_primary} label="주색" />
            <Swatch hex={brand.vi_secondary} label="보조" />
            <Swatch hex={brand.vi_accent} label="강조" />
            <Swatch hex={brand.vi_bg} label="배경" />
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            서체: {brand.font_ko} / {brand.font_en}
            {brand.note ? ` · ${brand.note}` : ""}
          </div>
        </>
      ) : (
        <form onSubmit={onSubmit} style={{ marginTop: 12 }}>
          <input type="hidden" name="id" value={brand.id} />
          <div className="row">
            <label className="field">
              <span>카테고리</span>
              <input type="text" name="category" defaultValue={brand.category ?? ""} />
            </label>
            <label className="field">
              <span>대표 제품</span>
              <input type="text" name="flagship" defaultValue={brand.flagship ?? ""} />
            </label>
            <label className="field">
              <span>채널</span>
              <input type="text" name="channel" defaultValue={brand.channel ?? ""} />
            </label>
          </div>
          <label className="field">
            <span>표시광고 규제 근거</span>
            <input type="text" name="regulation" defaultValue={brand.regulation ?? ""} />
          </label>
          <label className="field">
            <span>톤 3줄</span>
            <textarea name="tone" defaultValue={brand.tone ?? ""} />
          </label>
          <div className="row">
            <label className="field">
              <span>주색 HEX</span>
              <input type="text" name="vi_primary" defaultValue={brand.vi_primary ?? ""} />
            </label>
            <label className="field">
              <span>보조색 HEX</span>
              <input type="text" name="vi_secondary" defaultValue={brand.vi_secondary ?? ""} />
            </label>
            <label className="field">
              <span>강조색 HEX</span>
              <input type="text" name="vi_accent" defaultValue={brand.vi_accent ?? ""} />
            </label>
            <label className="field">
              <span>배경 HEX</span>
              <input type="text" name="vi_bg" defaultValue={brand.vi_bg ?? ""} />
            </label>
          </div>
          <label className="field">
            <span>비고</span>
            <input type="text" name="note" defaultValue={brand.note ?? ""} />
          </label>
          <div className="row" style={{ alignItems: "center" }}>
            <label className="field" style={{ marginBottom: 0 }}>
              <span>VI 확정 여부</span>
              <select name="vi_confirmed" defaultValue={brand.vi_confirmed}>
                <option value="제안">제안</option>
                <option value="확정">확정</option>
              </select>
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", flex: 1 }}>
              <input
                type="checkbox"
                name="ai_enabled"
                defaultChecked={brand.ai_enabled}
                style={{ width: "auto" }}
              />
              <span>AI 자동 생성 대상</span>
            </label>
          </div>

          {error && <p style={{ color: "var(--owner)", fontSize: 13 }}>{error}</p>}
          <div className="btn-row">
            <button className="btn primary" disabled={pending}>
              {pending ? "저장 중..." : "저장"}
            </button>
            <button type="button" className="btn" onClick={() => setEditing(false)}>
              취소
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
