"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DbSetupNotice } from "@/components/DbSetupNotice";
import { createAccount, updateAccount, deleteAccount, type AccountInput } from "./actions";

export interface Account extends AccountInput {
  id: string;
}

const SETUP_SQL = `create table if not exists public.app_accounts (
  id uuid primary key default gen_random_uuid(),
  service text not null, purpose text,
  login_id text, password text, url text, note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.app_accounts enable row level security;
drop policy if exists app_accounts_all on public.app_accounts;
create policy app_accounts_all on public.app_accounts for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));`;

const empty = (): Account => ({ id: "", service: "", purpose: "", loginId: "", password: "", url: "", note: "" });

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  border: "1px solid var(--line-2)",
  borderRadius: "var(--radius)",
  background: "var(--surface)",
  color: "var(--ink)",
};

export default function AccountsClient({ rows, dbReady }: { rows: Account[]; dbReady: boolean }) {
  return dbReady ? (
    <Board rows={rows} />
  ) : (
    <>
      <div className="page-head">
        <h1 style={{ margin: 0 }}>계정 ID·PW</h1>
      </div>
      <DbSetupNotice title="계정 ID·PW" sql={SETUP_SQL} />
    </>
  );
}

function Board({ rows }: { rows: Account[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Account | null>(null);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const [reveal, setReveal] = useState<Record<string, boolean>>({});

  const list = useMemo(
    () => rows.filter((a) => !q || (a.service + a.purpose + a.loginId + a.note).toLowerCase().includes(q.toLowerCase())),
    [rows, q]
  );

  const run = (p: Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await p;
      if (!r.ok) setErr(r.error ?? "오류가 발생했습니다.");
      else {
        setErr("");
        router.refresh();
      }
    });

  const copy = (t: string) => navigator.clipboard?.writeText(t).catch(() => {});

  return (
    <>
      <div className="page-head" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>🔒 계정 ID·PW</h1>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
            운영 계정 자격증명 {rows.length}건 · <span style={{ color: "var(--ink-2)" }}>내부용 · 평문 저장</span>
            {pending ? " · 저장 중…" : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => { setEdit(null); setOpen(true); }} style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}>+ 계정 추가</button>
        </div>
      </div>

      {err && <div className="card" style={{ padding: 10, marginBottom: 12, color: "var(--owner, #b91c1c)", background: "var(--owner-bg, #fef2f2)" }}>{err}</div>}

      <div style={{ marginBottom: 14 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="서비스·용도·ID 검색…" style={{ ...inputStyle, maxWidth: 280 }} />
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 820 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--ink-2)" }}>
              <th style={th}>서비스</th>
              <th style={th}>용도</th>
              <th style={th}>ID</th>
              <th style={th}>PW</th>
              <th style={th}>URL</th>
              <th style={th}>비고</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr><td colSpan={7} className="muted" style={{ padding: 24, textAlign: "center" }}>등록된 계정이 없습니다. ‘+ 계정 추가’로 등록하세요.</td></tr>
            )}
            {list.map((a) => (
              <tr key={a.id} style={{ borderTop: "1px solid var(--line)" }}>
                <td style={{ ...td, fontWeight: 600 }}>{a.service}</td>
                <td style={{ ...td, color: "var(--ink-2)" }}>{a.purpose || "-"}</td>
                <td style={td}>
                  {a.loginId ? (
                    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                      <code style={codeStyle}>{a.loginId}</code>
                      <button className="btn" style={xsBtn} onClick={() => copy(a.loginId)} title="복사">⧉</button>
                    </span>
                  ) : "-"}
                </td>
                <td style={td}>
                  {a.password ? (
                    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                      <code style={codeStyle}>{reveal[a.id] ? a.password : "••••••"}</code>
                      <button className="btn" style={xsBtn} onClick={() => setReveal((r) => ({ ...r, [a.id]: !r[a.id] }))} title={reveal[a.id] ? "숨기기" : "보기"}>{reveal[a.id] ? "🙈" : "👁"}</button>
                      <button className="btn" style={xsBtn} onClick={() => copy(a.password)} title="복사">⧉</button>
                    </span>
                  ) : "-"}
                </td>
                <td style={{ ...td, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.url ? <a href={a.url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>바로가기 ↗</a> : "-"}
                </td>
                <td style={{ ...td, color: "var(--ink-2)", maxWidth: 200 }}>{a.note || "-"}</td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>
                  <button className="btn" style={smBtn} onClick={() => { setEdit(a); setOpen(true); }}>수정</button>{" "}
                  <button className="btn" style={{ ...smBtn, color: "var(--owner, #b91c1c)" }} disabled={pending} onClick={() => run(deleteAccount(a.id))}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        ⚠️ 비밀번호는 평문으로 저장됩니다(간이 금고). 실서비스 자격증명 관리에는 전용 비밀번호 관리자 사용을 권장합니다.
      </p>

      {open && (
        <AccountModal
          initial={edit}
          pending={pending}
          onClose={() => setOpen(false)}
          onSave={(a) => {
            const { id, ...inp } = a;
            run(id ? updateAccount(id, inp) : createAccount(inp));
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function AccountModal({ initial, pending, onClose, onSave }: { initial: Account | null; pending: boolean; onClose: () => void; onSave: (a: Account) => void }) {
  const [f, setF] = useState<Account>(initial ?? empty());
  const set = (k: keyof Account, v: any) => setF((p) => ({ ...p, [k]: v }));
  return (
    <div onMouseDown={onClose} style={backdrop}>
      <div className="card" onMouseDown={(e) => e.stopPropagation()} style={{ padding: 20, width: "100%", maxWidth: 480 }}>
        <h3 style={{ marginTop: 0 }}>{initial ? "계정 수정" : "계정 추가"}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="서비스명"><input style={inputStyle} value={f.service} onChange={(e) => set("service", e.target.value)} placeholder="스마트스토어" /></Field>
          <Field label="용도"><input style={inputStyle} value={f.purpose} onChange={(e) => set("purpose", e.target.value)} placeholder="리앤밤 판매채널" /></Field>
          <Field label="ID"><input style={inputStyle} value={f.loginId} onChange={(e) => set("loginId", e.target.value)} /></Field>
          <Field label="PW"><input style={inputStyle} value={f.password} onChange={(e) => set("password", e.target.value)} /></Field>
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="URL"><input style={inputStyle} value={f.url} onChange={(e) => set("url", e.target.value)} placeholder="https://" /></Field>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="비고"><textarea rows={2} style={{ ...inputStyle, resize: "vertical" }} value={f.note} onChange={(e) => set("note", e.target.value)} /></Field>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn" disabled={!f.service.trim() || pending} onClick={() => onSave(f)} style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}>저장</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginBottom: 4, fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

const th: React.CSSProperties = { padding: "10px 12px", fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.03em", fontWeight: 700 };
const td: React.CSSProperties = { padding: "10px 12px", verticalAlign: "top" };
const smBtn: React.CSSProperties = { padding: "3px 9px", fontSize: 12 };
const xsBtn: React.CSSProperties = { padding: "1px 6px", fontSize: 11 };
const codeStyle: React.CSSProperties = { fontSize: 12.5, background: "var(--line)", padding: "2px 6px", borderRadius: 5 };
const backdrop: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(16,20,24,0.5)", display: "grid", placeItems: "center", zIndex: 100, padding: 20 };
