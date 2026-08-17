"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { FolderGroup, FolderItem } from "@/lib/folders";
import { saveMyPrefs } from "@/app/(app)/hub/prefs-actions";

// 홈 폴더 런처. 계정별 즐겨찾기(핀)·숨김 + 빨간 알림 배지.
export default function FolderCards({
  groups,
  counts,
  pendingCount,
  pinned: pinnedInit = [],
  hidden: hiddenInit = [],
}: {
  groups: FolderGroup[];
  counts: Record<string, number>;
  pendingCount: number;
  pinned?: string[];
  hidden?: string[];
}) {
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [pinned, setPinned] = useState<string[]>(pinnedInit);
  const [hidden, setHidden] = useState<string[]>(hiddenInit);
  const [edit, setEdit] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [, start] = useTransition();

  useEffect(() => {
    const c = counts ?? {};
    const u: Record<string, number> = {};
    for (const href of Object.keys(c)) {
      let seen = 0;
      try { seen = Number(localStorage.getItem(`navseen:${href}`) ?? "0"); } catch { /* ignore */ }
      const delta = c[href] - (Number.isFinite(seen) ? seen : 0);
      if (delta > 0) u[href] = delta;
    }
    setUnread(u);
  }, [counts]);

  // href → item 조회(전체 그룹 평탄화)
  const itemByHref = useMemo(() => {
    const m = new Map<string, FolderItem>();
    for (const g of groups) for (const it of g.items) m.set(it.href, it);
    return m;
  }, [groups]);

  const pinnedItems = pinned.map((h) => itemByHref.get(h)).filter(Boolean) as FolderItem[];
  const isPinned = (h: string) => pinned.includes(h);
  const isHidden = (h: string) => hidden.includes(h);

  const persist = (nextPinned: string[], nextHidden: string[]) => {
    setPinned(nextPinned); setHidden(nextHidden); setErr(null);
    start(async () => {
      const r = await saveMyPrefs({ pinnedFolders: nextPinned, hiddenFolders: nextHidden });
      if (!r.ok) setErr("설정 저장에 실패했어요. 마이그레이션(0096)을 확인하세요.");
    });
  };
  const togglePin = (h: string) => {
    if (isPinned(h)) persist(pinned.filter((x) => x !== h), hidden);
    else persist([...pinned, h], hidden.filter((x) => x !== h)); // 핀하면 숨김 해제
  };
  const toggleHide = (h: string) => {
    if (isHidden(h)) persist(pinned, hidden.filter((x) => x !== h));
    else persist(pinned.filter((x) => x !== h), [...hidden, h]); // 숨기면 핀 해제
  };

  const card = (it: FolderItem, opts?: { pinnedSection?: boolean }) => {
    const badge = it.badge ? pendingCount : unread[it.href] ?? 0;
    const sp = it.label.indexOf(" ");
    const icon = sp > 0 ? it.label.slice(0, sp) : "";
    const text = sp > 0 ? it.label.slice(sp + 1) : it.label;
    const dimmed = isHidden(it.href) && !opts?.pinnedSection;
    const inner = (
      <>
        {icon && <span style={{ fontSize: 24, lineHeight: 1 }}>{icon}</span>}
        <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.28, wordBreak: "keep-all" }}>{text}</span>
        {badge > 0 && <span className="count" style={{ position: "absolute", top: 6, right: 6 }}>{badge}</span>}
        {edit && (
          <div style={{ position: "absolute", top: 4, left: 4, display: "flex", gap: 3 }}>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePin(it.href); }}
              title={isPinned(it.href) ? "즐겨찾기 해제" : "즐겨찾기"}
              style={{ border: "none", background: "rgba(0,0,0,.04)", borderRadius: 6, cursor: "pointer", fontSize: 13, lineHeight: 1, padding: "2px 4px" }}
            >
              {isPinned(it.href) ? "⭐" : "☆"}
            </button>
            {!opts?.pinnedSection && (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleHide(it.href); }}
                title={isHidden(it.href) ? "다시 표시" : "홈에서 숨기기"}
                style={{ border: "none", background: "rgba(0,0,0,.04)", borderRadius: 6, cursor: "pointer", fontSize: 13, lineHeight: 1, padding: "2px 4px" }}
              >
                {isHidden(it.href) ? "🚫" : "👁"}
              </button>
            )}
          </div>
        )}
      </>
    );
    const style: React.CSSProperties = {
      padding: "14px 8px", textDecoration: "none", color: "var(--ink)", display: "flex",
      flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center",
      gap: 7, minHeight: 92, position: "relative", opacity: dimmed ? 0.4 : 1,
    };
    // 편집 중엔 이동 방지(버튼 클릭만)
    if (edit) return <div key={it.href} className="card folder-card" style={{ ...style, cursor: "default" }}>{inner}</div>;
    return <Link key={it.href} href={it.href} className="card folder-card" style={style}>{inner}</Link>;
  };

  return (
    <div>
      <div className="section-title" style={{ marginTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <span>전체 폴더</span>
        <button className="btn sm" onClick={() => { setEdit((v) => !v); setErr(null); }} style={{ fontWeight: 600 }}>
          {edit ? "완료" : "⚙ 홈 맞춤설정"}
        </button>
      </div>

      {edit && (
        <p className="muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 12 }}>
          ☆ 즐겨찾기 · 👁 홈에서 숨기기. 설정은 <b>내 계정</b>에 저장돼 어느 기기에서 로그인해도 유지됩니다.
        </p>
      )}
      {err && <p style={{ color: "var(--owner)", fontSize: 12, marginBottom: 10 }}>{err}</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* 즐겨찾기 섹션 */}
        {pinnedItems.length > 0 && (
          <div>
            <div className="muted" style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 8 }}>⭐ 즐겨찾기</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {pinnedItems.map((it) => card(it, { pinnedSection: true }))}
            </div>
          </div>
        )}

        {/* 일반 그룹 */}
        {groups.map((g) => {
          const items = edit ? g.items : g.items.filter((it) => !isHidden(it.href));
          if (items.length === 0) return null;
          return (
            <div key={g.title}>
              <div className="muted" style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 8 }}>{g.title}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {items.map((it) => card(it))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
