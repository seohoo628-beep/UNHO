"use client";

import { useData } from "@fnb/lib/store";
import { Card } from "@fnb/components/ui";
import { STORES, storeName } from "@fnb/lib/stores";
import { ASSETS, hasAssets, type StoreAssets } from "@fnb/lib/assets";
import type { StoreId } from "@fnb/lib/types";

export default function AssetsPage() {
  const { scope, ready } = useData();
  if (!ready) return null;

  const storeIds: StoreId[] = scope === "all" ? STORES.map((s) => s.id) : [scope];
  const withAssets = storeIds.filter((sid) => hasAssets(ASSETS[sid]));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>자료실</h1>
          <p>브랜드 메뉴·기획안·기획영상 자료 — {storeName(scope)}</p>
        </div>
      </div>

      {withAssets.length === 0 && (
        <Card pad>
          <div className="empty">이 매장에 등록된 자료가 없습니다.</div>
        </Card>
      )}

      <div className="stack">
        {withAssets.map((sid) => (
          <StoreAssetBlock key={sid} sid={sid} a={ASSETS[sid]!} showStore={scope === "all"} />
        ))}
      </div>
    </>
  );
}

function StoreAssetBlock({ sid, a, showStore }: { sid: StoreId; a: StoreAssets; showStore: boolean }) {
  return (
    <div className="stack">
      {showStore && (
        <div style={{ fontWeight: 750, fontSize: 16, marginTop: 4 }}>
          {STORES.find((s) => s.id === sid)?.emoji} {storeName(sid)}
        </div>
      )}

      {/* 메뉴 이미지 */}
      {a.menu.length > 0 && (
        <Card title="🍽 메뉴" pad>
          <div className="grid grid-2">
            {a.menu.map((m) => (
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
          <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>이미지를 누르면 원본 크기로 열립니다.</div>
        </Card>
      )}

      {/* 기획안 문서 */}
      {a.plan.length > 0 && (
        <Card title="📑 기획안" pad>
          <div className="stack">
            {a.plan.map((p) => (
              <div key={p.src} className="row between" style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
                <div className="row" style={{ gap: 12 }}>
                  <span style={{ fontSize: 26 }}>📊</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>{p.title}</div>
                    {p.desc && <div className="muted" style={{ fontSize: 12 }}>{p.desc}</div>}
                  </div>
                </div>
                <a className="btn primary" href={p.src} download>
                  ⬇ 다운로드
                </a>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 기획/컨셉 영상 */}
      {a.video.length > 0 && (
        <Card title="🎬 기획영상" pad>
          <div className="grid grid-3">
            {a.video.map((v) => (
              <div key={v.src}>
                <video
                  src={v.src}
                  controls
                  preload="metadata"
                  playsInline
                  style={{ width: "100%", borderRadius: 10, background: "#000", maxHeight: 460 }}
                />
                <div style={{ fontWeight: 600, marginTop: 8 }}>{v.title}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
