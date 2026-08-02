"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DbSetupNotice } from "@/components/DbSetupNotice";
import { createAsset, updateAsset, deleteAsset, type AssetInput } from "./actions";

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
const empty = (): Asset => ({ id: "", title: "", kind: "이미지", brand: "", link: "", thumbUrl: "", note: "" });

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  border: "1px solid var(--line-2)",
  borderRadius: "var(--radius)",
  background: "var(--surface)",
  color: "var(--ink)",
};

export default function AssetsClient({ rows, dbReady }: { rows: Asset[]; dbReady: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("전체");
  const [edit, setEdit] = useState<Asset | null>(null);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");

  const list = useMemo(
    () =>
      rows.filter(
        (a) =>
          (kind === "전체" || a.kind === kind) &&
          (!q || (a.title + a.brand + a.note).toLowerCase().includes(q.toLowerCase()))
      ),
    [rows, q, kind]
  );

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
          <h1 style={{ margin: 0 }}>🖼 제품 이미지·영상 자료</h1>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>제품 촬영본·영상 소재 링크 보관함.</p>
        </div>
        <DbSetupNotice title="제품 이미지·영상 자료" sql={SETUP_SQL} />
      </div>
    );
  }

  return (
    <div>
      <div className="page-head" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>🖼 제품 이미지·영상 자료</h1>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
            자료 {rows.length}건 · 촬영본·영상 소재 링크 보관 · <span style={{ color: "var(--ok, #16a34a)" }}>DB 공유</span>
            {pending ? " · 저장 중…" : ""}
          </p>
        </div>
        <button className="btn" onClick={() => { setEdit(null); setOpen(true); }} style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}>+ 자료 추가</button>
      </div>

      {err && <div className="card" style={{ padding: 10, marginBottom: 12, color: "var(--owner, #b91c1c)", background: "var(--owner-bg, #fef2f2)" }}>{err}</div>}

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="제목·브랜드 검색…" style={{ ...inputStyle, maxWidth: 260 }} />
        <select value={kind} onChange={(e) => setKind(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
          {["전체", ...KINDS].map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </div>

      {list.length === 0 ? (
        <div className="card muted" style={{ padding: 28, textAlign: "center" }}>자료가 없습니다. ‘+ 자료 추가’로 촬영본·영상 링크를 등록하세요.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
          {list.map((a) => (
            <div key={a.id} className="card" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
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
                  <button className="btn" style={smBtn} onClick={() => { setEdit(a); setOpen(true); }}>수정</button>
                  <button className="btn" style={{ ...smBtn, color: "var(--owner, #b91c1c)" }} disabled={pending} onClick={() => { if (confirm("삭제할까요?")) run(deleteAsset(a.id)); }}>삭제</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <AssetModal
          initial={edit}
          pending={pending}
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

function AssetModal({ initial, pending, onClose, onSave }: { initial: Asset | null; pending: boolean; onClose: () => void; onSave: (a: Asset) => void }) {
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
          <Field label="브랜드"><input style={inputStyle} value={f.brand} onChange={(e) => set("brand", e.target.value)} /></Field>
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
