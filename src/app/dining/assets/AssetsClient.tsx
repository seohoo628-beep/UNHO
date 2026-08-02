"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useData } from "@dining/lib/store";
import { Card } from "@dining/components/ui";
import { STORES, storeName } from "@dining/lib/stores";
import { ASSETS, SECTIONS, assetCount, ORDER_CATS, type AssetItem, type AssetMap } from "@dining/lib/assets";
import type { StoreId } from "@dining/lib/types";
import { createLink, deleteLink } from "@/lib/storeShared";
import type { LinkRow } from "@/lib/storeSharedRead";

const PLATFORM = "dining" as const;

export default function AssetsClient({ links, dbReady }: { links: LinkRow[]; dbReady: boolean }) {
  const { scope, ready } = useData();
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!ready) return null;

  const storeIds: StoreId[] = scope === "all" ? STORES.map((s) => s.id) : [scope];
  const run = (p: Promise<{ ok: boolean; error?: string }>) =>
    start(async () => { const r = await p; if (r.ok) router.refresh(); else alert(r.error ?? "오류"); });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>자료실</h1>
          <p>디자인·메뉴·포스터/배너·콘텐츠 영상·기획안, 온라인 주문처 링크 — {storeName(scope)}{pending ? " · 저장 중…" : ""}</p>
        </div>
      </div>

      <div className="stack">
        {storeIds.map((sid) => (
          <StoreBlock
            key={sid}
            sid={sid}
            assets={ASSETS[sid]}
            showStore={scope === "all"}
            links={links.filter((l) => l.store === sid)}
            dbReady={dbReady}
            onAdd={(l) => run(createLink({ ...l, platform: PLATFORM, store: sid }))}
            onRemove={(id) => run(deleteLink(id, PLATFORM))}
            pending={pending}
          />
        ))}
      </div>
    </>
  );
}

function StoreBlock({ sid, assets, showStore, links, dbReady, onAdd, onRemove, pending }: {
  sid: StoreId; assets?: AssetMap; showStore: boolean; links: LinkRow[]; dbReady: boolean;
  onAdd: (l: { cat: string; name: string; url: string; note: string }) => void; onRemove: (id: string) => void; pending: boolean;
}) {
  const total = assetCount(assets);
  return (
    <div className="stack">
      {showStore && (
        <div style={{ fontWeight: 750, fontSize: 16, marginTop: 4 }}>{STORES.find((s) => s.id === sid)?.emoji} {storeName(sid)}</div>
      )}

      {SECTIONS.map((sec) => {
        const items = assets?.[sec.key] ?? [];
        if (items.length === 0) return null;
        return (
          <Card key={sec.key} title={`${sec.icon} ${sec.label}`} pad>
            <SectionBody items={items} />
          </Card>
        );
      })}

      {total === 0 && (
        <Card pad>
          <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.6 }}>
            아직 등록된 파일 자료가 없습니다.<br />
            디자인·메뉴 이미지·포스터·배너·콘텐츠 영상·기획안 파일을 전달해 주시면 이 자료실에 담아 드립니다.
          </div>
        </Card>
      )}

      <OrderLinks links={links} dbReady={dbReady} onAdd={onAdd} onRemove={onRemove} pending={pending} />
    </div>
  );
}

function SectionBody({ items }: { items: AssetItem[] }) {
  const images = items.filter((i) => i.kind === "image");
  const videos = items.filter((i) => i.kind === "video");
  const docs = items.filter((i) => i.kind === "doc");
  return (
    <div className="stack">
      {images.length > 0 && (
        <div className="grid grid-2">
          {images.map((m) => (
            <a key={m.src} href={m.src} target="_blank" rel="noreferrer" style={{ display: "block" }}>
              <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", background: "var(--surface-2)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.src} alt={m.title} style={{ width: "100%", display: "block" }} />
              </div>
              <div style={{ fontWeight: 600, marginTop: 8 }}>{m.title}</div>
              {m.desc && <div className="muted" style={{ fontSize: 12 }}>{m.desc}</div>}
            </a>
          ))}
        </div>
      )}
      {videos.length > 0 && (
        <div className="grid grid-3">
          {videos.map((v) => (
            <div key={v.src}>
              <video src={v.src} controls preload="metadata" playsInline style={{ width: "100%", borderRadius: 10, background: "#000", maxHeight: 460 }} />
              <div style={{ fontWeight: 600, marginTop: 8 }}>{v.title}</div>
            </div>
          ))}
        </div>
      )}
      {docs.map((d) => (
        <div key={d.src} className="row between" style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
          <div className="row" style={{ gap: 12 }}>
            <span style={{ fontSize: 24 }}>📄</span>
            <div><div style={{ fontWeight: 600 }}>{d.title}</div>{d.desc && <div className="muted" style={{ fontSize: 12 }}>{d.desc}</div>}</div>
          </div>
          <a className="btn primary" href={d.src} download>⬇ 다운로드</a>
        </div>
      ))}
    </div>
  );
}

function OrderLinks({ links, dbReady, onAdd, onRemove, pending }: {
  links: LinkRow[]; dbReady: boolean;
  onAdd: (l: { cat: string; name: string; url: string; note: string }) => void; onRemove: (id: string) => void; pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const grouped = useMemo(() => {
    const m: Record<string, LinkRow[]> = {};
    for (const l of links) (m[l.cat] ??= []).push(l);
    return m;
  }, [links]);

  return (
    <Card
      title="🔗 온라인 주문처 (유니폼·명찰·비품·기물)"
      action={dbReady ? <button className="btn primary sm" onClick={() => setOpen(true)}>+ 주문처 추가</button> : null}
      pad
    >
      {!dbReady && (
        <div className="muted" style={{ fontSize: 13 }}>
          온라인 주문처 공유 저장을 켜려면 DB 테이블이 필요합니다. ‘거래처관리’ 화면의 안내 SQL을 Supabase에 한 번 실행해 주세요.
        </div>
      )}
      {dbReady && links.length === 0 && (
        <div className="muted" style={{ fontSize: 13 }}>등록된 주문처가 없습니다. 자주 쓰는 유니폼·명찰·비품·기물 주문 사이트를 등록해 두세요.</div>
      )}
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

      {open && (
        <LinkModal onClose={() => setOpen(false)} onSave={(l) => { onAdd(l); setOpen(false); }} pending={pending} />
      )}
    </Card>
  );
}

function normalizeUrl(u: string): string {
  if (!u) return "#";
  return /^https?:\/\//i.test(u) ? u : "https://" + u;
}

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
          <div><div className="form-label">비고(선택)</div><input style={field} value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="담당자·단가·메모 등" /></div>
        </div>
        <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn primary" disabled={!f.name.trim() || !f.url.trim() || pending} onClick={() => onSave(f)}>저장</button>
        </div>
      </div>
    </div>
  );
}
