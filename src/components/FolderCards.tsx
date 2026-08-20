"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import type { FolderGroup } from "@/lib/folders";
import { setUserPrefs } from "@/app/(app)/hub/actions";

// 홈 폴더 런처 카드 + 빨간 알림 배지(사이드바와 동일: 지난 방문 이후 새 항목 수).
// 즐겨찾기/숨김은 계정 단위(user_prefs)에 저장되어 어느 기기에서 로그인해도 유지됩니다.
export default function FolderCards({
  groups,
  counts,
  pendingCount,
  initialFav = [],
  initialHidden = [],
  initialOrder = [],
  initialGroups = {},
}: {
  groups: FolderGroup[];
  counts: Record<string, number>;
  pendingCount: number;
  initialFav?: string[];
  initialHidden?: string[];
  initialOrder?: string[];
  initialGroups?: Record<string, string>;
}) {
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [pins, setPins] = useState<string[]>(initialFav);
  const [hidden, setHidden] = useState<string[]>(initialHidden);
  const [editing, setEditing] = useState(false);
  const [, start] = useTransition();

  // 전체 폴더 표시 순서(href 배열). 저장된 순서 + 신규 폴더는 기본 위치에 이어붙임.
  const allHrefs = groups.flatMap((g) => g.items.map((it) => it.href));
  const [order, setOrder] = useState<string[]>(() => {
    const saved = initialOrder.filter((h) => allHrefs.includes(h));
    return [...saved, ...allHrefs.filter((h) => !saved.includes(h))];
  });
  const [dragHref, setDragHref] = useState<string | null>(null);

  // 폴더별 카테고리 이동(href → 그룹 제목). 기본 그룹은 groups prop에서 도출.
  const titles = groups.map((g) => g.title);
  const defaultTitle = new Map<string, string>();
  groups.forEach((g) => g.items.forEach((it) => defaultTitle.set(it.href, g.title)));
  const [groupMap, setGroupMap] = useState<Record<string, string>>(initialGroups);
  const effTitle = (href: string) => {
    const ov = groupMap[href];
    return ov && titles.includes(ov) ? ov : defaultTitle.get(href) ?? titles[0];
  };

  const orderIndex = new Map(order.map((h, i) => [h, i]));
  const sortItems = <T extends { href: string }>(items: T[]): T[] =>
    [...items].sort((a, b) => (orderIndex.get(a.href) ?? Infinity) - (orderIndex.get(b.href) ?? Infinity));

  // target이 href면 그 앞에 삽입 + 대상 그룹으로 이동, target이 그룹제목이면 그 그룹 끝으로.
  const move = (drag: string, target: string, targetIsGroup = false) => {
    const destTitle = targetIsGroup ? target : effTitle(target);
    setGroupMap((prev) => {
      const next = { ...prev };
      if (destTitle === (defaultTitle.get(drag) ?? "")) delete next[drag]; else next[drag] = destTitle;
      startSave({ folderGroups: next });
      return next;
    });
    if (!targetIsGroup) {
      if (drag === target) return;
      setOrder((prev) => {
        const arr = prev.filter((h) => h !== drag);
        const ti = arr.indexOf(target);
        if (ti < 0) return prev;
        arr.splice(ti, 0, drag);
        startSave({ folderOrder: arr });
        return arr;
      });
    }
  };
  const startSave = (patch: Parameters<typeof setUserPrefs>[0]) => start(async () => { await setUserPrefs(patch); });

  useEffect(() => {
    const c = counts ?? {};
    const u: Record<string, number> = {};
    for (const href of Object.keys(c)) {
      let seen = 0;
      try {
        seen = Number(localStorage.getItem(`navseen:${href}`) ?? "0");
      } catch {
        /* ignore */
      }
      const delta = c[href] - (Number.isFinite(seen) ? seen : 0);
      if (delta > 0) u[href] = delta;
    }
    setUnread(u);
  }, [counts]);

  // 초기값은 useState 시드로만 사용한다. 서버가 다시 그릴 때마다 initialFav로 되돌리면
  // 방금 누른 즐겨찾기/숨김이 사라지므로, 여기서 재설정하지 않는다(낙관적 상태 유지).

  const togglePin = (href: string) => {
    setPins((prev) => {
      const next = prev.includes(href) ? prev.filter((h) => h !== href) : [...prev, href];
      try { localStorage.setItem("folderpins", JSON.stringify(next)); } catch { /* ignore */ }
      start(async () => { await setUserPrefs({ favFolders: next }); });
      return next;
    });
  };

  const toggleHide = (href: string) => {
    setHidden((prev) => {
      const next = prev.includes(href) ? prev.filter((h) => h !== href) : [...prev, href];
      start(async () => { await setUserPrefs({ hiddenFolders: next }); });
      return next;
    });
    // 숨기면 즐겨찾기에서도 제거.
    if (!hidden.includes(href)) setPins((prev) => { const n = prev.filter((h) => h !== href); if (n.length !== prev.length) start(async () => { await setUserPrefs({ favFolders: n }); }); return n; });
  };

  const hiddenSet = new Set(hidden);
  const allItems = groups.flatMap((g) => g.items);
  // 즐겨찾기는 지정한 순서(pins) 유지, 나머지 폴더는 사용자 정렬(order) 적용.
  const pinned = pins.map((h) => allItems.find((it) => it.href === h)).filter(Boolean).filter((it) => !hiddenSet.has((it as { href: string }).href)) as typeof allItems;

  const Card = ({ it }: { it: (typeof allItems)[number] }) => {
    const badge = it.badge ? pendingCount : unread[it.href] ?? 0;
    const sp = it.label.indexOf(" ");
    const icon = sp > 0 ? it.label.slice(0, sp) : "";
    const text = sp > 0 ? it.label.slice(sp + 1) : it.label;
    const isPinned = pins.includes(it.href);
    const isHidden = hiddenSet.has(it.href);
    const isDragging = dragHref === it.href;
    return (
      <Link
        href={it.href}
        className="card folder-card"
        draggable={editing}
        onDragStart={editing ? (e) => { setDragHref(it.href); e.dataTransfer.effectAllowed = "move"; } : undefined}
        onDragOver={editing ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } : undefined}
        onDrop={editing ? (e) => { e.preventDefault(); e.stopPropagation(); if (dragHref) move(dragHref, it.href); setDragHref(null); } : undefined}
        onDragEnd={editing ? () => setDragHref(null) : undefined}
        onClick={editing ? (e) => e.preventDefault() : undefined}
        style={{ padding: "10px 5px", textDecoration: "none", color: "var(--ink)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 5, minHeight: 78, position: "relative", opacity: isHidden ? 0.4 : isDragging ? 0.35 : 1, cursor: editing ? "grab" : "pointer", outline: isDragging ? "2px dashed var(--accent)" : undefined }}
      >
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePin(it.href); }}
          title={isPinned ? "즐겨찾기 해제" : "즐겨찾기"}
          style={{ position: "absolute", top: 3, left: 4, border: "none", background: "transparent", cursor: "pointer", fontSize: 12, lineHeight: 1, color: isPinned ? "#f59e0b" : "var(--line-2)", padding: 2 }}
        >{isPinned ? "★" : "☆"}</button>
        {editing && (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleHide(it.href); }}
            title={isHidden ? "다시 표시" : "이 폴더 숨기기"}
            style={{ position: "absolute", top: 3, right: 4, border: "none", background: "transparent", cursor: "pointer", fontSize: 12, lineHeight: 1, padding: 2 }}
          >{isHidden ? "🙈" : "👁"}</button>
        )}
        {icon && <span style={{ fontSize: 23, lineHeight: 1 }}>{icon}</span>}
        <span style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.2, wordBreak: "keep-all" }}>{text}</span>
        {!editing && badge > 0 && <span className="count" style={{ position: "absolute", top: 6, right: 6 }}>{badge}</span>}
      </Link>
    );
  };

  // 편집 모드가 아니면 숨긴 폴더 제외. 카테고리 이동(effTitle) + 사용자 정렬(order) 적용.
  const allVisible = allItems.filter((it) => editing || !hiddenSet.has(it.href));
  const visibleGroups = titles
    .map((title) => ({ title, items: sortItems(allVisible.filter((it) => effTitle(it.href) === title)) }))
    .filter((g) => g.items.length > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: -8 }}>
        <button className="btn sm" onClick={() => setEditing((v) => !v)}>{editing ? "완료" : "⚙️ 폴더 편집"}</button>
      </div>
      {editing && <div className="muted" style={{ fontSize: 11.5, marginTop: -10 }}>★ 즐겨찾기 · 👁/🙈 폴더 숨김 · ↕ 카드를 드래그하면 순서가 바뀝니다. 설정은 내 계정에 저장돼 어느 기기에서든 유지돼요.</div>}
      {pinned.length > 0 && (
        <div>
          <div className="muted" style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 8 }}>⭐ 즐겨찾기</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(70px, 1fr))", gap: 8 }}>
            {pinned.map((it) => <Card key={"pin:" + it.href} it={it} />)}
          </div>
        </div>
      )}
      {(editing ? titles.map((t) => visibleGroups.find((g) => g.title === t) ?? { title: t, items: [] as typeof allItems }) : visibleGroups).map((g) => (
        <div
          key={g.title}
          onDragOver={editing ? (e) => e.preventDefault() : undefined}
          onDrop={editing ? (e) => { e.preventDefault(); if (dragHref) move(dragHref, g.title, true); setDragHref(null); } : undefined}
        >
          <div className="muted" style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 8 }}>
            {g.title}{editing && <span style={{ fontWeight: 400, textTransform: "none", marginLeft: 6, color: "var(--accent)" }}>← 여기로 끌어다 놓기</span>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(70px, 1fr))", gap: 8, minHeight: editing ? 40 : undefined, border: editing ? "1px dashed var(--line-2)" : undefined, borderRadius: editing ? 10 : undefined, padding: editing ? 6 : undefined }}>
            {g.items.map((it) => <Card key={it.href} it={it} />)}
            {editing && g.items.length === 0 && <div className="muted" style={{ fontSize: 11, gridColumn: "1 / -1", textAlign: "center", padding: "8px 0" }}>비어 있음 · 폴더를 끌어다 놓으세요</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
