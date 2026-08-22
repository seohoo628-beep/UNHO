"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { unlockFolder } from "@/app/(app)/folder-lock-actions";

// 잠금 폴더 비밀번호 입력 화면. 통과하면 서버 쿠키가 설정되어 7일간 유지.
export default function FolderLockGate({ title }: { title: string }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const submit = () => {
    if (!pw.trim()) return;
    setErr(null);
    start(async () => {
      const r = await unlockFolder(pw);
      if (!r.ok) { setErr(r.error ?? "확인 실패"); setPw(""); return; }
      router.refresh();
    });
  };

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "50vh" }}>
      <div className="card" style={{ padding: 28, maxWidth: 360, width: "100%", textAlign: "center" }}>
        <div style={{ fontSize: 34, marginBottom: 8 }}>🔒</div>
        <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
        <p className="muted" style={{ fontSize: 13, margin: "6px 0 16px" }}>
          이 폴더는 비밀번호로 보호되어 있습니다.
        </p>
        <input
          type="password"
          inputMode="numeric"
          value={pw}
          autoFocus
          disabled={pending}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
          placeholder="비밀번호"
          style={{ textAlign: "center", letterSpacing: "0.3em", fontSize: 16 }}
        />
        {err && <div style={{ color: "var(--owner, #b91c1c)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
        <button className="btn primary" disabled={pending || !pw.trim()} onClick={submit} style={{ width: "100%", marginTop: 12 }}>
          {pending ? "확인 중…" : "열기"}
        </button>
        <p className="muted" style={{ fontSize: 11.5, marginTop: 10, marginBottom: 0 }}>한 번 입력하면 이 기기에서 7일간 유지됩니다.</p>
      </div>
    </div>
  );
}
