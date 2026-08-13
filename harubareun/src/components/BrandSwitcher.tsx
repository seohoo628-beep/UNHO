"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setBrandScope } from "@/app/(app)/brand-actions";

type Opt = { slug: string; name: string };

// 전역 브랜드 선택 버튼(전체 / 하루바른 / 나아). 선택은 쿠키에 저장되고 새로고침으로 반영.
export default function BrandSwitcher({ brands, current }: { brands: Opt[]; current: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const opts: Opt[] = [{ slug: "all", name: "전체" }, ...brands];

  const pick = (slug: string) => {
    if (slug === current || pending) return;
    start(async () => {
      await setBrandScope(slug);
      router.refresh();
    });
  };

  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        padding: 4,
        margin: "0 0 10px",
        border: "1px solid var(--line)",
        borderRadius: 10,
        background: "var(--surface-2)",
        opacity: pending ? 0.6 : 1,
      }}
      role="group"
      aria-label="브랜드 선택"
    >
      {opts.map((o) => {
        const active = o.slug === current;
        return (
          <button
            key={o.slug}
            onClick={() => pick(o.slug)}
            style={{
              flex: 1,
              padding: "6px 4px",
              fontSize: 12,
              fontWeight: 800,
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              background: active ? "var(--accent, #5b3fa8)" : "transparent",
              color: active ? "#fff" : "var(--ink-2, #6b7280)",
            }}
          >
            {o.name}
          </button>
        );
      })}
    </div>
  );
}
