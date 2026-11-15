"use client";

import { useState, useTransition } from "react";
import { runRoutineNow, reviewAgentTodo } from "@/app/(app)/agent-routines/actions";

/** 오늘 기획안 3건을 지금 바로 생성(시리즈별로 순서대로 실행). */
export function GenerateTodayButton({ routineIds }: { routineIds: string[] }) {
  const [pending, start] = useTransition();
  const [log, setLog] = useState<string[]>([]);
  return (
    <div>
      <button
        className="btn primary"
        disabled={pending || routineIds.length === 0}
        onClick={() =>
          start(async () => {
            setLog([]);
            for (const [i, id] of routineIds.entries()) {
              const r = await runRoutineNow(id);
              setLog((l) => [...l, `${i + 1}/${routineIds.length} ${r.ok ? "완료" : r.message ?? "실패"}`]);
            }
          })
        }
      >
        {pending ? "기획안 작성 중… (건당 30~50초)" : "오늘 기획안 지금 만들기"}
      </button>
      {log.length > 0 && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{log.join(" · ")}</div>}
    </div>
  );
}

/** 기획 확정(승인) → 업무 완료. */
export function ConfirmPlanButton({ todoId }: { todoId: string }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  if (done) return <span className="badge ok">촬영 확정</span>;
  return (
    <span>
      <button className="btn sm primary" disabled={pending} onClick={() => start(async () => {
        const r = await reviewAgentTodo(todoId, "승인", "촬영 확정");
        if (r.ok) setDone(true); else setErr(r.message ?? "실패");
      })}>{pending ? "처리 중…" : "촬영 확정"}</button>
      {err && <span style={{ color: "var(--owner)", fontSize: 12, marginLeft: 6 }}>{err}</span>}
    </span>
  );
}
