"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTaskStatus } from "@/app/(app)/tasks/actions";

const STATUSES = ["예정", "진행", "완료", "지연", "보류", "취소"];

export default function TaskStatusSelect({
  taskId,
  status,
}: {
  taskId: string;
  status: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <select
      defaultValue={status}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        startTransition(async () => {
          await updateTaskStatus(taskId, next);
          router.refresh();
        });
      }}
      style={{ maxWidth: 110 }}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
