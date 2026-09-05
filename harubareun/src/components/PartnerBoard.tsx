"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPartnerPost, deletePartnerPost } from "@/app/(app)/partner/actions";
import AttachmentPicker from "@/components/AttachmentPicker";
import PartnerComments from "@/components/PartnerComments";

export type Company = { id: string; name: string; email?: string | null };

export type PartnerPost = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  files: { url: string; name: string }[] | null;
  partnerId: string | null;
  authorId: string | null;
  authorName: string | null;
  createdAt: string;
  commentCount: number;
};

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export default function PartnerBoard({
  posts,
  canModerate,
  myId,
  isGuest,
  companies,
  selectedCompanyId,
  myPartnerName,
}: {
  posts: PartnerPost[];
  canModerate: boolean;
  myId: string;
  isGuest: boolean;
  companies: Company[];
  selectedCompanyId?: string;
  myPartnerName?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const companyName = (id: string | null) => (id ? companies.find((c) => c.id === id)?.name ?? "-" : "공통");

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    // 직원·대표는 선택된 회사로 태그(게스트는 서버에서 자기 회사로 강제)
    if (!isGuest && selectedCompanyId) fd.set("partner_id", selectedCompanyId);
    start(async () => {
      const r = await createPartnerPost(fd);
      if (!r.ok) { setError(r.tableMissing ? "협업 저장소가 아직 준비되지 않았습니다(DB 0049/0050)." : r.error ?? "실패"); return; }
      ref.current?.reset();
      setOpen(false);
      router.refresh();
    });
  };

  const del = (id: string) => {
    start(async () => {
      await deletePartnerPost(id);
      router.refresh();
    });
  };

  const canPost = isGuest ? !!myPartnerName : true; // 게스트는 회사 배정돼야 글쓰기
  const needCompany = !isGuest && !selectedCompanyId; // 직원은 회사 선택해야 정확히 태그

  return (
    <div>
      {/* 직원·대표: 회사(방) 선택 */}
      {!isGuest && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <span className="muted" style={{ fontSize: 13 }}>보는 회사(방):</span>
          <select
            value={selectedCompanyId ?? ""}
            onChange={(e) => router.push(`/partner${e.target.value ? `?c=${e.target.value}` : ""}`)}
            style={{ padding: "6px 10px", border: "1px solid var(--line-2)", borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--ink)" }}
          >
            <option value="">전체 보기</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}
      {isGuest && (
        <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
          우리 회사 방: <b style={{ color: "var(--ink)" }}>{myPartnerName ?? "미배정"}</b>
          {!myPartnerName && " — 관리자에게 회사 배정을 요청하세요."}
        </div>
      )}

      {canPost && (
        <div style={{ marginBottom: 14 }}>
          {!open ? (
            <button className="btn primary" onClick={() => setOpen(true)} disabled={needCompany} title={needCompany ? "먼저 회사(방)를 선택하세요" : ""}>
              + 공유 올리기{needCompany ? " (회사 선택 필요)" : ""}
            </button>
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
                  <div style={{ fontWeight: 700, fontSize: 15, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    {p.title}
                    {!isGuest && <span className="badge" style={{ fontSize: 10.5 }}>{companyName(p.partnerId)}</span>}
                  </div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                    {p.authorName ?? "하루바른·나아"} · {fmt(p.createdAt)}
                  </div>
                </div>
                {(canModerate || p.authorId === myId) && (
                  <button className="btn sm" disabled={pending} onClick={() => del(p.id)} style={{ color: "var(--owner)" }}>삭제</button>
                )}
              </div>
              {p.body && <div style={{ fontSize: 14, marginTop: 8, whiteSpace: "pre-wrap" }}>{p.body}</div>}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
                {p.link && <a href={p.link} target="_blank" rel="noreferrer" className="btn sm">🔗 링크</a>}
                {(p.files ?? []).map((f, i) => (
                  <a key={i} href={f.url} target="_blank" rel="noreferrer" className="btn sm" title={f.name}>📎 {f.name}</a>
                ))}
                <PartnerComments postId={p.id} title={p.title} count={p.commentCount} myId={myId} canModerate={canModerate} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
