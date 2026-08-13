"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  listTodoComments,
  addTodoComment,
  deleteTodoComment,
  type TodoComment,
} from "@/app/(app)/todos/actions";

type Opt = { id: string; name: string };

function fmtWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// 업무별 댓글·멘션 스레드. 버튼을 누르면 모달로 열린다.
export default function TodoComments({
  todoId,
  title,
  users,
  count,
}: {
  todoId: string;
  title: string;
  users: Opt[];
  count?: number;
}) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<TodoComment[] | null>(null);
  const [body, setBody] = useState("");
  const [mentions, setMentions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tableMissing, setTableMissing] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const load = () => {
    start(async () => {
      const r = await listTodoComments(todoId);
      if (!r.ok) {
        setError(r.error ?? "불러오기 실패");
        setTableMissing(!!r.tableMissing);
        setComments([]);
      } else {
        setComments(r.comments ?? []);
        setError(null);
        setTableMissing(false);
      }
    });
  };

  useEffect(() => {
    if (open && comments === null) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = () => {
    if (!body.trim()) return;
    start(async () => {
      const r = await addTodoComment(todoId, body, mentions);
      if (!r.ok) {
        setError(r.error ?? "등록 실패");
        setTableMissing(!!r.tableMissing);
      } else {
        setBody("");
        setMentions([]);
        setError(null);
        load();
        router.refresh();
      }
    });
  };

  const del = (id: string) => {
    start(async () => {
      await deleteTodoComment(id);
      load();
      router.refresh();
    });
  };

  const toggleMention = (id: string) =>
    setMentions((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const n = count ?? 0;

  return (
    <>
      <button
        className="btn sm"
        onClick={() => setOpen(true)}
        title="댓글·멘션"
        style={n > 0 ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}
      >
        💬 {n > 0 ? n : ""}
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            zIndex: 1000,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card"
            style={{
              width: "100%",
              maxWidth: 520,
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              borderRadius: "16px 16px 0 0",
              margin: 0,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>💬 {title}</div>
              <button className="btn sm" onClick={() => setOpen(false)}>닫기</button>
            </div>

            {tableMissing && (
              <div className="card" style={{ borderLeft: "4px solid var(--warn, #f59e0b)", marginBottom: 10, fontSize: 12.5 }}>
                댓글 저장소가 아직 준비 안 됐습니다. 관리자에게 DB 설정(0043) 실행을 요청하세요.
              </div>
            )}

            {/* 스레드 */}
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
              {comments === null ? (
                <div className="muted" style={{ fontSize: 13 }}>불러오는 중…</div>
              ) : comments.length === 0 ? (
                <div className="empty" style={{ fontSize: 13 }}>아직 댓글이 없습니다. 첫 코멘트를 남겨보세요.</div>
              ) : (
                comments.map((c) => (
                  <div key={c.id} style={{ background: "var(--surface-2, #f3f4f6)", borderRadius: 10, padding: "8px 11px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                      <b style={{ fontSize: 13 }}>{c.authorName}</b>
                      <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                        <span className="muted" style={{ fontSize: 11 }}>{fmtWhen(c.createdAt)}</span>
                        <button
                          onClick={() => del(c.id)}
                          title="삭제"
                          style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--ink-2)", fontSize: 12 }}
                        >
                          ✕
                        </button>
                      </span>
                    </div>
                    <div style={{ fontSize: 13.5, whiteSpace: "pre-wrap", marginTop: 2 }}>{c.body}</div>
                    {c.mentionNames.length > 0 && (
                      <div style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {c.mentionNames.map((m, i) => (
                          <span key={i} className="badge accent" style={{ fontSize: 11 }}>@{m}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* 입력부 */}
            <div>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="댓글을 입력하세요…"
                rows={2}
                style={{ width: "100%", resize: "vertical" }}
              />
              {users.length > 0 && (
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", margin: "6px 0" }}>
                  <span className="muted" style={{ fontSize: 11, alignSelf: "center" }}>멘션:</span>
                  {users.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className="btn sm"
                      onClick={() => toggleMention(u.id)}
                      style={
                        mentions.includes(u.id)
                          ? { background: "var(--accent)", color: "var(--accent-ink, #fff)", borderColor: "var(--accent)", padding: "2px 8px" }
                          : { padding: "2px 8px" }
                      }
                    >
                      @{u.name}
                    </button>
                  ))}
                </div>
              )}
              {error && !tableMissing && <div style={{ color: "var(--owner)", fontSize: 12, marginBottom: 4 }}>{error}</div>}
              <div className="btn-row">
                <button className="btn primary" disabled={pending || !body.trim()} onClick={submit}>
                  {pending ? "등록 중…" : "등록"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
