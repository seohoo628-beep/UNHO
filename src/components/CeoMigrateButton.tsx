"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getChoiTodos, deleteTodos } from "@/app/(app)/todos/actions";
import { CEO_TODOS, type CeoTodo } from "@/app/(app)/ceo-todos/data";

const DATA_KEY = "ceo-todos-v1"; // CeoTodosPage와 동일 키

// 최운호 담당 업무를 CEO 투두(localStorage)로 이관하고 전직원 투두에서 삭제한다.
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

      // 현재 CEO 보드 상태를 읽어(없으면 기본 시드), 이미 옮긴 건 건너뛰고 추가한다.
      let board: CeoTodo[] = CEO_TODOS;
      try {
        const raw = localStorage.getItem(DATA_KEY);
        if (raw) board = JSON.parse(raw) as CeoTodo[];
      } catch {
        board = CEO_TODOS;
      }
      const already = new Set(board.map((b) => b.src).filter(Boolean) as string[]);

      const added: CeoTodo[] = items
        .filter((it) => !already.has(it.id))
        .map((it) => ({
          id: "mig_" + it.id,
          src: it.id,
          text:
            (it.brandName ? `[${it.brandName}] ` : "") + it.title + (it.note ? ` — ${it.note}` : ""),
          pri: "최우선",
          done: it.status === "완료",
        }));

      const merged = [...added, ...board];
      try {
        localStorage.setItem(DATA_KEY, JSON.stringify(merged));
      } catch {
        setMsg({ ok: false, text: "브라우저 저장에 실패했습니다. 저장공간을 확인하세요." });
        return;
      }

      // DB에서 원본 삭제(로컬 저장 성공 후).
      const del = await deleteTodos(items.map((i) => i.id));
      if (!del.ok) {
        setMsg({ ok: false, text: `CEO 투두엔 담았지만 삭제 실패: ${del.error}` });
        return;
      }
      setMsg({ ok: true, text: `${added.length}건을 CEO 투두(최우선)로 옮기고 전직원 투두에서 삭제했습니다.` });
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
