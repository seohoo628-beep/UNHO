"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useData } from "@fnb/lib/store";
import { Card } from "@fnb/components/ui";
import { STORES, storeName } from "@fnb/lib/stores";
import { ASSETS, SECTIONS, ORDER_CATS, type AssetItem, type AssetMap } from "@fnb/lib/assets";
import type { StoreId } from "@fnb/lib/types";
import { createLink, deleteLink } from "@/lib/storeShared";
import { uploadAsset, deleteAsset } from "@/lib/storeAssets";
import type { LinkRow, AssetFileRow } from "@/lib/storeSharedRead";

const PLATFORM = "fnb" as const;

export default function AssetsClient({ links, dbReady, files, filesReady, publicBase }: {
  links: LinkRow[]; dbReady: boolean; files: AssetFileRow[]; filesReady: boolean; publicBase: string;
}) {
  const { scope, ready } = useData();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  if (!ready) return null;

  const storeIds: StoreId[] = scope === "all" ? STORES.map((s) => s.id) : [scope];
  const run = (p: Promise<{ ok: boolean; error?: string }>) =>
    start(async () => { const r = await p; if (r.ok) { setErr(""); router.refresh(); } else setErr(r.error ?? "오류"); });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>자료실</h1>
          <p>디자인·메뉴·포스터/배너·콘텐츠 영상·기획안 직접 업로드 + 온라인 주문처 — {storeName(scope)}{pending ? " · 처리 중…" : ""}</p>
        </div>
      </div>

      {err && <div className="card card-pad" style={{ marginBottom: 12, color: "var(--red)" }}>{err}</div>}

      <div className="stack">
        {storeIds.map((sid) => (
          <StoreBlock
            key={sid}
            sid={sid}
            assets={ASSETS[sid]}
            files={files.filter((f) => f.store === sid)}
            filesReady={filesReady}
            publicBase={publicBase}
            showStore={scope === "all"}
            links={links.filter((l) => l.store === sid)}
            dbReady={dbReady}
            pending={pending}
            onUpload={(fd) => { fd.set("platform", PLATFORM); fd.set("store", sid); run(uploadAsset(fd)); }}
            onDeleteFile={(f) => run(deleteAsset(f.id, PLATFORM, f.filePath))}
            onAddLink={(l) => run(createLink({ ...l, platform: PLATFORM, store: sid }))}
            onRemoveLink={(id) => run(deleteLink(id, PLATFORM))}
          />
        ))}
      </div>
    </>
  );
}

function StoreBlock({ sid, assets, files, filesReady, publicBase, showStore, links, dbReady, pending, onUpload, onDeleteFile, onAddLink, onRemoveLink }: {
  sid: StoreId; assets?: AssetMap; files: AssetFileRow[]; filesReady: boolean; publicBase: string; showStore: boolean;
  links: LinkRow[]; dbReady: boolean; pending: boolean;
  onUpload: (fd: FormData) => void; onDeleteFile: (f: AssetFileRow) => void;
  onAddLink: (l: { cat: string; name: string; url: string; note: string }) => void; onRemoveLink: (id: string) => void;
}) {
  const [upOpen, setUpOpen] = useState(false);
  const manifestTotal = SECTIONS.reduce((n, s) => n + (assets?.[s.key]?.length ?? 0), 0);
  const totalAll = manifestTotal + files.length;

  return (
    <div className="stack">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        {showStore ? <div style={{ fontWeight: 750, fontSize: 16, minWidth: 0 }}>{STORES.find((s) => s.id === sid)?.emoji} {storeName(sid)}</div> : <div />}
        <button className="btn primary sm" style={{ flex: "0 0 auto" }} disabled={!filesReady || pending} onClick={() => setUpOpen(true)} title={filesReady ? "" : "DB 설정 필요"}>+ 자료 올리기</button>
      </div>

      {!filesReady && (
        <Card pad>
          <div className="muted" style={{ fontSize: 13 }}>파일 업로드 저장을 켜려면 DB 테이블이 필요합니다. ‘거래처관리’ 안내 SQL과 함께 <code>0025_store_assets.sql</code>을 Supabase에 실행해 주세요.</div>
        </Card>
      )}

      {SECTIONS.map((sec) => {
        const manifest = assets?.[sec.key] ?? [];
        const uploaded = files.filter((f) => f.section === sec.key);
        if (manifest.length === 0 && uploaded.length === 0) return null;
        return (
          <Card key={sec.key} title={`${sec.icon} ${sec.label}`} pad>
            <SectionBody manifest={manifest} uploaded={uploaded} publicBase={publicBase} pending={pending} onDeleteFile={onDeleteFile} />
          </Card>
        );
      })}

      {totalAll === 0 && (
        <Card pad><div className="muted" style={{ fontSize: 13.5, lineHeight: 1.6 }}>아직 자료가 없습니다. ‘+ 자료 올리기’로 디자인·메뉴·포스터·영상·문서를 올리세요.</div></Card>
      )}

      <OrderLinks links={links} dbReady={dbReady} pending={pending} onAdd={onAddLink} onRemove={onRemoveLink} />

      {upOpen && <UploadModal onClose={() => setUpOpen(false)} pending={pending} onSubmit={(fd) => { onUpload(fd); setUpOpen(false); }} />}
    </div>
  );
}

function SectionBody({ manifest, uploaded, publicBase, pending, onDeleteFile }: {
  manifest: AssetItem[]; uploaded: AssetFileRow[]; publicBase: string; pending: boolean; onDeleteFile: (f: AssetFileRow) => void;
}) {
  const mImg = manifest.filter((i) => i.kind === "image");
  const mVid = manifest.filter((i) => i.kind === "video");
  const mDoc = manifest.filter((i) => i.kind === "doc");
  const uImg = uploaded.filter((f) => f.kind === "image");
  const uVid = uploaded.filter((f) => f.kind === "video");
  const uDoc = uploaded.filter((f) => f.kind !== "image" && f.kind !== "video");

  return (
    <div className="stack">
      {(mImg.length > 0 || uImg.length > 0) && (
        <div className="grid grid-2">
          {mImg.map((m) => <ImgCard key={m.src} src={m.src} title={m.title} desc={m.desc} />)}
          {uImg.map((f) => <ImgCard key={f.id} src={publicBase + f.filePath} title={f.title} onDelete={() => onDeleteFile(f)} pending={pending} />)}
        </div>
      )}
      {(mVid.length > 0 || uVid.length > 0) && (
        <div className="grid grid-3">
          {mVid.map((v) => <VidCard key={v.src} src={v.src} title={v.title} />)}
          {uVid.map((f) => <VidCard key={f.id} src={publicBase + f.filePath} title={f.title} onDelete={() => onDeleteFile(f)} pending={pending} />)}
        </div>
      )}
      {mDoc.map((d) => <DocRow key={d.src} src={d.src} title={d.title} desc={d.desc} />)}
      {uDoc.map((f) => <DocRow key={f.id} src={publicBase + f.filePath} title={f.title} onDelete={() => onDeleteFile(f)} pending={pending} />)}
    </div>
  );
}

function ImgCard({ src, title, desc, onDelete, pending }: { src: string; title: string; desc?: string; onDelete?: () => void; pending?: boolean }) {
  return (
    <div>
      <a href={src} target="_blank" rel="noreferrer" style={{ display: "block" }}>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", background: "var(--surface-2)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={title} style={{ width: "100%", display: "block" }} />
        </div>
      </a>
      <div className="row between" style={{ marginTop: 8 }}>
        <div><div style={{ fontWeight: 600 }}>{title}</div>{desc && <div className="muted" style={{ fontSize: 12 }}>{desc}</div>}</div>
        {onDelete && <button className="btn sm" style={{ color: "var(--red)" }} disabled={pending} onClick={onDelete}>삭제</button>}
      </div>
    </div>
  );
}

function VidCard({ src, title, onDelete, pending }: { src: string; title: string; onDelete?: () => void; pending?: boolean }) {
  return (
    <div>
      <video src={src} controls preload="metadata" playsInline style={{ width: "100%", borderRadius: 10, background: "#000", maxHeight: 460 }} />
      <div className="row between" style={{ marginTop: 8 }}>
        <div style={{ fontWeight: 600 }}>{title}</div>
        {onDelete && <button className="btn sm" style={{ color: "var(--red)" }} disabled={pending} onClick={onDelete}>삭제</button>}
      </div>
    </div>
  );
}

function DocRow({ src, title, desc, onDelete, pending }: { src: string; title: string; desc?: string; onDelete?: () => void; pending?: boolean }) {
  return (
    <div className="row between" style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
      <div className="row" style={{ gap: 12 }}>
        <span style={{ fontSize: 24 }}>📄</span>
        <div><div style={{ fontWeight: 600 }}>{title}</div>{desc && <div className="muted" style={{ fontSize: 12 }}>{desc}</div>}</div>
      </div>
      <div className="row" style={{ gap: 6 }}>
        <a className="btn primary sm" href={src} download target="_blank" rel="noreferrer">⬇ 다운로드</a>
        {onDelete && <button className="btn sm" style={{ color: "var(--red)" }} disabled={pending} onClick={onDelete}>삭제</button>}
      </div>
    </div>
  );
}

function UploadModal({ onClose, onSubmit, pending }: { onClose: () => void; onSubmit: (fd: FormData) => void; pending: boolean }) {
  const [section, setSection] = useState(SECTIONS[0].key);
  const submit = () => {
    const form = document.getElementById("asset-up-form") as HTMLFormElement;
    const fd = new FormData(form);
    fd.set("section", section);
    onSubmit(fd);
  };
  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, background: "rgba(16,24,40,0.5)", display: "grid", placeItems: "center", zIndex: 100, padding: 20 }}>
      <div className="card card-pad" onMouseDown={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 460 }}>
        <h3 style={{ marginTop: 0 }}>자료 올리기</h3>
        <form id="asset-up-form" onSubmit={(e) => e.preventDefault()}>
          <div className="stack">
            <div><div className="form-label">분류</div>
              <select className="field" value={section} onChange={(e) => setSection(e.target.value)}>
                {SECTIONS.map((s) => <option key={s.key} value={s.key}>{s.icon} {s.label}</option>)}
              </select>
            </div>
            <div><div className="form-label">제목(선택)</div><input className="field" name="title" placeholder="비우면 파일명 사용" /></div>
            <div><div className="form-label">파일 (이미지·영상·문서 · 50MB 이하)</div><input type="file" name="file" /></div>
          </div>
        </form>
        <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn primary" disabled={pending} onClick={submit}>{pending ? "업로드 중…" : "업로드"}</button>
        </div>
      </div>
    </div>
  );
}

function OrderLinks({ links, dbReady, pending, onAdd, onRemove }: {
  links: LinkRow[]; dbReady: boolean; pending: boolean;
  onAdd: (l: { cat: string; name: string; url: string; note: string }) => void; onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const grouped = useMemo(() => { const m: Record<string, LinkRow[]> = {}; for (const l of links) (m[l.cat] ??= []).push(l); return m; }, [links]);
  return (
    <Card title="🔗 온라인 주문처 (유니폼·명찰·비품·기물)" action={dbReady ? <button className="btn primary sm" onClick={() => setOpen(true)}>+ 주문처 추가</button> : null} pad>
      {!dbReady && <div className="muted" style={{ fontSize: 13 }}>온라인 주문처 공유 저장을 켜려면 DB 테이블이 필요합니다(거래처관리 안내 SQL).</div>}
      {dbReady && links.length === 0 && <div className="muted" style={{ fontSize: 13 }}>등록된 주문처가 없습니다.</div>}
      <div className="stack">
        {ORDER_CATS.filter((c) => grouped[c]?.length).map((c) => (
          <div key={c}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{c}</div>
            <div className="stack">
              {grouped[c].map((l) => (
                <div key={l.id} className="row between" style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ minWidth: 0 }}>
                    <a href={normalizeUrl(l.url)} target="_blank" rel="noreferrer" style={{ fontWeight: 600, color: "var(--brand)" }}>{l.name} ↗</a>
                    <div className="muted" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.url}{l.note ? ` · ${l.note}` : ""}</div>
                  </div>
                  <button className="btn sm" style={{ color: "var(--red)" }} disabled={pending} onClick={() => onRemove(l.id)}>삭제</button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {open && <LinkModal onClose={() => setOpen(false)} onSave={(l) => { onAdd(l); setOpen(false); }} pending={pending} />}
    </Card>
  );
}

function normalizeUrl(u: string): string { if (!u) return "#"; return /^https?:\/\//i.test(u) ? u : "https://" + u; }

function LinkModal({ onClose, onSave, pending }: { onClose: () => void; onSave: (l: { cat: string; name: string; url: string; note: string }) => void; pending: boolean }) {
  const [f, setF] = useState({ cat: "유니폼", name: "", url: "", note: "" });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const field: React.CSSProperties = { width: "100%", padding: "9px 11px", border: "1px solid var(--border-strong)", borderRadius: 8, background: "var(--surface)", color: "var(--text)" };
  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, background: "rgba(16,24,40,0.5)", display: "grid", placeItems: "center", zIndex: 100, padding: 20 }}>
      <div className="card card-pad" onMouseDown={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 440 }}>
        <h3 style={{ marginTop: 0 }}>온라인 주문처 추가</h3>
        <div className="stack">
          <div><div className="form-label">분류</div><select className="field" value={f.cat} onChange={(e) => set("cat", e.target.value)}>{ORDER_CATS.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div><div className="form-label">이름(업체·용도)</div><input style={field} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="예: 유니폼 제작 A사" /></div>
          <div><div className="form-label">주문 사이트 URL</div><input style={field} value={f.url} onChange={(e) => set("url", e.target.value)} placeholder="예: www.example.com" /></div>
          <div><div className="form-label">비고(선택)</div><input style={field} value={f.note} onChange={(e) => set("note", e.target.value)} /></div>
        </div>
        <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn primary" disabled={!f.name.trim() || !f.url.trim() || pending} onClick={() => onSave(f)}>저장</button>
        </div>
      </div>
    </div>
  );
}
