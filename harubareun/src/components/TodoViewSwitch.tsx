"use client";

import { useEffect, useState } from "react";
import TodoKanban, { type KanbanCard } from "@/components/TodoKanban";

type Opt = { id: string; name: string };

// 담당자별(표) ↔ 보드(칸반) 전환. 표 뷰는 서버에서 렌더된 children을 그대로 보여준다.
export default function TodoViewSwitch({
  cards,
  users,
  children,
}: {
  cards: KanbanCard[];
  users: Opt[];
  children: React.ReactNode;
}) {
  const [view, setView] = useState<"list" | "board">("list");

  useEffect(() => {
    try {
      const v = localStorage.getItem("todoView");
      if (v === "board" || v === "list") setView(v);
    } catch {
      /* ignore */
    }
  }, []);

  const pick = (v: "list" | "board") => {
    setView(v);
    try {
      localStorage.setItem("todoView", v);
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      <div className="seg" style={{ display: "inline-flex", gap: 4, marginBottom: 12 }}>
        <button className={`btn sm${view === "list" ? " primary" : ""}`} onClick={() => pick("list")}>
          담당자별
        </button>
        <button className={`btn sm${view === "board" ? " primary" : ""}`} onClick={() => pick("board")}>
          🗂 보드
        </button>
      </div>

      {view === "board" ? <TodoKanban cards={cards} users={users} /> : children}
    </>
  );
}
