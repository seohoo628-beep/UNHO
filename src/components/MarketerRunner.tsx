"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Brand = { id: string; name: string };

export default function MarketerRunner({ brands }: { brands: Brand[] }) {
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [promo, setPromo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  async function run(all: boolean) {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch("/api/agents/marketer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(all ? { all: true } : { brandId, promo }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErr(json.error ?? "실행 실패");
      } else if (all) {
        const r = json.results as { status: string }[];
        const q = r.filter((x) => x.status === "queued").length;
        const b = r.filter((x) => x.status === "blocked").length;
        setMsg(`전체 실행 완료 — 승인 큐 ${q}건, 검수 미통과 ${b}건.`);
      } else {
        const s = json.result?.status;
        const reason = json.result?.reason as string | undefined;
        if (s === "queued") {
          setMsg("생성·검수 통과. 승인 큐에 올라갔습니다.");
        } else if (s === "blocked") {
          setMsg("생성됐지만 규제 검수에서 막혔습니다. 아래 목록에서 지적 문구를 확인하세요.");
        } else if (s === "skipped") {
          setMsg("자동 생성 제외 브랜드입니다.");
        } else {
          setErr(`실행 실패: ${reason ?? s ?? "알 수 없는 오류"}`);
        }
      }
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "실행 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="row" style={{ alignItems: "end" }}>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>브랜드</span>
          <select value={brandId} onChange={(e) => setBrandId(e.target.value)}>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ marginBottom: 0, flex: 2 }}>
          <span>진행 중 프로모션 (선택)</span>
          <input
            type="text"
            value={promo}
            onChange={(e) => setPromo(e.target.value)}
            placeholder="예: 8월 1+1 기획전"
          />
        </label>
        <div style={{ flex: "0 0 auto", display: "flex", gap: 8 }}>
          <button className="btn primary" disabled={busy || !brandId} onClick={() => run(false)}>
            {busy ? "실행 중..." : "수동 실행"}
          </button>
          <button className="btn" disabled={busy} onClick={() => run(true)}>
            전체 실행
          </button>
        </div>
      </div>
      {msg && (
        <p className="badge ok" style={{ marginTop: 12, padding: "8px 12px" }}>
          {msg}
        </p>
      )}
      {err && (
        <p style={{ color: "var(--owner)", fontSize: 13, marginTop: 12 }}>{err}</p>
      )}
    </div>
  );
}
