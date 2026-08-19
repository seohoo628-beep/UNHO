"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createNotice, deleteNotice, togglePinNotice } from "@/app/(app)/todos/notice-actions";

export type Notice = {
  id: string;
  body: string;
  pinned: boolean;
  authorName: string | null;
  createdAt: string;
};

// 업무투두 상단 공지사항. 대표/직원이 짧은 공지를 올린다. (테이블 없으면 조용히 숨김)
export default function TodoNotices({ notices, canEdit, dbReady = true, scope = "todos" }: { notices: Notice[]; canEdit: boolean; dbReady?: boolean; scope?: string }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  if (!dbReady && notices.length === 0 && !canEdit) return null;

  const add = () => {
    if (!body.trim()) return;
    setErr(null);
    const fd = new FormData();
    fd.set("body", body.trim());
    if (pinned) fd.set("pinned", "on");
    fd.set("scope", scope);
    start(async () => {
      const r = await createNotice(fd);
      if (!r.ok) { setErr(r.error ?? "실패"); return; }
      setBody(""); setPinned(false); setOpen(false);
      router.refresh();
    });
  };

  const sorted = [...notices].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="card" style={{ marginBottom: 14, borderLeft: "4px solid var(--accent, #5b3fa8)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: sorted.length || open ? 8 : 0 }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>📢 공지사항</div>
        {canEdit && (
          <button className="btn sm" onClick={() => setOpen((v) => !v)}>{open ? "닫기" : "+ 공지 등록"}</button>
        )}
      </div>

      {open && canEdit && (
        <div style={{ marginBottom: sorted.length ? 12 : 0 }}>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            placeholder="전 직원에게 보여줄 공지를 입력하세요."
            style={{ width: "100%", resize: "vertical" }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
            <label style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 4 }}>
              <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> 상단 고정
            </label>
            <button className="btn primary sm" disabled={pending || !body.trim()} onClick={add}>
              {pending ? "등록 중..." : "등록"}
            </button>
            {err && <span style={{ color: "var(--owner)", fontSize: 12 }}>{err}</span>}
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        !open && <div className="muted" style={{ fontSize: 13 }}>등록된 공지가 없습니다.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sorted.map((n) => (
            <div key={n.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 10px", borderRadius: 8, background: n.pinned ? "var(--accent-bg, #f1eefc)" : "var(--surface-2)" }}>
              <span style={{ fontSize: 14 }}>{n.pinned ? "📌" : "•"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{n.body}</div>
                <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                  {n.authorName ?? "직원"} · {n.createdAt.slice(0, 16).replace("T", " ")}
                </div>
              </div>
              {canEdit && (
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <button
                    className="btn sm"
                    title={n.pinned ? "고정 해제" : "상단 고정"}
                    onClick={() => start(async () => { await togglePinNotice(n.id, !n.pinned); router.refresh(); })}
                  >
                    {n.pinned ? "고정해제" : "고정"}
                  </button>
                  <button
                    className="btn sm"
                    title="삭제"
                    onClick={() => start(async () => { await deleteNotice(n.id); router.refresh(); })}
                  >
                    삭제
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
