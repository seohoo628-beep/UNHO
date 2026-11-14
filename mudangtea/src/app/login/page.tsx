"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const NOTICE: Record<string, string> = {
  "no-account": "등록되지 않은 계정입니다. 운호 플랫폼 관리자에게 계정 등록을 요청하세요.",
  forbidden: "이 화면은 재무 열람 권한이 있는 대표·직원 계정만 볼 수 있습니다.",
};

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const notice = NOTICE[useSearchParams().get("e") ?? ""];

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { error: signErr } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (signErr) {
      setLoading(false);
      const status = (signErr as { status?: number }).status;
      const isCredential = status === 400 || /invalid login credentials|invalid_credentials/i.test(signErr.message || "");
      setError(isCredential ? "이메일 또는 비밀번호가 올바르지 않습니다." : "로그인 서버에 연결할 수 없습니다. 잠시 후 다시 시도하세요.");
      return;
    }
    // 등록 사용자 확인 + 최초 로그인 시 auth_id 연결(운호 플랫폼과 같은 users 표)
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
      setError(reason === "no-account" ? NOTICE["no-account"] : "로그인에 실패했습니다. 다시 시도하세요.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="login-card">
      <div className="login-mark">무당티</div>
      <h1>유통 관리</h1>
      <p className="muted" style={{ margin: "6px 0 22px", fontSize: 13 }}>
        운호 플랫폼과 같은 이메일·비밀번호로 로그인합니다.
      </p>
      {notice && !error && <div className="login-alert">{notice}</div>}
      {error && <div className="login-alert">{error}</div>}
      <form onSubmit={onSubmit}>
        <label className="field">
          <span>이메일</span>
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>비밀번호</span>
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button className="btn primary" type="submit" disabled={loading} style={{ width: "100%", marginTop: 6 }}>
          {loading ? "확인 중" : "로그인"}
        </button>
      </form>
      <p className="muted" style={{ margin: "18px 0 0", fontSize: 12, textAlign: "center" }}>㈜운호컴퍼니 내부 전용</p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="login-wrap">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
