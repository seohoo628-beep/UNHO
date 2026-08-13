"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadProductShot, deleteProductShot } from "@/app/(app)/library/actions";

export function ShotUploader({ brands }: { brands: { id: string; name: string }[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await uploadProductShot(fd);
      if (!res.ok) setError(res.error ?? "업로드 실패");
      else {
        ref.current?.reset();
        router.refresh();
      }
    });
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <form ref={ref} onSubmit={onSubmit}>
        <div className="row" style={{ alignItems: "end" }}>
          <label className="field" style={{ marginBottom: 0 }}>
            <span>브랜드</span>
            <select name="brand_id" defaultValue="">
              <option value="">선택</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ marginBottom: 0 }}>
            <span>설명(선택)</span>
            <input name="label" placeholder="정면컷 / 성분컷 / 사용장면" />
          </label>
          <label className="field" style={{ marginBottom: 0, flex: 2 }}>
            <span>제품컷 이미지</span>
            <input type="file" name="file" accept="image/*" required />
          </label>
          <div style={{ flex: "0 0 auto" }}>
            <button className="btn primary" disabled={pending}>
              {pending ? "업로드 중..." : "업로드"}
            </button>
          </div>
        </div>
        {error && <p style={{ color: "var(--owner)", fontSize: 13, marginTop: 8 }}>{error}</p>}
      </form>
    </div>
  );
}

export function DeleteShotButton({ id, path }: { id: string; path: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      className="btn sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await deleteProductShot(id, path);
          router.refresh();
        })
      }
      style={{ marginTop: 4 }}
    >
      삭제
    </button>
  );
}
