"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { FOLDER_GROUPS, type FolderGroup } from "@/lib/folders";
import { setUserPrefs } from "@/app/(app)/hub/actions";

// 메뉴는 카테고리별로 묶어 표시한다. 폴더 카탈로그는 @/lib/folders 공유(홈 런처와 동일).
type Group = FolderGroup;

const groupTitleStyle: React.CSSProperties = {
  padding: "6px 11px 3px",
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: "0.06em",
  color: "#8a929b",
  textTransform: "uppercase",
};

export default function Nav({
  pendingCount,
  isOwner,
  isCeo = false,
  isFinance = false,
  isGuest = false,
  counts,
  folderOrder = [],
  folderGroups = {},
}: {
  pendingCount: number;
  isOwner: boolean;
  isCeo?: boolean;
  isFinance?: boolean;
  isGuest?: boolean;
  counts?: Record<string, number>;
  folderOrder?: string[];
  folderGroups?: Record<string, string>;
}) {
  const pathname = usePathname();
  const [editing, setEditing] = useState(false);
  const [dragHref, setDragHref] = useState<string | null>(null);
  const [, startPrefs] = useTransition();

  // 폴더 순서(홈 화면과 동일한 folderOrder 공유). 저장 순서 + 신규는 뒤에 이어붙임.
  const allHrefs = FOLDER_GROUPS.flatMap((g) => g.items.map((it) => it.href));
  const [order, setOrder] = useState<string[]>(() => {
    const saved = folderOrder.filter((h) => allHrefs.includes(h));
    return [...saved, ...allHrefs.filter((h) => !saved.includes(h))];
  });
  const [groupMap, setGroupMap] = useState<Record<string, string>>(folderGroups);
  const orderIndex = new Map(order.map((h, i) => [h, i]));
  const sortByOrder = <T extends { href: string }>(items: T[]): T[] =>
    [...items].sort((a, b) => (orderIndex.get(a.href) ?? Infinity) - (orderIndex.get(b.href) ?? Infinity));
  const savePrefs = (patch: Parameters<typeof setUserPrefs>[0]) => startPrefs(async () => { await setUserPrefs(patch); });
  // 폴더별 '지난 방문 이후 새로 추가된 항목 수'(빨간 숫자). 마지막으로 본 개수를 기기에 저장해 비교.
  const [unread, setUnread] = useState<Record<string, number>>({});
  // 카테고리(그룹) 접힘 상태.
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem("nav-collapsed-v1");
      if (raw) setCollapsedGroups(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  const toggleGroup = (title: string) =>
    setCollapsedGroups((prev) => {
      const n = { ...prev, [title]: !prev[title] };
      try {
        localStorage.setItem("nav-collapsed-v1", JSON.stringify(n));
      } catch {
        /* ignore */
      }
      return n;
    });

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

  // 현재 열람 중인 폴더는 '봤음'으로 기록하고 배지 제거.
  useEffect(() => {
    const c = counts ?? {};
    const href = Object.keys(c).find((h) => pathname === h || pathname.startsWith(h + "/"));
    if (!href) return;
    try {
      localStorage.setItem(`navseen:${href}`, String(c[href]));
    } catch {
      /* ignore */
    }
    setUnread((prev) => {
      if (!(href in prev)) return prev;
      const n = { ...prev };
      delete n[href];
      return n;
    });
  }, [pathname, counts]);

  // 설정 등 owner 전용 항목은 아래 렌더 필터(!it.owner || isOwner)에서 걸러진다.
  // CEO 전용(나만 보이는 🔒) 폴더는 별도 카테고리로 맨 위에 모은다(대표 계정 한정).
  const ceoItems: FolderGroup["items"] = [];
  const rebuilt: Group[] = [];
  for (const g of FOLDER_GROUPS) {
    const items = g.items.filter((it) => {
      if (isCeo && !isGuest && it.ceo) { ceoItems.push(it); return false; }
      return true;
    });
    if (items.length) rebuilt.push({ title: g.title, items });
  }
  const groups: Group[] =
    (isCeo && !isGuest && ceoItems.length ? [{ title: "🔒 나만 보는 폴더", items: ceoItems }] : []).concat(rebuilt);

  // 카테고리 이동: 폴더별 그룹 override(홈과 공유하는 folderGroups).
  const titles = groups.map((g) => g.title);
  const defaultTitle = new Map<string, string>();
  groups.forEach((g) => g.items.forEach((it) => defaultTitle.set(it.href, g.title)));
  const effTitle = (href: string) => {
    const ov = groupMap[href];
    return ov && titles.includes(ov) ? ov : defaultTitle.get(href) ?? titles[0];
  };
  // 모든(가시) 항목을 effTitle 기준으로 재분류.
  const allVisible = groups.flatMap((g) => g.items).filter((it) =>
    isGuest ? !!it.guest : (!it.owner || isOwner) && (!it.ceo || isCeo) && (!it.finance || isFinance)
  );
  const itemsOf = (title: string) => sortByOrder(allVisible.filter((it) => effTitle(it.href) === title));

  // 그룹·순서를 함께 계산해 저장은 한 번만(동시 저장 경합 방지).
  const move = (drag: string, target: string, targetIsGroup = false) => {
    const destTitle = targetIsGroup ? target : effTitle(target);
    const nextGroups = { ...groupMap };
    if (destTitle === (defaultTitle.get(drag) ?? "")) delete nextGroups[drag]; else nextGroups[drag] = destTitle;
    let nextOrder = order;
    if (targetIsGroup) {
      nextOrder = [...order.filter((h) => h !== drag), drag]; // 그룹 끝 = 전역 순서 맨 뒤
    } else if (drag !== target) {
      const arr = order.filter((h) => h !== drag);
      const ti = arr.indexOf(target);
      if (ti >= 0) { arr.splice(ti, 0, drag); nextOrder = arr; }
    }
    setGroupMap(nextGroups);
    setOrder(nextOrder);
    savePrefs({ folderGroups: nextGroups, folderOrder: nextOrder });
  };

  // 모바일용 ▲▼ 한 칸 이동. 그룹 경계를 넘으면 이웃 카테고리로.
  const moveStep = (href: string, dir: -1 | 1, siblings: { href: string }[], groupTitle: string) => {
    const idx = siblings.findIndex((s) => s.href === href);
    if (idx < 0) return;
    const j = idx + dir;
    if (j >= 0 && j < siblings.length) {
      const target = siblings[j].href;
      const arr = order.filter((h) => h !== href);
      let ti = arr.indexOf(target);
      if (ti < 0) return;
      if (dir === 1) ti += 1;
      arr.splice(ti, 0, href);
      setOrder(arr);
      savePrefs({ folderOrder: arr });
      return;
    }
    const gi = titles.indexOf(groupTitle);
    const destTitle = titles[gi + dir];
    if (!destTitle) return;
    const destItems = itemsOf(destTitle).filter((it) => it.href !== href);
    if (dir === -1 || destItems.length === 0) move(href, destTitle, true);
    else move(href, destItems[0].href);
  };

  return (
    <nav>
      {!isGuest && (
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 4px 2px" }}>
          <button
            onClick={() => setEditing((v) => !v)}
            style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 10.5, fontWeight: 700, color: editing ? "var(--accent)" : "#8a929b", padding: "2px 4px" }}
          >{editing ? "✓ 순서 저장" : "↕ 순서 편집"}</button>
        </div>
      )}
      {titles.map((title) => {
        const visible = itemsOf(title);
        // 편집 중엔 빈 그룹도 드롭 대상으로 노출.
        if (visible.length === 0 && !editing) return null;
        // 현재 페이지가 속한 그룹은 접혀 있어도 펼쳐 보여준다.
        const hasActive = visible.some((it) => pathname.startsWith(it.href));
        const open = !collapsedGroups[title] || hasActive || editing;
        // 접혔을 때 놓친 배지 합계.
        const hiddenBadge = visible.reduce((s, it) => s + (it.badge ? pendingCount : unread[it.href] ?? 0), 0);
        return (
          <div
            key={title}
            onDragOver={editing ? (e) => e.preventDefault() : undefined}
            onDrop={editing ? (e) => { e.preventDefault(); if (dragHref) move(dragHref, title, true); setDragHref(null); } : undefined}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              marginTop: 10,
              padding: "4px 6px 6px",
              border: editing ? "1px dashed var(--accent)" : "1px solid var(--line)",
              borderRadius: 12,
              background: "var(--surface-2)",
            }}
          >
            <button
              onClick={() => toggleGroup(title)}
              style={{ ...groupTitleStyle, display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none", cursor: "pointer", width: "100%", textAlign: "left" }}
            >
              <span style={{ display: "inline-block", transition: "transform .15s", transform: open ? "rotate(90deg)" : "none", fontSize: 9 }}>▸</span>
              <span style={{ flex: 1 }}>{title}</span>
              {!open && hiddenBadge > 0 && <span className="count">{hiddenBadge}</span>}
            </button>
            {open &&
              visible.map((it) => {
                const active = pathname.startsWith(it.href);
                const badgeNum = it.badge ? pendingCount : unread[it.href] ?? 0;
                const isDragging = dragHref === it.href;
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    target={it.newTab ? "_blank" : undefined}
                    rel={it.newTab ? "noreferrer" : undefined}
                    className={`navlink${active ? " active" : ""}`}
                    draggable={editing}
                    onDragStart={editing ? (e) => { setDragHref(it.href); e.dataTransfer.effectAllowed = "move"; } : undefined}
                    onDragOver={editing ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } : undefined}
                    onDrop={editing ? (e) => { e.preventDefault(); e.stopPropagation(); if (dragHref) move(dragHref, it.href); setDragHref(null); } : undefined}
                    onDragEnd={editing ? () => setDragHref(null) : undefined}
                    onClick={editing ? (e) => e.preventDefault() : undefined}
                    style={editing ? { cursor: "grab", opacity: isDragging ? 0.4 : 1, outline: isDragging ? "1px dashed var(--accent)" : undefined } : undefined}
                  >
                    <span>{editing ? "⠿ " : ""}{it.label}</span>
                    {!editing && badgeNum > 0 && <span className="count">{badgeNum}</span>}
                    {editing && (
                      <span style={{ display: "inline-flex", gap: 3, flexShrink: 0 }}>
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); moveStep(it.href, -1, visible, title); }} title="위로" className="btn sm" style={{ padding: "0 6px", fontSize: 10, lineHeight: 1.7 }}>▲</button>
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); moveStep(it.href, 1, visible, title); }} title="아래로" className="btn sm" style={{ padding: "0 6px", fontSize: 10, lineHeight: 1.7 }}>▼</button>
                      </span>
                    )}
                  </Link>
                );
              })}
            {editing && visible.length === 0 && (
              <div className="muted" style={{ fontSize: 10.5, padding: "6px 4px", textAlign: "center" }}>여기로 폴더를 끌어다 놓기</div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
