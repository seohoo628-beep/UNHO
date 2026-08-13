"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { hasStoreAccess, unlockStore } from "@/lib/storeAuth";

// 매장 공개 페이지 상단에 표시되는 잠금 바.
// 로그인 owner/staff이거나 접근코드가 이미 입력됐으면 아무것도 보이지 않는다.
// 그 외(익명)에는 코드 입력 바를 보여 쓰기 기능을 열 수 있게 한다.
export default function StoreUnlockGate() {
  const [state, setState] = useState<"checking" | "locked" | "open">("checking");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  useEffect(() => {
    let alive = true;
    hasStoreAccess()
      .then((ok) => alive && setState(ok ? "open" : "locked"))
      .catch(() => alive && setState("locked"));
    return () => {
      alive = false;
    };
  }, []);

  if (state !== "locked") return null;

  function submit() {
    setErr(null);
    start(async () => {
      const r = await unlockStore(code);
      if (!r.ok) {
        setErr(r.error ?? "실패");
        return;
      }
      setState("open");
      router.refresh();
    });
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        padding: "10px 14px",
        margin: "0 0 12px",
        borderRadius: 10,
        background: "#fff7ed",
        border: "1px solid #fdba74",
        color: "#7c2d12",
        fontSize: 13,
      }}
    >
      <span>🔒 열람만 가능합니다. 편집하려면 로그인하거나 매장 접근코드를 입력하세요.</span>
      <input
        type="password"
        value={code}
        placeholder="접근코드"
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #fdba74", fontSize: 13 }}
      />
      <button
        onClick={submit}
        disabled={pending || !code.trim()}
        style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: "#ea580c", color: "#fff", cursor: "pointer", fontSize: 13 }}
      >
        {pending ? "확인 중…" : "잠금 해제"}
      </button>
      {err && <span style={{ color: "#b91c1c" }}>{err}</span>}
    </div>
  );
}
