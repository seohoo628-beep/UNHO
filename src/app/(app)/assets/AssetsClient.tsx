"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DbSetupNotice } from "@/components/DbSetupNotice";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { createAsset, createAssetsBulk, updateAsset, deleteAsset, createFolder, moveAsset, type AssetInput } from "./actions";

export interface Asset extends AssetInput {
  id: string;
}

const SETUP_SQL = `create table if not exists public.product_assets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null default '이미지',
  brand text, link text, thumb_url text, note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.product_assets enable row level security;
drop policy if exists product_assets_all on public.product_assets;
create policy product_assets_all on public.product_assets for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));`;

const KINDS = ["이미지", "영상"];
const BRANDS = ["리앤밤", "뷰티밤", "주당의비결", "슈퍼릴라", "신미집", "대운목장", "청담 오리닭", "엣지라인"];
const empty = (): Asset => ({ id: "", title: "", kind: "이미지", brand: "", folder: "", link: "", thumbUrl: "", note: "" });

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  border: "1px solid var(--line-2)",
  borderRadius: "var(--radius)",
  background: "var(--surface)",
  color: "var(--ink)",
};

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
  const [uploadFolder, setUploadFolder] = useState("");
  const [folderFilter, setFolderFilter] = useState("전체");
  const [newFolder, setNewFolder] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const brandOptions = useMemo(() => {
    const set = new Set<string>(BRANDS);
    rows.forEach((a) => { if (a.brand?.trim()) set.add(a.brand.trim()); });
    return Array.from(set);
  }, [rows]);

  const folderOptions = useMemo(() => {
    const set = new Set<string>(folders);
    rows.forEach((a) => { if (a.folder?.trim()) set.add(a.folder.trim()); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [rows, folders]);

  const addFolder = () => {
    const nm = newFolder.trim();
    if (!nm) return;
    setNewFolder("");
    setShowNewFolder(false);
    setUploadFolder(nm);
    run(createFolder(nm));
  };
  const dropTo = (folder: string, id: string) => {
    setDragOver(null);
    if (id) run(moveAsset(id, folder));
  };

  // 이미지·영상 파일 여러 개를 한 번에 업로드 (브라우저 → Supabase Storage 직접)
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
        if (/row-level|policy|unauthor|403|not allowed|violat/i.test(m)) {
          setErr("업로드 권한이 없습니다. Supabase에서 저장소 권한 SQL(0024_storage_meetings.sql)을 한 번 실행해 주세요.");
          break;
        }
        if (/exceeded|maximum allowed size|payload too large|413|too large/i.test(m)) {
          setErr(`"${file.name}" 파일이 저장소 허용 용량을 초과했습니다. Supabase → Storage → generated-media 버킷의 'File size limit'을 올리거나(대용량 영상은 유튜브·드라이브 링크로 등록 권장) 작은 파일로 올려주세요.`);
          break;
        }
        continue;
      }
      const url = base + path;
      results.push({ title: (rawBase || file.name).slice(0, 80), kind: isVideo ? "영상" : "이미지", brand: uploadBrand.trim(), folder: uploadFolder.trim(), link: url, thumbUrl: isVideo ? "" : url, note: "" });
    }
    setUpBusy("");
    if (results.length) {
      const r = await createAssetsBulk(results);
      if (!r.ok) setErr(r.error ?? "등록에 실패했습니다.");
      else {
        setErr(failed ? `${results.length}개 등록 완료 · ${failed}개 실패` : "");
        router.refresh();
      }
    } else if (!failed) {
      setErr("업로드할 파일이 없습니다.");
    }
  };

  const list = useMemo(
    () =>
      rows.filter(
        (a) =>
          (kind === "전체" || a.kind === kind) &&
          (folderFilter === "전체" || (a.folder?.trim() || "미분류") === folderFilter) &&
          (!q || (a.title + a.brand + (a.folder || "") + a.note).toLowerCase().includes(q.toLowerCase()))
      ),
    [rows, q, kind, folderFilter]
  );

  // 폴더별 그룹핑 (전체 보기일 땐 빈 폴더도 섹션으로 노출 → 드롭 대상)
  const grouped = useMemo(() => {
    const byFolder = new Map<string, Asset[]>();
    if (folderFilter === "전체") for (const f of folderOptions) byFolder.set(f, []);
    for (const a of list) {
      const key = a.folder?.trim() || "미분류";
      if (!byFolder.has(key)) byFolder.set(key, []);
      byFolder.get(key)!.push(a);
    }
    return Array.from(byFolder.keys())
      .sort((a, b) => {
        if (a === "미분류") return 1;
        if (b === "미분류") return -1;
        return a.localeCompare(b, "ko");
      })
      .map((folder) => ({ folder, items: byFolder.get(folder)! }));
  }, [list, folderOptions, folderFilter]);

  const run = (p: Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await p;
      if (!r.ok) setErr(r.error ?? "오류가 발생했습니다.");
      else {
        setErr("");
        router.refresh();
      }
    });

  if (!dbReady) {
    return (
      <div>
        <div className="page-head">
          <h1 style={{ margin: 0 }}>🗂 각종 자료</h1>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>각종 자료(이미지·영상·문서) 보관함.</p>
        </div>
        <DbSetupNotice title="각종 자료" sql={SETUP_SQL} />
      </div>
    );
  }

  return (
    <div>
      <div className="page-head" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>🗂 각종 자료</h1>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
            자료 {rows.length}건 · 이미지·영상 파일 업로드 + 링크 보관 · <span style={{ color: "var(--ok, #16a34a)" }}>DB 공유</span>
            {pending ? " · 저장 중…" : ""}
          </p>
        </div>
        {canEdit && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            list="asset-folders"
            value={uploadFolder}
            onChange={(e) => setUploadFolder(e.target.value)}
            placeholder="📁 폴더 선택/새 폴더 입력"
            style={{ ...inputStyle, width: 190 }}
          />
          <datalist id="asset-folders">{folderOptions.map((f) => <option key={f} value={f} />)}</datalist>
          <input
            list="asset-brands"
            value={uploadBrand}
            onChange={(e) => setUploadBrand(e.target.value)}
            placeholder="업로드 브랜드(선택)"
            style={{ ...inputStyle, width: 150 }}
          />
          <datalist id="asset-brands">{brandOptions.map((b) => <option key={b} value={b} />)}</datalist>
          {/* accept 미지정 → 안드로이드에서 포토 앱뿐 아니라 '내 파일·다운로드·드라이브·컴퓨터'까지 선택 가능 */}
          <input
            ref={fileRef}
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={(e) => { if (e.target.files) bulkUpload(e.target.files); e.target.value = ""; }}
          />
          <button className="btn" onClick={() => fileRef.current?.click()} disabled={!!upBusy} style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}>
            📤 파일 올리기{uploadBrand.trim() ? ` · ${uploadBrand.trim()}` : ""}
          </button>
          <button className="btn" onClick={() => setShowNewFolder((v) => !v)}>📁 새 폴더</button>
          <button className="btn" onClick={() => { setEdit(null); setOpen(true); }}>+ 링크로 추가</button>
        </div>
        )}
      </div>

      {canEdit && showNewFolder && (
        <div className="card" style={{ padding: 12, marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            autoFocus
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addFolder()}
            placeholder="새 폴더 이름"
            style={{ ...inputStyle, maxWidth: 240 }}
          />
          <button className="btn" onClick={addFolder} disabled={!newFolder.trim() || pending} style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}>만들기</button>
          <button className="btn" onClick={() => { setShowNewFolder(false); setNewFolder(""); }}>취소</button>
        </div>
      )}

      {upBusy && (
        <div className="card" style={{ padding: 12, marginBottom: 12, fontWeight: 700, color: "var(--accent)", background: "var(--surface-2, rgba(124,92,255,0.08))" }}>
          {upBusy}
        </div>
      )}
      {err && <div className="card" style={{ padding: 10, marginBottom: 12, color: "var(--owner, #b91c1c)", background: "var(--owner-bg, #fef2f2)" }}>{err}</div>}

      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="제목·폴더·브랜드 검색…" style={{ ...inputStyle, maxWidth: 260 }} />
        <select value={kind} onChange={(e) => setKind(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
          {["전체", ...KINDS].map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </div>
      {(folderOptions.length > 0) && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
          {["전체", ...folderOptions, "미분류"].map((f) => (
            <button key={f} className={`btn sm${folderFilter === f ? " primary" : ""}`} onClick={() => setFolderFilter(f)}>
              {f === "전체" ? "전체 폴더" : `🗂 ${f}`}
            </button>
          ))}
        </div>
      )}

      {list.length === 0 ? (
        <div className="card muted" style={{ padding: 28, textAlign: "center" }}>자료가 없습니다. ‘📤 파일 여러 개 올리기’로 이미지·영상을 한 번에 올리거나 ‘+ 링크로 추가’ 하세요.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {grouped.map((g) => {
            const dropFolder = g.folder === "미분류" ? "" : g.folder;
            const isOver = dragOver === g.folder;
            return (
            <div
              key={g.folder}
              onDragOver={canEdit ? (e) => { e.preventDefault(); setDragOver(g.folder); } : undefined}
              onDragLeave={canEdit ? () => setDragOver((v) => (v === g.folder ? null : v)) : undefined}
              onDrop={canEdit ? (e) => { e.preventDefault(); dropTo(dropFolder, e.dataTransfer.getData("text/plain")); } : undefined}
              style={{ borderRadius: 12, padding: isOver ? 8 : 0, outline: isOver ? "2px dashed var(--accent)" : "none", background: isOver ? "var(--accent-bg, rgba(124,92,255,0.06))" : "transparent", transition: "padding .1s" }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "0 2px 10px", borderBottom: "2px solid var(--line)", paddingBottom: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 800 }}>🗂 {g.folder}</span>
                <span className="muted" style={{ fontSize: 12 }}>{g.items.length}건</span>
                {canEdit && <span className="muted" style={{ fontSize: 11, marginLeft: "auto" }}>여기로 드래그해 이동</span>}
              </div>
              {g.items.length === 0 ? (
                <div className="muted" style={{ fontSize: 12.5, padding: "14px 2px" }}>빈 폴더입니다. 자료를 여기로 드래그하세요.</div>
              ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
                {g.items.map((a) => (
                  <div
                    key={a.id}
                    className="card"
                    draggable={canEdit}
                    onDragStart={canEdit ? (e) => e.dataTransfer.setData("text/plain", a.id) : undefined}
                    style={{ overflow: "hidden", display: "flex", flexDirection: "column", cursor: canEdit ? "grab" : "default" }}
                  >
              <div style={{ aspectRatio: "4 / 3", background: "var(--line)", position: "relative", overflow: "hidden" }}>
                {a.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.thumbUrl} alt={a.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ display: "grid", placeItems: "center", height: "100%", fontSize: 30 }}>{a.kind === "영상" ? "🎬" : "🖼"}</div>
                )}
                <span style={{ position: "absolute", top: 8, left: 8, fontSize: 11, fontWeight: 700, background: "rgba(0,0,0,0.6)", color: "#fff", padding: "2px 7px", borderRadius: 6 }}>{a.kind}</span>
              </div>
              <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
                <strong style={{ fontSize: 13.5, lineHeight: 1.3 }}>{a.title}</strong>
                {a.brand && <span className="muted" style={{ fontSize: 12 }}>{a.brand}</span>}
                {a.note && <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{a.note}</span>}
                <div style={{ display: "flex", gap: 6, marginTop: "auto", paddingTop: 8 }}>
                  {a.link && <a href={a.link} target="_blank" rel="noreferrer" className="btn" style={{ ...smBtn, textDecoration: "none" }}>열기 ↗</a>}
                  {canEdit && <button className="btn" style={smBtn} onClick={() => { setEdit(a); setOpen(true); }}>수정</button>}
                  {canEdit && <button className="btn" style={{ ...smBtn, color: "var(--owner, #b91c1c)" }} disabled={pending} onClick={() => { if (confirm("삭제할까요?")) run(deleteAsset(a.id, a.link)); }}>삭제</button>}
                </div>
              </div>
                  </div>
                ))}
              </div>
              )}
            </div>
            );
          })}
        </div>
      )}

      {open && (
        <AssetModal
          initial={edit}
          pending={pending}
          folderOpts={folderOptions}
          onClose={() => setOpen(false)}
          onSave={(a) => {
            const { id, ...inp } = a;
            run(id ? updateAsset(id, inp) : createAsset(inp));
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function AssetModal({ initial, pending, folderOpts, onClose, onSave }: { initial: Asset | null; pending: boolean; folderOpts: string[]; onClose: () => void; onSave: (a: Asset) => void }) {
  const [f, setF] = useState<Asset>(initial ?? empty());
  const set = (k: keyof Asset, v: any) => setF((p) => ({ ...p, [k]: v }));
  return (
    <div onMouseDown={onClose} style={backdrop}>
      <div className="card" onMouseDown={(e) => e.stopPropagation()} style={{ padding: 20, width: "100%", maxWidth: 480 }}>
        <h3 style={{ marginTop: 0 }}>{initial ? "자료 수정" : "자료 추가"}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="제목"><input style={inputStyle} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="리앤밤 대표컷 A" /></Field>
          </div>
          <Field label="종류">
            <select style={inputStyle} value={f.kind} onChange={(e) => set("kind", e.target.value)}>
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </Field>
          <Field label="폴더">
            <input list="asset-folders-modal" style={inputStyle} value={f.folder} onChange={(e) => set("folder", e.target.value)} placeholder="폴더 선택/새 폴더" />
            <datalist id="asset-folders-modal">{folderOpts.map((x) => <option key={x} value={x} />)}</datalist>
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
