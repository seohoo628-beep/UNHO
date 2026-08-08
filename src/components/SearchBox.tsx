"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SearchBox({ initial = "", autoFocus }: { initial?: string; autoFocus?: boolean }) {
  const [q, setQ] = useState(initial);
  const router = useRouter();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = q.trim();
    if (v) router.push(`/search?q=${encodeURIComponent(v)}`);
  };

  return (
    <form onSubmit={submit} style={{ display: "flex", gap: 8 }}>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus={autoFocus}
        placeholder="업무·미팅·거래처·제품 등 전체 검색…"
        style={{
          flex: 1,
          padding: "9px 12px",
          border: "1px solid var(--line-2)",
          borderRadius: "var(--radius)",
          background: "var(--surface)",
          color: "var(--ink)",
          fontSize: 14,
        }}
      />
      <button className="btn primary" type="submit">검색</button>
    </form>
  );
}
