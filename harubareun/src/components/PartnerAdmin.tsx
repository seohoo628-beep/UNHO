"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPartnerCompany, assignGuestPartner, updatePartnerCompanyEmail } from "@/app/(app)/partner/actions";
import type { Company } from "@/components/PartnerBoard";

export type GuestRow = { id: string; name: string | null; email: string | null; partnerId: string | null };

export default function PartnerAdmin({ companies, guests }: { companies: Company[]; guests: GuestRow[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const addCompany = () => {
    const nm = name.trim();
    if (!nm) return;
    setError(null);
    start(async () => {
      const r = await createPartnerCompany(nm, email);
      if (!r.ok) { setError(r.error ?? "실패"); return; }
      setName("");
      setEmail("");
      router.refresh();
    });
  };

  const saveEmail = (id: string, value: string) => {
    start(async () => {
      const r = await updatePartnerCompanyEmail(id, value);
      if (!r.ok) setError(r.error ?? "실패");
      router.refresh();
    });
  };

  const [copied, setCopied] = useState<string | null>(null);
  const copyInvite = async (companyName: string, email: string | null) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://unho.vercel.app";
    const msg =
      `[하루바른·나아 파트너 협업] ${companyName}\n` +
      `접속: ${origin}/login\n` +
      (email ? `이메일: ${email}\n` : "") +
      `비밀번호는 담당자가 별도로 전달드립니다. 로그인 후 '파트너 협업' 폴더에서 자료를 주고받으실 수 있습니다.`;
    try {
      await navigator.clipboard.writeText(msg);
      setCopied(email ?? companyName);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setError("복사에 실패했습니다. 브라우저 권한을 확인하세요.");
    }
  };

  const assign = (userId: string, partnerId: string) => {
    start(async () => {
      const r = await assignGuestPartner(userId, partnerId || null);
      if (!r.ok) setError(r.error ?? "실패");
      router.refresh();
    });
  };

  return (
    <div style={{ marginTop: 24 }}>
      <button
        className="btn"
        onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", justifyContent: "space-between", display: "flex", alignItems: "center", background: "var(--surface)" }}
      >
        <span>⚙️ 파트너 회사·게스트 관리</span>
        <span className="muted" style={{ fontSize: 12 }}>{open ? "접기 ▲" : "펼치기 ▼"}</span>
      </button>

      {open && (
        <div className="card" style={{ marginTop: 8 }}>
          {/* 회사 추가 */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="새 파트너 회사명"
              style={{ flex: 1, minWidth: 140, padding: "8px 11px", border: "1px solid var(--line-2)", borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--ink)" }}
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCompany(); } }}
              placeholder="연락 이메일(선택)"
              style={{ flex: 1, minWidth: 160, padding: "8px 11px", border: "1px solid var(--line-2)", borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--ink)" }}
            />
            <button className="btn primary" disabled={pending || !name.trim()} onClick={addCompany}>+ 회사 추가</button>
          </div>

          {error && <div style={{ color: "var(--owner)", fontSize: 12, marginBottom: 8 }}>{error}</div>}

          {/* 회사 목록 + 이메일 편집 */}
          <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>등록된 회사 ({companies.length})</div>
          {companies.length === 0 ? (
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>아직 없습니다. 회사를 먼저 추가하세요.</div>
          ) : (
            <table className="tbl" style={{ marginBottom: 14 }}>
              <thead><tr><th>회사</th><th>연락 이메일 (새 글 알림 수신)</th></tr></thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>
                      <input
                        defaultValue={c.email ?? ""}
                        placeholder="이메일 입력 후 저장"
                        onBlur={(e) => { if ((e.target.value.trim().toLowerCase()) !== (c.email ?? "")) saveEmail(c.id, e.target.value); }}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        style={{ width: "100%", minWidth: 160, padding: "5px 9px", border: "1px solid var(--line-2)", borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--ink)" }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* 게스트 배정 */}
          <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>게스트 계정 회사 배정 ({guests.length})</div>
          {guests.length === 0 ? (
            <div className="muted" style={{ fontSize: 12.5 }}>게스트 계정이 없습니다. 담당자 관리에서 게스트 계정을 먼저 만드세요.</div>
          ) : (
            <table className="tbl">
              <thead><tr><th>게스트</th><th>소속 회사</th><th>접속 링크</th></tr></thead>
              <tbody>
                {guests.map((g) => {
                  const compName = companies.find((c) => c.id === g.partnerId)?.name ?? "파트너";
                  return (
                  <tr key={g.id}>
                    <td>{g.name ?? "-"}<div className="muted" style={{ fontSize: 11 }}>{g.email}</div></td>
                    <td>
                      <select
                        defaultValue={g.partnerId ?? ""}
                        disabled={pending}
                        onChange={(e) => assign(g.id, e.target.value)}
                        style={{ padding: "5px 9px", border: "1px solid var(--line-2)", borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--ink)" }}
                      >
                        <option value="">(미배정)</option>
                        {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                    <td>
                      <button className="btn sm" onClick={() => copyInvite(compName, g.email)}>
                        {copied === g.email ? "복사됨 ✓" : "🔗 링크 복사"}
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
