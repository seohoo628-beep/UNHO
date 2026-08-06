"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideUsage } from "@/app/(app)/leave/actions";
import { toast } from "@/lib/toast";

export default function LeaveApproveButtons({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  const decide = (decision: "approved" | "rejected") =>
    start(async () => {
      const r = await decideUsage(id, decision);
      if (!r.ok) toast(r.error ?? "처리 실패", "err");
      else {
        toast(decision === "approved" ? "연차를 승인했어요" : "연차 신청을 반려했어요", "ok");
        router.refresh();
      }
    });

  return (
    <span style={{ display: "inline-flex", gap: 6 }}>
      <button className="btn approve sm" disabled={pending} onClick={() => decide("approved")}>승인</button>
      <button className="btn reject sm" disabled={pending} onClick={() => decide("rejected")}>반려</button>
    </span>
  );
}
