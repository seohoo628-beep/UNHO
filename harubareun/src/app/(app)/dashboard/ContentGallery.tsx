"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadContent, deleteContent } from "./actions";

export type GalleryItem = {
  id: string;
  brand: string | null;
  category: string;
  title: string | null;
  url: string;
  path: string;
  fileName: string | null;
  mime: string | null;
  uploader: string | null;
  createdAt: string;
};

const CATEGORIES = ["브랜딩", "광고", "SNS", "상세페이지", "기타"];
const CAT_STYLE: Record<string, { bg: string; fg: string }> = {
  브랜딩: { bg: "rgba(99,102,241,.16)", fg: "#a5b4fc" },
  광고: { bg: "rgba(236,72,153,.16)", fg: "#f472b6" },
  SNS: { bg: "rgba(45,212,191,.16)", fg: "#2dd4bf" },
  상세페이지: { bg: "rgba(245,158,11,.16)", fg: "#fbbf24" },
  기타: { bg: "rgba(148,163,184,.14)", fg: "#94a3b8" },
};

function isImage(mime: string | null, url: string) {
  if (mime) return mime.startsWith("image/");
  return /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(url);
}

function Uploader({ brands }: { brands: { id: string; name: string }[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await uploadContent(fd);
      if (!res.ok) setError(res.error ?? "업로드 실패");
      else { ref.current?.reset(); router.refresh(); }
    });
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <form ref={ref} onSubmit={onSubmit}>
        <div className="row" style={{ alignItems: "end", flexWrap: "wrap", gap: 10 }}>
          <label className="field" style={{ marginBottom: 0 }}>
            <span>브랜드</span>
            <select name="brand_id" defaultValue="">
              <option value="">공통</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="field" style={{ marginBottom: 0 }}>
            <span>구분</span>
            <select name="category" defaultValue="브랜딩">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="field" style={{ marginBottom: 0, flex: 1, minWidth: 160 }}>
            <span>설명(선택)</span>
            <input name="title" placeholder="예) 여름 프로모션 키비주얼" />
          </label>
          <label className="field" style={{ marginBottom: 0, flex: 2, minWidth: 200 }}>
            <span>파일 (이미지·영상·PDF)</span>
            <input type="file" name="file" accept="image/*,video/*,.pdf" required />
          </label>
          <div style={{ flex: "0 0 auto" }}>
            <button className="btn primary" disabled={pending}>{pending ? "업로드 중..." : "업로드"}</button>
          </div>
        </div>
        {error && <p style={{ color: "var(--owner)", fontSize: 13, marginTop: 8 }}>{error}</p>}
      </form>
    </div>
  );
}

function DeleteButton({ id, path }: { id: string; path: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button className="btn sm" disabled={pending}
      onClick={() => { if (confirm("이 콘텐츠를 삭제할까요?")) start(async () => { await deleteContent(id, path); router.refresh(); }); }}
      style={{ flex: 1, justifyContent: "center" }}>
      삭제
    </button>
  );
}

export default function ContentGallery({ items, brands, canEdit }: { items: GalleryItem[]; brands: { id: string; name: string }[]; canEdit: boolean }) {
  const [cat, setCat] = useState<string>("전체");
  const cats = ["전체", ...CATEGORIES.filter((c) => items.some((i) => i.category === c))];
  const filtered = cat === "전체" ? items : items.filter((i) => i.category === cat);
  const dl = (url: string, name: string) => `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(name)}`;

  return (
    <div>
      {canEdit && <Uploader brands={brands} />}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {cats.map((c) => (
          <button key={c} className="btn sm" onClick={() => setCat(c)}
            style={{ fontWeight: 700, ...(cat === c ? { background: "var(--accent, #6366f1)", color: "#fff" } : {}) }}>
            {c}{c !== "전체" && <span style={{ opacity: .7 }}> {items.filter((i) => i.category === c).length}</span>}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card"><div className="empty">아직 업로드된 콘텐츠가 없습니다. 디자이너가 만든 브랜딩·광고 콘텐츠를 위에서 업로드하세요.</div></div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
          {filtered.map((it) => {
            const cs = CAT_STYLE[it.category] ?? CAT_STYLE.기타;
            const img = isImage(it.mime, it.url);
            return (
              <div key={it.id} className="card" style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                <a href={it.url} target="_blank" rel="noreferrer" title="원본 열기" style={{ display: "block" }}>
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.url} alt={it.title ?? "콘텐츠"} style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: 8, border: "1px solid var(--line-2)", display: "block" }} />
                  ) : (
                    <div style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: 8, border: "1px solid var(--line-2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, background: "rgba(148,163,184,.08)" }}>
                      {(it.mime ?? "").startsWith("video/") ? "🎬" : "📄"}
                    </div>
                  )}
                </a>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ background: cs.bg, color: cs.fg, borderRadius: 999, padding: "1px 7px", fontSize: 10.5, fontWeight: 800 }}>{it.category}</span>
                  {it.brand && <span className="muted" style={{ fontSize: 10.5, fontWeight: 700 }}>{it.brand}</span>}
                </div>
                {it.title && <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.3 }}>{it.title}</div>}
                <div className="muted" style={{ fontSize: 10.5 }}>{it.uploader ?? ""}{it.uploader ? " · " : ""}{it.createdAt}</div>
                <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
                  <a className="btn sm" href={dl(it.url, it.fileName || `${it.brand || "content"}.jpg`)} style={{ flex: 1, justifyContent: "center" }}>⬇ 다운로드</a>
                  {canEdit && <DeleteButton id={it.id} path={it.path} />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
