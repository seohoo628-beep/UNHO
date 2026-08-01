"use client";

import { useEffect, useState } from "react";

// 로그인 이후 특정 폴더를 비밀번호로 한 번 더 가리는 간단 잠금.
// 클라이언트 검증(세션 유지). 민감정보 금고급 보안은 아님.
export function LockGate({
  storageKey,
  password,
  heading = "잠긴 폴더",
  children,
}: {
  storageKey: string;
  password: string;
  heading?: string;
  children: (lock: () => void) => React.ReactNode;
}) {
  const [unlocked, setUnlocked] = useState(false);
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(storageKey) === "1") setUnlocked(true);
    } catch {
      /* ignore */
    }
    setReady(true);
  }, [storageKey]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pw === password) {
      try {
        sessionStorage.setItem(storageKey, "1");
      } catch {
        /* ignore */
      }
      setUnlocked(true);
    } else {
      setErr(true);
      setPw("");
    }
  };

  const lock = () => {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
    setUnlocked(false);
    setPw("");
  };

  if (!ready) return null;
  if (unlocked) return <>{children(lock)}</>;

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "60vh" }}>
      <form onSubmit={submit} className="card" style={{ padding: 28, width: "100%", maxWidth: 360, textAlign: "center" }}>
        <div style={{ fontSize: 34 }}>🔒</div>
        <h2 style={{ margin: "10px 0 4px" }}>{heading}</h2>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          비밀번호를 입력하세요
        </p>
        <input
          autoFocus
          type="password"
          inputMode="numeric"
          value={pw}
          onChange={(e) => {
            setPw(e.target.value);
            setErr(false);
          }}
          placeholder="● ● ● ●"
          style={{
            width: "100%",
            padding: "11px 12px",
            fontSize: 18,
            textAlign: "center",
            letterSpacing: 4,
            border: `1px solid ${err ? "var(--owner)" : "var(--line-2)"}`,
            borderRadius: "var(--radius)",
            background: "var(--surface)",
            color: "var(--ink)",
            marginBottom: 10,
          }}
        />
        {err && <div style={{ color: "var(--owner)", fontSize: 12.5, marginBottom: 10 }}>비밀번호가 올바르지 않습니다.</div>}
        <button type="submit" className="btn" style={{ width: "100%", background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}>
          잠금 해제
        </button>
      </form>
    </div>
  );
}
