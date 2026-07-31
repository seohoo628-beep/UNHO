"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTodoStatus, deleteTodo } from "@/app/(app)/todos/actions";

const STATUSES = ["예정", "진행", "보류", "완료", "취소"];

export default function TodoRowActions({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <select
        defaultValue={status}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          start(async () => {
            await setTodoStatus(id, next);
            router.refresh();
          });
        }}
        style={{ maxWidth: 96 }}
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <button
        className="btn sm"
        disabled={pending}
        title="삭제"
        onClick={() => {
          if (!confirm("이 할 일을 삭제할까요?")) return;
          start(async () => {
            await deleteTodo(id);
            router.refresh();
          });
        }}
      >
        삭제
      </button>
    </span>
  );
}
