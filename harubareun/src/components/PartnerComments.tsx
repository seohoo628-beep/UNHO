"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { listPartnerComments, addPartnerComment, deletePartnerComment, type PartnerComment } from "@/app/(app)/partner/actions";

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export default function PartnerComments({ postId, title, count, myId, canModerate }: { postId: string; title: string; count: number; myId: string; canModerate: boolean }) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<PartnerComment[] | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const load = () => {
    start(async () => {
      const r = await listPartnerComments(postId);
      if (r.ok) { setComments(r.comments ?? []); setError(null); }
      else setError(r.error ?? "불러오기 실패");
    });
  };

  useEffect(() => {
    if (open && comments === null) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = () => {
    if (!body.trim()) return;
    start(async () => {
      const r = await addPartnerComment(postId, body);
      if (!r.ok) { setError(r.error ?? "등록 실패"); return; }
      setBody("");
      setError(null);
      load();
      router.refresh();
    });
  };

  const del = (id: string) => {
    start(async () => {
      await deletePartnerComment(id);
      load();
      router.refresh();
    });
  };

  return (
    <>
      <button className="btn sm" onClick={() => setOpen(true)} style={count > 0 ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}>
        💬 {count > 0 ? count : ""}
      </button>

      {open && (
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: "100%", maxWidth: 520, maxHeight: "85vh", display: "flex", flexDirection: "column", borderRadius: "16px 16px 0 0", margin: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>💬 {title}</div>
              <button className="btn sm" onClick={() => setOpen(false)}>닫기</button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
              {comments === null ? (
                <div className="muted" style={{ fontSize: 13 }}>불러오는 중…</div>
              ) : comments.length === 0 ? (
                <div className="empty" style={{ fontSize: 13 }}>첫 댓글을 남겨보세요.</div>
              ) : (
                comments.map((c) => (
                  <div key={c.id} style={{ background: "var(--surface-2, #f3f4f6)", borderRadius: 10, padding: "8px 11px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                      <b style={{ fontSize: 13 }}>{c.authorName}</b>
                      <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                        <span className="muted" style={{ fontSize: 11 }}>{fmt(c.createdAt)}</span>
                        {(canModerate || c.authorId === myId) && (
                          <button onClick={() => del(c.id)} title="삭제" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--ink-2)", fontSize: 12 }}>✕</button>
                        )}
                      </span>
                    </div>
                    <div style={{ fontSize: 13.5, whiteSpace: "pre-wrap", marginTop: 2 }}>{c.body}</div>
                  </div>
                ))
              )}
            </div>

            <div>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="댓글을 입력하세요…" rows={2} style={{ width: "100%", resize: "vertical" }} />
              {error && <div style={{ color: "var(--owner)", fontSize: 12, margin: "4px 0" }}>{error}</div>}
              <div className="btn-row" style={{ marginTop: 6 }}>
                <button className="btn primary" disabled={pending || !body.trim()} onClick={submit}>{pending ? "등록 중…" : "등록"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
