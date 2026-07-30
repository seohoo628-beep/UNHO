"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${siteUrl}/auth/callback` },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <h1 style={{ fontSize: 20 }}>운호컴퍼니 운영 플랫폼</h1>
        <p className="muted" style={{ marginTop: 6, marginBottom: 20 }}>
          등록된 이메일로 로그인 링크를 보냅니다.
        </p>

        {sent ? (
          <div className="badge ok" style={{ padding: "10px 14px" }}>
            {email} 로 로그인 링크를 보냈습니다. 메일함을 확인하세요.
          </div>
        ) : (
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
            <button className="btn primary" style={{ width: "100%" }} disabled={loading}>
              {loading ? "전송 중..." : "로그인 링크 받기"}
            </button>
          </form>
        )}

        {error && (
          <p className="muted" style={{ color: "var(--owner)", marginTop: 12 }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
