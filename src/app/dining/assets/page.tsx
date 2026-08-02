"use client";

import { useEffect, useMemo, useState } from "react";
import { useData } from "@dining/lib/store";
import { Card } from "@dining/components/ui";
import { STORES, storeName } from "@dining/lib/stores";
import { ASSETS, SECTIONS, assetCount, ORDER_CATS, type AssetItem, type AssetMap } from "@dining/lib/assets";
import type { StoreId } from "@dining/lib/types";
import { uid } from "@dining/lib/format";

interface OrderLink {
  id: string;
  storeId: StoreId;
  cat: string;
  name: string;
  url: string;
  note?: string;
}
const LINK_KEY = "unho-dining-orderlinks-v1";

export default function AssetsPage() {
  const { scope, ready } = useData();
  const [links, setLinks] = useState<OrderLink[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LINK_KEY);
      if (raw) setLinks(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LINK_KEY, JSON.stringify(links));
    } catch {
      /* ignore */
    }
  }, [links, hydrated]);

  if (!ready) return null;
  const storeIds: StoreId[] = scope === "all" ? STORES.map((s) => s.id) : [scope];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>자료실</h1>
          <p>디자인·메뉴·포스터/배너·콘텐츠 영상·기획안, 온라인 주문처 링크 — {storeName(scope)}</p>
        </div>
      </div>

      <div className="stack">
        {storeIds.map((sid) => (
          <StoreBlock
            key={sid}
            sid={sid}
            assets={ASSETS[sid]}
            showStore={scope === "all"}
            links={links.filter((l) => l.storeId === sid)}
            onAdd={(l) => setLinks((p) => [l, ...p])}
            onRemove={(id) => setLinks((p) => p.filter((x) => x.id !== id))}
          />
        ))}
      </div>
    </>
  );
}

function StoreBlock({
  sid,
  assets,
  showStore,
  links,
  onAdd,
  onRemove,
}: {
  sid: StoreId;
  assets?: AssetMap;
  showStore: boolean;
  links: OrderLink[];
  onAdd: (l: OrderLink) => void;
  onRemove: (id: string) => void;
}) {
  const total = assetCount(assets);
  return (
    <div className="stack">
      {showStore && (
        <div style={{ fontWeight: 750, fontSize: 16, marginTop: 4 }}>
          {STORES.find((s) => s.id === sid)?.emoji} {storeName(sid)}
        </div>
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
            아래 <b>온라인 주문처</b>는 지금 바로 등록·관리할 수 있습니다.
          </div>
        </Card>
      )}

      {/* 온라인 주문처 (편집형) */}
      <OrderLinks storeId={sid} links={links} onAdd={onAdd} onRemove={onRemove} />
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
            <div>
              <div style={{ fontWeight: 600 }}>{d.title}</div>
              {d.desc && <div className="muted" style={{ fontSize: 12 }}>{d.desc}</div>}
            </div>
          </div>
          <a className="btn primary" href={d.src} download>⬇ 다운로드</a>
        </div>
      ))}
    </div>
  );
}

function OrderLinks({
  storeId,
  links,
  onAdd,
  onRemove,
}: {
  storeId: StoreId;
  links: OrderLink[];
  onAdd: (l: OrderLink) => void;
  onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const grouped = useMemo(() => {
    const m: Record<string, OrderLink[]> = {};
    for (const l of links) (m[l.cat] ??= []).push(l);
    return m;
  }, [links]);

  return (
    <Card
      title="🔗 온라인 주문처 (유니폼·명찰·비품·기물)"
      action={<button className="btn primary sm" onClick={() => setOpen(true)}>+ 주문처 추가</button>}
      pad
    >
      {links.length === 0 && (
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
                    <a href={normalizeUrl(l.url)} target="_blank" rel="noreferrer" style={{ fontWeight: 600, color: "var(--brand)" }}>
                      {l.name} ↗
                    </a>
                    <div className="muted" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {l.url}{l.note ? ` · ${l.note}` : ""}
                    </div>
                  </div>
                  <button className="btn sm" style={{ color: "var(--red)" }} onClick={() => onRemove(l.id)}>삭제</button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {open && (
        <LinkModal
          storeId={storeId}
          onClose={() => setOpen(false)}
          onSave={(l) => { onAdd(l); setOpen(false); }}
        />
      )}
    </Card>
  );
}

function normalizeUrl(u: string): string {
  if (!u) return "#";
  return /^https?:\/\//i.test(u) ? u : "https://" + u;
}

function LinkModal({ storeId, onClose, onSave }: { storeId: StoreId; onClose: () => void; onSave: (l: OrderLink) => void }) {
  const [f, setF] = useState<OrderLink>({ id: uid("lnk"), storeId, cat: "유니폼", name: "", url: "", note: "" });
  const set = (k: keyof OrderLink, v: any) => setF((p) => ({ ...p, [k]: v }));
  const field: React.CSSProperties = { width: "100%", padding: "9px 11px", border: "1px solid var(--border-strong)", borderRadius: 8, background: "var(--surface)", color: "var(--text)" };
  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, background: "rgba(16,24,40,0.5)", display: "grid", placeItems: "center", zIndex: 100, padding: 20 }}>
      <div className="card card-pad" onMouseDown={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 440 }}>
        <h3 style={{ marginTop: 0 }}>온라인 주문처 추가</h3>
        <div className="stack">
          <div>
            <div className="form-label">분류</div>
            <select className="field" value={f.cat} onChange={(e) => set("cat", e.target.value)}>
              {ORDER_CATS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <div className="form-label">이름(업체·용도)</div>
            <input style={field} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="예: 유니폼 제작 A사" />
          </div>
          <div>
            <div className="form-label">주문 사이트 URL</div>
            <input style={field} value={f.url} onChange={(e) => set("url", e.target.value)} placeholder="예: www.example.com" />
          </div>
          <div>
            <div className="form-label">비고(선택)</div>
            <input style={field} value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="담당자·단가·메모 등" />
          </div>
        </div>
        <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn primary" disabled={!f.name.trim() || !f.url.trim()} onClick={() => onSave(f)}>저장</button>
        </div>
      </div>
    </div>
  );
}
