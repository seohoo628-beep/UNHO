"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveMandalart } from "@/app/(app)/ceo-todos/mandalart-actions";

// 만다라트(연꽃기법) 9×9 목표표. 가운데 3×3의 중심=핵심목표, 둘레 8칸=세부목표.
// 각 세부목표는 바깥 8개 블록의 중심으로도 나타나며(자동 동기화), 그 둘레 8칸에 실행과제를 적는다.
const LS_KEY = "ceo-mandalart-v1";
const LS_COLLAPSE = "ceo-mandalart-collapsed";

// idx(0~80, row-major)의 짝(미러) 인덱스. 없으면 -1.
function mirrorOf(idx: number): number {
  const r = Math.floor(idx / 9);
  const c = idx % 9;
  const inCenterBlock = r >= 3 && r <= 5 && c >= 3 && c <= 5;
  if (inCenterBlock) {
    if (r === 4 && c === 4) return -1; // 핵심목표
    const br = r - 3;
    const bc = c - 3;
    return (br * 3 + 1) * 9 + (bc * 3 + 1);
  }
  const isBlockCenter = r % 3 === 1 && c % 3 === 1;
  if (isBlockCenter && !(r === 4 && c === 4)) {
    const BR = Math.floor(r / 3);
    const BC = Math.floor(c / 3);
    return (3 + BR) * 9 + (3 + BC);
  }
  return -1;
}

type Role = "main" | "goal" | "action";
function roleOf(idx: number): Role {
  const r = Math.floor(idx / 9);
  const c = idx % 9;
  if (r === 4 && c === 4) return "main";
  const inCenterBlock = r >= 3 && r <= 5 && c >= 3 && c <= 5;
  const isBlockCenter = r % 3 === 1 && c % 3 === 1;
  if (inCenterBlock || isBlockCenter) return "goal";
  return "action";
}

// 8개 세부목표(방향/블록)별 색. 가운데 블록의 8칸과 바깥 8블록의 중심에 같은 색을 쓴다.
// 키는 블록 인덱스(0~8, 4=가운데는 제외).
const GOAL_COLORS: Record<number, string> = {
  0: "#fecaca", // 좌상 · 빨강
  1: "#fed7aa", // 상 · 주황
  2: "#d9f99d", // 우상 · 연두
  3: "#bbf7d0", // 좌 · 초록
  5: "#a5f3fc", // 우 · 하늘
  6: "#bfdbfe", // 좌하 · 파랑
  7: "#ddd6fe", // 하 · 보라
  8: "#fbcfe8", // 우하 · 분홍
};

// 세부목표 칸의 색. 가운데 블록 8칸은 안쪽 위치로, 바깥 블록 중심은 그 블록으로 매핑.
function goalColor(idx: number): string {
  const r = Math.floor(idx / 9);
  const c = idx % 9;
  const inCenterBlock = r >= 3 && r <= 5 && c >= 3 && c <= 5;
  if (inCenterBlock) {
    const b = (r - 3) * 3 + (c - 3); // 안쪽 위치 → 방향 블록
    return GOAL_COLORS[b] ?? "#bfdbfe";
  }
  const BR = Math.floor(r / 3);
  const BC = Math.floor(c / 3);
  return GOAL_COLORS[BR * 3 + BC] ?? "#bfdbfe";
}

function placeholder(role: Role): string {
  if (role === "main") return "핵심 목표";
  if (role === "goal") return "세부 목표";
  return "실행 과제";
}

export default function Mandalart({ initialCells, dbReady }: { initialCells: string[]; dbReady: boolean }) {
  const [cells, setCells] = useState<string[]>(() => {
    const base = Array.from({ length: 81 }, (_, i) => initialCells[i] ?? "");
    return base;
  });
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [saved, setSaved] = useState<"idle" | "saving" | "done">("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 최초: DB 미준비면 localStorage에서 로드.
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(LS_COLLAPSE) === "1");
    } catch {
      /* ignore */
    }
    if (!dbReady) {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) setCells(Array.from({ length: 81 }, (_, i) => (typeof arr[i] === "string" ? arr[i] : "")));
        }
      } catch {
        /* ignore */
      }
    }
  }, [dbReady]);

  const persist = useCallback(
    (next: string[]) => {
      // localStorage 즉시 백업.
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      if (!dbReady) return;
      setSaved("saving");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        const r = await saveMandalart(next);
        setSaved(r.ok ? "done" : "idle");
        if (r.ok) setTimeout(() => setSaved("idle"), 1500);
      }, 700);
    },
    [dbReady]
  );

  const onEdit = (idx: number, val: string) => {
    setCells((prev) => {
      const next = [...prev];
      next[idx] = val;
      const m = mirrorOf(idx);
      if (m >= 0) next[m] = val;
      persist(next);
      return next;
    });
  };

  const toggleCollapse = () => {
    setCollapsed((v) => {
      const n = !v;
      try {
        localStorage.setItem(LS_COLLAPSE, n ? "1" : "0");
      } catch {
        /* ignore */
      }
      return n;
    });
  };

  return (
    <div className="card" style={{ padding: 14, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: collapsed ? 0 : 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={toggleCollapse}
            style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}
          >
            <span style={{ display: "inline-block", transform: collapsed ? "none" : "rotate(90deg)", transition: "transform .15s", fontSize: 11 }}>▸</span>
            🎯 만다라트 목표표
          </button>
        </div>
        <span className="muted" style={{ fontSize: 12 }}>
          {!dbReady ? "이 기기에 저장(마이그레이션 후 서버 동기화)" : saved === "saving" ? "저장 중…" : saved === "done" ? "저장됨 ✓" : "빈칸을 눌러 입력"}
        </span>
      </div>

      {!collapsed && (
        <div style={{ overflowX: "auto", paddingBottom: 4 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 6,
              minWidth: 680,
            }}
          >
            {Array.from({ length: 9 }, (_, b) => {
              const BR = Math.floor(b / 3);
              const BC = b % 3;
              const isCenterBlock = BR === 1 && BC === 1;
              return (
                <div
                  key={b}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 3,
                    padding: 3,
                    borderRadius: 8,
                    background: isCenterBlock ? "#fff7ed" : (BR + BC) % 2 === 0 ? "#f8fafc" : "#f1f5f9",
                  }}
                >
                  {Array.from({ length: 9 }, (_, k) => {
                    const kr = Math.floor(k / 3);
                    const kc = k % 3;
                    const r = BR * 3 + kr;
                    const c = BC * 3 + kc;
                    const idx = r * 9 + c;
                    const role = roleOf(idx);
                    const bg = role === "main" ? "#fde047" : role === "goal" ? goalColor(idx) : "#ffffff";
                    const fontSize = role === "main" ? 15 : role === "goal" ? 13.5 : 12.5;
                    const val = cells[idx];
                    if (editing === idx) {
                      return (
                        <textarea
                          key={idx}
                          autoFocus
                          value={val}
                          onChange={(e) => onEdit(idx, e.target.value)}
                          onBlur={() => setEditing(null)}
                          placeholder={placeholder(role)}
                          style={{
                            width: "100%",
                            height: 64,
                            resize: "none",
                            border: "2px solid #6366f1",
                            borderRadius: 6,
                            background: bg,
                            padding: "5px 6px",
                            fontSize,
                            lineHeight: 1.3,
                            fontWeight: 700,
                            textDecoration: role === "action" ? "underline" : "none",
                            textUnderlineOffset: 2,
                            color: "#111827",
                            textAlign: "center",
                            overflow: "hidden",
                            fontFamily: "inherit",
                          }}
                        />
                      );
                    }
                    return (
                      <button
                        key={idx}
                        onClick={() => setEditing(idx)}
                        style={{
                          width: "100%",
                          height: 64,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          textAlign: "center",
                          border: "1px solid var(--line, #e4e7eb)",
                          borderRadius: 6,
                          background: bg,
                          padding: "4px 5px",
                          fontSize,
                          lineHeight: 1.25,
                          fontWeight: 700,
                          textDecoration: role === "action" && val ? "underline" : "none",
                          textUnderlineOffset: 2,
                          color: val ? "#111827" : "#9ca3af",
                          cursor: "text",
                          overflow: "hidden",
                          wordBreak: "break-word",
                          fontFamily: "inherit",
                        }}
                      >
                        {val || placeholder(role)}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
