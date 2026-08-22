"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createSupabaseBrowserClient();

    const { error: signErr } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (signErr) {
      setLoading(false);
      setError("이메일 또는 비밀번호가 올바르지 않습니다.");
      return;
    }

    // 등록된 사용자 확인 + 최초 로그인 시 auth_id 연결
    let ok = false;
    let reason = "";
    try {
      const res = await fetch("/api/auth/session-link", { method: "POST" });
      const json = await res.json();
      ok = !!json.ok;
      reason = json.error ?? "";
    } catch {
      ok = false;
    }

    setLoading(false);
    if (!ok) {
      await supabase.auth.signOut();
      setError(
        reason === "no-account"
          ? "등록되지 않은 계정입니다. 관리자에게 문의하세요."
          : "로그인에 실패했습니다. 다시 시도하세요."
      );
      return;
    }

    router.push("/"); // 루트에서 역할별 랜딩(대표=CEO 투두, 그 외=홈)으로 분기
    router.refresh();
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/unho-logo.svg" alt="(주)운호컴퍼니 UNHO COMPANY" style={{ display: "block", width: "100%", maxWidth: 360, margin: "0 auto 18px" }} />
        <h1 style={{ fontSize: 20 }}>운호컴퍼니 운영 플랫폼</h1>
        <p className="muted" style={{ marginTop: 6, marginBottom: 20 }}>
          등록된 이메일과 비밀번호로 로그인합니다.
        </p>

        <form onSubmit={onSubmit}>
          <label className="field">
            <span>이메일</span>
            <input
              type="email"
              required
              value={email}
              placeholder="name@unhocompany.com"
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            <span>비밀번호</span>
            <input
              type="password"
              required
              value={password}
              placeholder="비밀번호"
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button className="btn primary" style={{ width: "100%" }} disabled={loading}>
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>

        {error && (
          <p className="muted" style={{ color: "var(--owner)", marginTop: 12 }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
