"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updatePOStatus } from "@/app/(app)/vendors/actions";

const STATUSES = ["발주", "부분입고", "입고완료", "계산서수취", "지급완료", "취소"];

export default function POStatusSelect({ poId, status }: { poId: string; status: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <select
      defaultValue={status}
      disabled={pending}
      onChange={(e) => {
        const v = e.target.value;
        startTransition(async () => {
          await updatePOStatus(poId, v);
          router.refresh();
        });
      }}
      style={{ maxWidth: 130 }}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
