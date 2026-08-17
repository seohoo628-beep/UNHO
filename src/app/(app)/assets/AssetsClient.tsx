"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DbSetupNotice } from "@/components/DbSetupNotice";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { createAsset, createAssetsBulk, updateAsset, deleteAsset, createFolder, moveAsset, moveAssetsBulk, renameFolder, deleteFolder, type AssetInput } from "./actions";

export interface Asset extends AssetInput {
  id: string;
}

const SETUP_SQL = `create table if not exists public.product_assets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null default '이미지',
  brand text, folder text, link text, thumb_url text, note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.product_assets enable row level security;
drop policy if exists product_assets_all on public.product_assets;
create policy product_assets_all on public.product_assets for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));
create table if not exists public.asset_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null unique, created_at timestamptz not null default now()
);
alter table public.asset_folders enable row level security;
drop policy if exists asset_folders_all on public.asset_folders;
create policy asset_folders_all on public.asset_folders for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));
-- 대용량 파일 업로드 허용(3GB). 필요 시 값을 조정하세요.
update storage.buckets set file_size_limit = 3221225472 where id = 'generated-media';`;

const KINDS = ["이미지", "영상"];
const BRANDS = ["브랜드전체", "공통", "운호컴퍼니", "리앤밤", "뷰티밤", "주당의비결", "파트너사", "F&B", "하루바른", "나아", "기타"];
const empty = (folder = ""): Asset => ({ id: "", title: "", kind: "이미지", brand: "", folder, link: "", thumbUrl: "", note: "" });

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 11px", border: "1px solid var(--line-2)",
  borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--ink)",
};

const parentOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const lastSeg = (p: string) => (p.includes("/") ? p.slice(p.lastIndexOf("/") + 1) : p);

const VIDEO_RE = /\.(mp4|mov|webm|m4v|avi|mkv|ogv)$/i;
const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|bmp|heic|avif)$/i;
const PDF_RE = /\.pdf$/i;
const cleanUrl = (u: string) => (u || "").split("?")[0];
const isVideoAsset = (a: Asset) => a.kind === "영상" || VIDEO_RE.test(cleanUrl(a.link));
const isPdfAsset = (a: Asset) => PDF_RE.test(cleanUrl(a.link));
const isImageAsset = (a: Asset) => !!a.thumbUrl || IMAGE_RE.test(cleanUrl(a.link));
// 앱 안에서 바로 열어볼 수 있는 자료인지(이미지·영상·PDF).
const isViewable = (a: Asset) => !!a.link && (isVideoAsset(a) || isPdfAsset(a) || isImageAsset(a));

// 자료 다운로드: 저장소 파일은 blob으로 받아 강제 저장, 실패 시 새 탭으로 열기.
async function downloadAsset(a: Asset) {
  if (!a.link) return;
  const clean = a.link.split("?")[0];
  const urlExt = (clean.includes(".") ? clean.slice(clean.lastIndexOf(".") + 1) : "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
  const baseName = (a.title || "download").replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
  const fileName = urlExt && !baseName.toLowerCase().endsWith("." + urlExt.toLowerCase()) ? `${baseName}.${urlExt}` : baseName;
  try {
    const res = await fetch(a.link);
    if (!res.ok) throw new Error("fetch");
    const blob = await res.blob();
    const obj = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = obj; el.download = fileName;
    document.body.appendChild(el); el.click(); el.remove();
    setTimeout(() => URL.revokeObjectURL(obj), 5000);
  } catch {
    window.open(a.link, "_blank", "noopener");
  }
}

export default function AssetsClient({ rows, folders = [], dbReady, canEdit = true }: { rows: Asset[]; folders?: string[]; dbReady: boolean; canEdit?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("전체");
  const [edit, setEdit] = useState<Asset | null>(null);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const [upBusy, setUpBusy] = useState("");
  const [uploadBrand, setUploadBrand] = useState("");
  const [cwd, setCwd] = useState("");                       // 현재 폴더 경로("" = 루트)
  const [newFolder, setNewFolder] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [renaming, setRenaming] = useState<{ path: string; value: string } | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<Asset | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 폴더를 이동하면 선택 해제(안 보이는 카드가 선택된 채 남지 않도록)
  useEffect(() => { setSelected(new Set()); }, [cwd]);

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const brandOptions = useMemo(() => {
    const set = new Set<string>(BRANDS);
    rows.forEach((a) => { if (a.brand?.trim()) set.add(a.brand.trim()); });
    return Array.from(set);
  }, [rows]);

  // 모든 폴더 경로(조상 경로 포함) — 중간 폴더도 탐색 가능하게.
  const allPaths = useMemo(() => {
    const set = new Set<string>();
    const add = (p: string) => {
      const t = (p || "").trim();
      if (!t) return;
      const segs = t.split("/");
      for (let i = 1; i <= segs.length; i++) set.add(segs.slice(0, i).join("/"));
    };
    folders.forEach(add);
    rows.forEach((a) => add(a.folder || ""));
    return Array.from(set);
  }, [rows, folders]);

  const kindFiltered = useMemo(() => rows.filter((a) => kind === "전체" || a.kind === kind), [rows, kind]);
  const searching = q.trim().length > 0;
  const searchResults = useMemo(() => {
    if (!searching) return [];
    const s = q.trim().toLowerCase();
    return kindFiltered.filter((a) => (a.title + a.brand + (a.folder || "") + a.note).toLowerCase().includes(s));
  }, [kindFiltered, q, searching]);

  const subfolders = useMemo(() => allPaths.filter((p) => parentOf(p) === cwd).sort((a, b) => a.localeCompare(b, "ko")), [allPaths, cwd]);
  const assetsHere = useMemo(() => kindFiltered.filter((a) => (a.folder || "") === cwd), [kindFiltered, cwd]);
  const countUnder = (p: string) => kindFiltered.filter((a) => a.folder === p || (a.folder || "").startsWith(p + "/")).length;

  const run = (p: Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await p;
      if (!r.ok) setErr(r.error ?? "오류가 발생했습니다.");
      else { setErr(""); router.refresh(); }
    });

  const addFolder = () => {
    const nm = newFolder.trim().replace(/\//g, " ");
    if (!nm) return;
    const path = cwd ? `${cwd}/${nm}` : nm;
    setNewFolder(""); setShowNewFolder(false);
    run(createFolder(path));
  };
  // 드롭: 선택된 카드를 드래그한 경우 선택 전체를, 아니면 그 카드 하나만 이동.
  const dropTo = (folder: string, id: string) => {
    setDragOver(null);
    const ids = id && selected.has(id) ? Array.from(selected) : id ? [id] : [];
    if (!ids.length) return;
    setSelected(new Set());
    run(ids.length > 1 ? moveAssetsBulk(ids, folder) : moveAsset(ids[0], folder));
  };

  // 파일 업로드 → 현재 폴더(cwd)에 저장
  const bulkUpload = async (files: FileList) => {
    const arr = Array.from(files);
    if (!arr.length) return;
    setErr("");
    const supabase = createSupabaseBrowserClient();
    const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/generated-media/`;
    const results: AssetInput[] = [];
    let failed = 0;
    for (let i = 0; i < arr.length; i++) {
      const file = arr[i];
      setUpBusy(`업로드 중… ${i + 1}/${arr.length} (${file.name})`);
      const isVideo = file.type.startsWith("video");
      const dot = file.name.lastIndexOf(".");
      const ext = (dot >= 0 ? file.name.slice(dot + 1) : "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(0, 8);
      const rawBase = dot >= 0 ? file.name.slice(0, dot) : file.name;
      const asciiBase = rawBase.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 40) || "file";
      const rand = Math.random().toString(36).slice(2, 7);
      const path = `product-assets/${Date.now()}_${rand}_${asciiBase}${ext ? "." + ext : ""}`;
      const { error } = await supabase.storage.from("generated-media").upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (error) {
        failed++;
        const m = error.message || "";
        if (/row-level|policy|unauthor|403|not allowed|violat/i.test(m)) { setErr("업로드 권한이 없습니다. Supabase 저장소 권한 SQL을 실행해 주세요."); break; }
        if (/exceeded|maximum allowed size|payload too large|413|too large/i.test(m)) { setErr(`"${file.name}"(${(file.size / 1048576).toFixed(0)}MB)이 저장소 허용 용량을 초과했습니다. ① Supabase 대시보드 → Storage → Settings에서 'Upload file size limit'(프로젝트 전체 제한)을 올리고, ② 아래 SQL 실행:  update storage.buckets set file_size_limit = 3221225472 where id = 'generated-media';`); break; }
        continue;
      }
      const url = base + path;
      results.push({ title: (rawBase || file.name).slice(0, 80), kind: isVideo ? "영상" : "이미지", brand: uploadBrand.trim(), folder: cwd, link: url, thumbUrl: isVideo ? "" : url, note: "" });
    }
    setUpBusy("");
    if (results.length) {
      const r = await createAssetsBulk(results);
      if (!r.ok) setErr(r.error ?? "등록에 실패했습니다.");
      else { setErr(failed ? `${results.length}개 등록 완료 · ${failed}개 실패` : ""); router.refresh(); }
    } else if (!failed) setErr("업로드할 파일이 없습니다.");
  };

  if (!dbReady) {
    return (
      <div>
        <div className="page-head"><h1 style={{ margin: 0 }}>🗂 각종 자료</h1></div>
        <DbSetupNotice title="각종 자료" sql={SETUP_SQL} />
      </div>
    );
  }

  const crumbs = cwd ? cwd.split("/") : [];

  return (
    <div>
      <div className="page-head" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>🗂 각종 자료</h1>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>폴더·하위폴더로 정리하는 자료 보관함 · 카드를 폴더로 드래그해 이동{pending ? " · 저장 중…" : ""}</p>
        </div>
        {canEdit && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input list="asset-brands" value={uploadBrand} onChange={(e) => setUploadBrand(e.target.value)} placeholder="업로드 브랜드(선택)" style={{ ...inputStyle, width: 150 }} />
          <datalist id="asset-brands">{brandOptions.map((b) => <option key={b} value={b} />)}</datalist>
          <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={(e) => { if (e.target.files) bulkUpload(e.target.files); e.target.value = ""; }} />
          <button className="btn" onClick={() => fileRef.current?.click()} disabled={!!upBusy} style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}>📤 파일 올리기</button>
          <button className="btn" onClick={() => setShowNewFolder((v) => !v)}>📁 {cwd ? "새 하위폴더" : "새 폴더"}</button>
          <button className="btn" onClick={() => { setEdit(empty(cwd)); setOpen(true); }}>+ 링크로 추가</button>
        </div>
        )}
      </div>

      {canEdit && showNewFolder && (
        <div className="card" style={{ padding: 12, marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span className="muted" style={{ fontSize: 12.5 }}>{cwd ? `"${cwd}" 안에` : "루트에"} 새 폴더:</span>
          <input autoFocus value={newFolder} onChange={(e) => setNewFolder(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addFolder()} placeholder="폴더 이름" style={{ ...inputStyle, maxWidth: 220 }} />
          <button className="btn" onClick={addFolder} disabled={!newFolder.trim() || pending} style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}>만들기</button>
          <button className="btn" onClick={() => { setShowNewFolder(false); setNewFolder(""); }}>취소</button>
        </div>
      )}

      {upBusy && <div className="card" style={{ padding: 12, marginBottom: 12, fontWeight: 700, color: "var(--accent)" }}>{upBusy}</div>}
      {err && <div className="card" style={{ padding: 10, marginBottom: 12, color: "var(--owner, #b91c1c)", background: "var(--owner-bg, #fef2f2)" }}>{err}</div>}

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="전체 검색(제목·폴더·브랜드)…" style={{ ...inputStyle, maxWidth: 260 }} />
        <select value={kind} onChange={(e) => setKind(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
          {["전체", ...KINDS].map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </div>

      {searching ? (
        <>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>&ldquo;{q}&rdquo; 검색 결과 {searchResults.length}건</div>
          <CardGrid items={searchResults} canEdit={canEdit} pending={pending} showFolder onPreview={setPreview} onEdit={(a) => { setEdit(a); setOpen(true); }} onDelete={(a) => { if (confirm("삭제할까요?")) run(deleteAsset(a.id, a.link)); }} onDragStart={() => {}} />
        </>
      ) : (
        <>
          {/* 경로(브레드크럼) */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginBottom: 12, fontSize: 14 }}>
            <BreadCrumb label="🏠 전체" active={cwd === ""} onClick={() => setCwd("")} onDrop={canEdit ? (id) => dropTo("", id) : undefined} over={dragOver === "__root__"} setOver={(v) => setDragOver(v ? "__root__" : null)} />
            {crumbs.map((seg, i) => {
              const path = crumbs.slice(0, i + 1).join("/");
              return (
                <span key={path} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span className="muted">/</span>
                  <BreadCrumb label={seg} active={i === crumbs.length - 1} onClick={() => setCwd(path)} onDrop={canEdit ? (id) => dropTo(path, id) : undefined} over={dragOver === "crumb:" + path} setOver={(v) => setDragOver(v ? "crumb:" + path : null)} />
                </span>
              );
            })}
          </div>

          {/* 하위 폴더 */}
          {subfolders.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10, marginBottom: 18 }}>
              {subfolders.map((p) => {
                const over = dragOver === "f:" + p;
                const isRen = renaming?.path === p;
                return (
                  <div
                    key={p}
                    className="card"
                    onDragOver={canEdit ? (e) => { e.preventDefault(); setDragOver("f:" + p); } : undefined}
                    onDragLeave={canEdit ? () => setDragOver((v) => (v === "f:" + p ? null : v)) : undefined}
                    onDrop={canEdit ? (e) => { e.preventDefault(); dropTo(p, e.dataTransfer.getData("text/plain")); } : undefined}
                    style={{ padding: 12, cursor: "pointer", outline: over ? "2px dashed var(--accent)" : "none", background: over ? "var(--accent-bg, rgba(124,92,255,0.08))" : undefined }}
                    onClick={() => !isRen && setCwd(p)}
                  >
                    {isRen ? (
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
                        <input autoFocus value={renaming!.value} onChange={(e) => setRenaming({ path: p, value: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { run(renameFolder(p, renaming!.value)); setRenaming(null); } if (e.key === "Escape") setRenaming(null); }} style={{ ...inputStyle, padding: "5px 8px" }} />
                        <button className="btn sm" onClick={() => { run(renameFolder(p, renaming!.value)); setRenaming(null); }}>저장</button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 22 }}>🗂</span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lastSeg(p)}</div>
                          <div className="muted" style={{ fontSize: 11.5 }}>{countUnder(p)}건</div>
                        </div>
                        {canEdit && (
                          <div style={{ display: "flex", gap: 2 }} onClick={(e) => e.stopPropagation()}>
                            <button className="btn sm" title="이름 변경" onClick={() => setRenaming({ path: p, value: lastSeg(p) })}>✏️</button>
                            <button className="btn sm" title="삭제" style={{ color: "var(--owner, #b91c1c)" }} onClick={() => { if (confirm(`"${lastSeg(p)}" 폴더를 삭제할까요? (하위폴더 포함, 자료는 미분류로 이동)`)) run(deleteFolder(p)); }}>🗑</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 선택 안내 바 */}
          {canEdit && selected.size > 0 && (
            <div className="card" style={{ padding: "8px 12px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: "var(--accent-bg, rgba(124,92,255,0.08))" }}>
              <strong style={{ fontSize: 13 }}>✔ {selected.size}개 선택됨</strong>
              <span className="muted" style={{ fontSize: 12 }}>선택한 카드 중 하나를 폴더로 드래그하면 함께 이동합니다.</span>
              <button className="btn sm" style={{ marginLeft: "auto" }} onClick={() => setSelected(new Set())}>선택 해제</button>
            </div>
          )}

          {/* 현재 폴더 자료 */}
          {assetsHere.length === 0 && subfolders.length === 0 ? (
            <div className="card muted" style={{ padding: 28, textAlign: "center" }}>이 폴더에 자료가 없습니다. &lsquo;📤 파일 올리기&rsquo;로 올리거나 &lsquo;📁 새 {cwd ? "하위폴더" : "폴더"}&rsquo;를 만드세요.</div>
          ) : (
            <CardGrid items={assetsHere} canEdit={canEdit} pending={pending} selected={selected} onToggleSelect={toggleSelect} onPreview={setPreview} onEdit={(a) => { setEdit(a); setOpen(true); }} onDelete={(a) => { if (confirm("삭제할까요?")) run(deleteAsset(a.id, a.link)); }} onDragStart={(a, e) => e.dataTransfer.setData("text/plain", a.id)} />
          )}
        </>
      )}

      {open && (
        <AssetModal initial={edit} pending={pending} folderOpts={allPaths}
          onClose={() => setOpen(false)}
          onSave={(a) => { const { id, ...inp } = a; run(id ? updateAsset(id, inp) : createAsset(inp)); setOpen(false); }}
        />
      )}

      {preview && <PreviewModal a={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

function PreviewModal({ a, onClose }: { a: Asset; onClose: () => void }) {
  const url = a.link;
  const video = isVideoAsset(a);
  const pdf = isPdfAsset(a);
  const image = !video && !pdf && isImageAsset(a);
  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, background: "rgba(6,8,12,0.86)", display: "grid", placeItems: "center", zIndex: 200, padding: 16 }}>
      <div onMouseDown={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: video || pdf ? 960 : 720, maxHeight: "92vh", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, color: "#fff" }}>
          <strong style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title || "미리보기"}</strong>
          <div style={{ display: "flex", gap: 6 }}>
            {url && <a href={url} target="_blank" rel="noreferrer" className="btn sm" style={{ textDecoration: "none" }}>새 탭 ↗</a>}
            {url && <button className="btn sm" onClick={() => downloadAsset(a)}>⬇ 저장</button>}
            <button className="btn sm" onClick={onClose}>닫기 ✕</button>
          </div>
        </div>
        <div style={{ background: "#000", borderRadius: 10, overflow: "hidden", display: "grid", placeItems: "center", minHeight: 120 }}>
          {video ? (
            <video src={url} controls autoPlay playsInline style={{ width: "100%", maxHeight: "80vh", display: "block", background: "#000" }} />
          ) : pdf ? (
            <iframe src={url} title={a.title} style={{ width: "100%", height: "80vh", border: "none", background: "#fff" }} />
          ) : image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.thumbUrl || url} alt={a.title} style={{ width: "100%", maxHeight: "84vh", objectFit: "contain", display: "block" }} />
          ) : (
            <div style={{ padding: 28, color: "#fff", textAlign: "center" }}>
              이 형식은 미리보기를 지원하지 않습니다.<br />
              {url && <a href={url} target="_blank" rel="noreferrer" className="btn" style={{ marginTop: 10, textDecoration: "none", display: "inline-block" }}>새 탭에서 열기 ↗</a>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BreadCrumb({ label, active, onClick, onDrop, over, setOver }: { label: string; active: boolean; onClick: () => void; onDrop?: (id: string) => void; over: boolean; setOver: (v: boolean) => void }) {
  return (
    <button
      onClick={onClick}
      onDragOver={onDrop ? (e) => { e.preventDefault(); setOver(true); } : undefined}
      onDragLeave={onDrop ? () => setOver(false) : undefined}
      onDrop={onDrop ? (e) => { e.preventDefault(); setOver(false); onDrop(e.dataTransfer.getData("text/plain")); } : undefined}
      className={`btn sm${active ? " primary" : ""}`}
      style={{ outline: over ? "2px dashed var(--accent)" : "none" }}
    >
      {label}
    </button>
  );
}

function CardGrid({ items, canEdit, pending, showFolder, selected, onToggleSelect, onPreview, onEdit, onDelete, onDragStart }: { items: Asset[]; canEdit: boolean; pending: boolean; showFolder?: boolean; selected?: Set<string>; onToggleSelect?: (id: string) => void; onPreview?: (a: Asset) => void; onEdit: (a: Asset) => void; onDelete: (a: Asset) => void; onDragStart: (a: Asset, e: React.DragEvent) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
      {items.map((a) => {
        const isSel = !!selected?.has(a.id);
        return (
        <div key={a.id} className="card" draggable={canEdit} onDragStart={canEdit ? (e) => onDragStart(a, e) : undefined} style={{ overflow: "hidden", display: "flex", flexDirection: "column", cursor: canEdit ? "grab" : "default", outline: isSel ? "2px solid var(--accent)" : "none" }}>
          <div
            onClick={onPreview && isViewable(a) ? () => onPreview(a) : undefined}
            title={onPreview && isViewable(a) ? "눌러서 바로 보기" : undefined}
            style={{ aspectRatio: "4 / 3", background: "var(--line)", position: "relative", overflow: "hidden", cursor: onPreview && isViewable(a) ? "zoom-in" : "default" }}
          >
            {a.thumbUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.thumbUrl} alt={a.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <div style={{ display: "grid", placeItems: "center", height: "100%", fontSize: 30 }}>{isVideoAsset(a) ? "🎬" : isPdfAsset(a) ? "📄" : "🖼"}</div>
            )}
            <span style={{ position: "absolute", top: 8, left: 8, fontSize: 11, fontWeight: 700, background: "rgba(0,0,0,0.6)", color: "#fff", padding: "2px 7px", borderRadius: 6 }}>{a.kind}</span>
            {onPreview && isVideoAsset(a) && (
              <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 34, color: "#fff", textShadow: "0 1px 6px rgba(0,0,0,0.6)", pointerEvents: "none" }}>▶</span>
            )}
            {canEdit && onToggleSelect && (
              <label title="선택" onClick={(e) => e.stopPropagation()} style={{ position: "absolute", top: 6, right: 6, width: 26, height: 26, display: "grid", placeItems: "center", background: isSel ? "var(--accent)" : "rgba(0,0,0,0.5)", borderRadius: 6, cursor: "pointer" }}>
                <input type="checkbox" checked={isSel} onChange={() => onToggleSelect(a.id)} style={{ width: 15, height: 15, accentColor: "#fff", cursor: "pointer" }} />
              </label>
            )}
          </div>
          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
            <strong style={{ fontSize: 13.5, lineHeight: 1.3 }}>{a.title}</strong>
            {showFolder && a.folder && <span className="muted" style={{ fontSize: 11.5 }}>🗂 {a.folder}</span>}
            {a.brand && <span className="muted" style={{ fontSize: 12 }}>{a.brand}</span>}
            {a.note && <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{a.note}</span>}
            <div style={{ display: "flex", gap: 6, marginTop: "auto", paddingTop: 8, flexWrap: "wrap" }}>
              {onPreview && isViewable(a) && <button className="btn" style={{ ...smBtn, background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }} onClick={() => onPreview(a)} title="앱에서 바로 보기">👁 보기</button>}
              {a.link && <a href={a.link} target="_blank" rel="noreferrer" className="btn" style={{ ...smBtn, textDecoration: "none" }}>열기 ↗</a>}
              {a.link && <button className="btn" style={smBtn} onClick={() => downloadAsset(a)} title="파일 다운로드">⬇ 저장</button>}
              {canEdit && <button className="btn" style={smBtn} onClick={() => onEdit(a)}>수정</button>}
              {canEdit && <button className="btn" style={{ ...smBtn, color: "var(--owner, #b91c1c)" }} disabled={pending} onClick={() => onDelete(a)}>삭제</button>}
            </div>
          </div>
        </div>
        );
      })}
    </div>
  );
}

function AssetModal({ initial, pending, folderOpts, onClose, onSave }: { initial: Asset | null; pending: boolean; folderOpts: string[]; onClose: () => void; onSave: (a: Asset) => void }) {
  const [f, setF] = useState<Asset>(initial ?? empty());
  const set = (k: keyof Asset, v: any) => setF((p) => ({ ...p, [k]: v }));
  return (
    <div onMouseDown={onClose} style={backdrop}>
      <div className="card" onMouseDown={(e) => e.stopPropagation()} style={{ padding: 20, width: "100%", maxWidth: 480 }}>
        <h3 style={{ marginTop: 0 }}>{initial?.id ? "자료 수정" : "자료 추가"}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="제목"><input style={inputStyle} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="리앤밤 대표컷 A" /></Field>
          </div>
          <Field label="종류">
            <select style={inputStyle} value={f.kind} onChange={(e) => set("kind", e.target.value)}>
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </Field>
          <Field label="폴더 이동/변경">
            <select
              style={inputStyle}
              value={f.folder === "" || folderOpts.includes(f.folder) ? f.folder : "__custom__"}
              onChange={(e) => { if (e.target.value !== "__custom__") set("folder", e.target.value); }}
            >
              <option value="">(미분류 · 루트)</option>
              {folderOpts.map((x) => <option key={x} value={x}>{x}</option>)}
              {f.folder !== "" && !folderOpts.includes(f.folder) && <option value="__custom__">직접 입력: {f.folder}</option>}
            </select>
            <input style={{ ...inputStyle, marginTop: 6 }} value={f.folder} onChange={(e) => set("folder", e.target.value)} placeholder="또는 새 경로 직접 입력 (예: 마케팅/2026)" />
          </Field>
          <Field label="브랜드">
            <input list="asset-brands-modal" style={inputStyle} value={f.brand} onChange={(e) => set("brand", e.target.value)} />
            <datalist id="asset-brands-modal">{BRANDS.map((b) => <option key={b} value={b} />)}</datalist>
          </Field>
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="자료 링크 (구글드라이브·유튜브 등)"><input style={inputStyle} value={f.link} onChange={(e) => set("link", e.target.value)} placeholder="https://" /></Field>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="썸네일 이미지 URL (선택)"><input style={inputStyle} value={f.thumbUrl} onChange={(e) => set("thumbUrl", e.target.value)} placeholder="https://…/thumb.jpg" /></Field>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="비고"><textarea rows={2} style={{ ...inputStyle, resize: "vertical" }} value={f.note} onChange={(e) => set("note", e.target.value)} /></Field>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn" disabled={!f.title.trim() || pending} onClick={() => onSave(f)} style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}>저장</button>
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

const smBtn: React.CSSProperties = { padding: "3px 9px", fontSize: 12 };
const backdrop: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(16,20,24,0.5)", display: "grid", placeItems: "center", zIndex: 100, padding: 20 };
