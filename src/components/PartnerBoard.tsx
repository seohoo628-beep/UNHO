"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPartnerPost, deletePartnerPost } from "@/app/(app)/partner/actions";
import AttachmentPicker from "@/components/AttachmentPicker";

export type PartnerPost = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  files: { url: string; name: string }[] | null;
  authorId: string | null;
  authorName: string | null;
  createdAt: string;
};

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export default function PartnerBoard({ posts, canModerate, myId }: { posts: PartnerPost[]; canModerate: boolean; myId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await createPartnerPost(fd);
      if (!r.ok) { setError(r.tableMissing ? "협업 저장소가 아직 준비되지 않았습니다(DB 0049)." : r.error ?? "실패"); return; }
      ref.current?.reset();
      setOpen(false);
      router.refresh();
    });
  };

  const del = (id: string) => {
    if (!confirm("이 게시물을 삭제할까요?")) return;
    start(async () => {
      await deletePartnerPost(id);
      router.refresh();
    });
  };

  return (
    <div>
      {(
        <div style={{ marginBottom: 14 }}>
          {!open ? (
            <button className="btn primary" onClick={() => setOpen(true)}>+ 공유 올리기</button>
          ) : (
            <div className="card">
              <form ref={ref} onSubmit={submit}>
                <label className="field">
                  <span>제목 *</span>
                  <input name="title" required placeholder="예: 9월 공동 프로모션 자료" />
                </label>
                <label className="field" style={{ marginTop: 10 }}>
                  <span>내용</span>
                  <textarea name="body" rows={3} placeholder="파트너에게 전할 설명" />
                </label>
                <label className="field" style={{ marginTop: 10 }}>
                  <span>링크(선택)</span>
                  <input name="link" placeholder="URL" />
                </label>
                <div className="field" style={{ marginTop: 10 }}>
                  <span>파일 첨부(여러 개 가능)</span>
                  <AttachmentPicker />
                </div>
                {error && <p style={{ color: "var(--owner)", fontSize: 13 }}>{error}</p>}
                <div className="btn-row" style={{ marginTop: 10 }}>
                  <button className="btn primary" disabled={pending}>{pending ? "올리는 중…" : "올리기"}</button>
                  <button type="button" className="btn" onClick={() => setOpen(false)}>취소</button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {posts.length === 0 ? (
        <div className="card"><div className="empty">공유된 자료가 없습니다.</div></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {posts.map((p) => (
            <div key={p.id} className="card" style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{p.title}</div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                    {p.authorName ?? "운호컴퍼니"} · {fmt(p.createdAt)}
                  </div>
                </div>
                {(canModerate || p.authorId === myId) && (
                  <button className="btn sm" disabled={pending} onClick={() => del(p.id)} style={{ color: "var(--owner)" }}>삭제</button>
                )}
              </div>
              {p.body && <div style={{ fontSize: 14, marginTop: 8, whiteSpace: "pre-wrap" }}>{p.body}</div>}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {p.link && <a href={p.link} target="_blank" rel="noreferrer" className="btn sm">🔗 링크</a>}
                {(p.files ?? []).map((f, i) => (
                  <a key={i} href={f.url} target="_blank" rel="noreferrer" className="btn sm" title={f.name}>📎 {f.name}</a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
