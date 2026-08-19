"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addNotice, updateNotice, deleteNotice, type Notice } from "@/app/(app)/todos/actions";

function fmt(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

const SETUP_SQL = `create table if not exists public.todo_notices (
  id uuid primary key default gen_random_uuid(),
  body text not null,
  pinned boolean not null default false,
  created_by uuid references public.users(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now()
);
alter table public.todo_notices enable row level security;
grant all on public.todo_notices to authenticated;
drop policy if exists todo_notices_read on public.todo_notices;
create policy todo_notices_read on public.todo_notices for select to authenticated
  using (public.current_app_role() in ('owner','staff','guest'));
drop policy if exists todo_notices_write on public.todo_notices;
create policy todo_notices_write on public.todo_notices for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));`;

export default function NoticeBoard({
  initial,
  canManage,
  tableMissing,
  loadError,
  scope = "todos",
}: {
  initial: Notice[];
  canManage: boolean;
  tableMissing?: boolean;
  loadError?: string;
  scope?: string;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [pin, setPin] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const reset = () => { setText(""); setPin(false); setAdding(false); setEditId(null); setErr(null); };

  const submit = () => {
    setErr(null);
    start(async () => {
      const r = editId ? await updateNotice(editId, text, pin, scope) : await addNotice(text, pin, scope);
      if (!r.ok) { setErr(r.error ?? "실패"); return; }
      reset();
      router.refresh();
    });
  };
  const remove = (id: string) => {
    if (!confirm("이 공지를 삭제할까요?")) return;
    start(async () => { await deleteNotice(id, scope); router.refresh(); });
  };
  const startEdit = (n: Notice) => { setEditId(n.id); setText(n.body); setPin(n.pinned); setAdding(false); setErr(null); };

  if (tableMissing || loadError) {
    if (!canManage) return null;
    return (
      <div className="card" style={{ borderLeft: "4px solid var(--warn, #f59e0b)", marginBottom: 14, padding: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>📢 공지사항 — DB 설정 필요</div>
        <p className="muted" style={{ fontSize: 12.5, margin: "0 0 8px" }}>
          아래 SQL을 Supabase → SQL Editor에 붙여넣고 <b>Run</b> 하세요. (권한 grant 포함)
        </p>
        {loadError && (
          <div style={{ fontSize: 11.5, color: "var(--owner, #b91c1c)", background: "var(--owner-bg, #fef2f2)", padding: "6px 8px", borderRadius: 6, marginBottom: 8, wordBreak: "break-word" }}>
            실제 오류: {loadError}
          </div>
        )}
        <div style={{ position: "relative" }}>
          <button
            className="btn sm"
            style={{ position: "absolute", top: 6, right: 6, zIndex: 1 }}
            onClick={() => { navigator.clipboard?.writeText(SETUP_SQL).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {}); }}
          >{copied ? "복사됨 ✓" : "SQL 복사"}</button>
          <pre style={{ maxHeight: 200, overflow: "auto", fontSize: 11, background: "var(--surface-2, #f6f7f9)", padding: "10px 12px", borderRadius: 8, margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{SETUP_SQL}</pre>
        </div>
      </div>
    );
  }

  const editorOpen = adding || editId !== null;

  return (
    <div
      className="card"
      style={{ marginBottom: 16, borderLeft: "4px solid #f59e0b", overflow: "hidden", padding: 0 }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 14px", background: "linear-gradient(120deg,#f59e0b22,#f59e0b0a)" }}>
        <div style={{ fontWeight: 800, fontSize: 14.5 }}>📢 공지사항</div>
        {canManage && !editorOpen && (
          <button className="btn sm primary" onClick={() => { setAdding(true); setText(""); setPin(false); }}>+ 공지 추가</button>
        )}
      </div>

      <div style={{ padding: "6px 14px 12px" }}>
        {editorOpen && (
          <div style={{ padding: "10px 0", borderBottom: initial.length ? "1px solid var(--line)" : "none", marginBottom: initial.length ? 6 : 0 }}>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder="전 직원에게 보이는 공지 내용을 입력하세요."
              style={{ width: "100%", fontSize: 13.5, fontFamily: "inherit", resize: "vertical" }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                <input type="checkbox" checked={pin} onChange={(e) => setPin(e.target.checked)} /> 📌 상단 고정
              </label>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                <button className="btn sm primary" onClick={submit} disabled={pending || !text.trim()}>{pending ? "저장 중…" : editId ? "수정 저장" : "등록"}</button>
                <button className="btn sm" onClick={reset} disabled={pending}>취소</button>
              </div>
            </div>
            {err && <div style={{ color: "var(--owner)", fontSize: 12, marginTop: 6 }}>{err}</div>}
          </div>
        )}

        {initial.length === 0 && !editorOpen ? (
          <div className="muted" style={{ fontSize: 13, padding: "8px 0" }}>등록된 공지가 없습니다.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {initial.map((n, idx) => (
              <div key={n.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "9px 0", borderTop: idx === 0 ? "none" : "1px solid var(--line)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {n.pinned && <span className="badge" style={{ background: "#f59e0b", color: "#fff", fontSize: 11, marginRight: 6 }}>📌 고정</span>}
                    {n.body}
                  </div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>
                    {n.author ? `${n.author} · ` : ""}{fmt(n.createdAt)}
                  </div>
                </div>
                {canManage && (
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button className="btn sm" onClick={() => startEdit(n)} disabled={pending}>수정</button>
                    <button className="btn sm" onClick={() => remove(n.id)} disabled={pending} style={{ color: "var(--owner)" }}>삭제</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
