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

export default function NoticeBoard({
  initial,
  canManage,
  tableMissing,
}: {
  initial: Notice[];
  canManage: boolean;
  tableMissing?: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [pin, setPin] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const reset = () => { setText(""); setPin(false); setAdding(false); setEditId(null); setErr(null); };

  const submit = () => {
    setErr(null);
    start(async () => {
      const r = editId ? await updateNotice(editId, text, pin) : await addNotice(text, pin);
      if (!r.ok) { setErr(r.error ?? "실패"); return; }
      reset();
      router.refresh();
    });
  };
  const remove = (id: string) => {
    if (!confirm("이 공지를 삭제할까요?")) return;
    start(async () => { await deleteNotice(id); router.refresh(); });
  };
  const startEdit = (n: Notice) => { setEditId(n.id); setText(n.body); setPin(n.pinned); setAdding(false); setErr(null); };

  if (tableMissing) {
    if (!canManage) return null;
    return (
      <div className="card" style={{ borderLeft: "4px solid var(--warn, #f59e0b)", marginBottom: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>📢 공지사항 — DB 설정 필요</div>
        <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
          Supabase → SQL Editor에서 마이그레이션 <code>0076_todo_notices.sql</code>을 실행하면 공지 기능이 켜집니다.
        </p>
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
