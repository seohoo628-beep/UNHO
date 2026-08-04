"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getChoiTodos, deleteTodos } from "@/app/(app)/todos/actions";
import { importCeoTodos } from "@/app/(app)/ceo-todos/actions";
import { CEO_TODOS, type CeoTodo } from "@/app/(app)/ceo-todos/data";

const DATA_KEY = "ceo-todos-v1"; // CeoTodosPage와 동일 키(DB 미준비 시 폴백)

// 최운호 담당 업무를 CEO 투두로 이관하고 전직원 투두에서 삭제한다.
// 기본은 DB(ceo_todos)로 올려 기기 간 동기화되게 하고, 테이블이 아직 없으면 localStorage로 폴백한다.
export default function CeoMigrateButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();

  const run = () => {
    if (!confirm("전직원 투두에서 '최운호' 담당 업무를 전부 CEO 투두(최우선)로 옮기고, 전직원 투두에서는 삭제합니다.\n계속할까요?")) return;
    setMsg(null);
    start(async () => {
      const res = await getChoiTodos();
      if (!res.ok) {
        setMsg({ ok: false, text: res.error ?? "이관 실패" });
        return;
      }
      const items = res.items ?? [];
      if (items.length === 0) {
        setMsg({ ok: false, text: "이관할 '최운호' 담당 업무가 없습니다." });
        return;
      }

      // 전직원 투두 → CEO 투두 항목으로 변환.
      const candidates: CeoTodo[] = items.map((it) => ({
        id: "mig_" + it.id,
        src: it.id,
        text:
          (it.brandName ? `[${it.brandName}] ` : "") + it.title + (it.note ? ` — ${it.note}` : ""),
        pri: "최우선",
        done: it.status === "완료",
      }));

      // 1) DB(ceo_todos)로 올리기 시도 → 기기 간 동기화. id가 같으면 upsert라 중복 안 생김.
      const imp = await importCeoTodos(candidates);
      let addedCount = candidates.length;

      if (!imp.ok && imp.tableMissing) {
        // DB 미준비 → localStorage 폴백(기존 방식). 이미 옮긴 src는 건너뜀.
        let board: CeoTodo[] = CEO_TODOS;
        try {
          const raw = localStorage.getItem(DATA_KEY);
          if (raw) board = JSON.parse(raw) as CeoTodo[];
        } catch {
          board = CEO_TODOS;
        }
        const already = new Set(board.map((b) => b.src).filter(Boolean) as string[]);
        const added = candidates.filter((c) => !already.has(c.src ?? ""));
        addedCount = added.length;
        try {
          localStorage.setItem(DATA_KEY, JSON.stringify([...added, ...board]));
        } catch {
          setMsg({ ok: false, text: "브라우저 저장에 실패했습니다. 저장공간을 확인하세요." });
          return;
        }
      } else if (!imp.ok) {
        setMsg({ ok: false, text: imp.error ?? "CEO 투두 이관 실패" });
        return;
      }

      // 원본(전직원 투두) 삭제 — CEO 투두 저장 성공 후.
      const del = await deleteTodos(items.map((i) => i.id));
      if (!del.ok) {
        setMsg({ ok: false, text: `CEO 투두엔 담았지만 삭제 실패: ${del.error}` });
        return;
      }
      const where = imp.ok ? "서버(모든 기기 동기화)" : "이 기기";
      setMsg({ ok: true, text: `${addedCount}건을 CEO 투두(최우선)로 옮겼습니다 · 저장: ${where}. 전직원 투두에서 삭제 완료.` });
      router.refresh();
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <button className="btn" onClick={run} disabled={pending} title="최운호 담당 업무를 CEO 투두로 이관">
        {pending ? "이관 중…" : "🔒 최운호 업무 → CEO 투두 이관"}
      </button>
      {msg && (
        <span style={{ fontSize: 12, color: msg.ok ? "var(--ok, #16a34a)" : "var(--owner, #b91c1c)" }}>{msg.text}</span>
      )}
    </div>
  );
}
