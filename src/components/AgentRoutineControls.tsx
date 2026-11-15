"use client";

import { useState, useTransition } from "react";
import {
  toggleRoutine,
  updateRoutine,
  deleteRoutine,
  runRoutineNow,
  setRoutinesEnabled,
  prepareAllRoutines,
  runRoutineBatch,
  type RoutinePatch,
} from "@/app/(app)/agent-routines/actions";

type Msg = { ok: boolean; text: string } | null;

function Feedback({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <div style={{ fontSize: 12.5, marginTop: 6, color: msg.ok ? "var(--ok, #16a34a)" : "var(--danger, #dc2626)" }}>{msg.text}</div>
  );
}

export function RoutinesEnabledSwitch({ enabled, canEdit }: { enabled: boolean; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <div>
      <button
        className={`btn ${enabled ? "" : "primary"}`}
        disabled={!canEdit || pending}
        onClick={() =>
          start(async () => {
            const r = await setRoutinesEnabled(!enabled);
            setMsg({ ok: r.ok, text: r.message ?? "" });
          })
        }
        title={canEdit ? "" : "대표만 바꿀 수 있습니다"}
      >
        {enabled ? "자동 실행 끄기" : "자동 실행 켜기"}
      </button>
      <Feedback msg={msg} />
    </div>
  );
}

/** 대표 전용: 모든 AI 직원 업무를 지금 한 번 실행(묶음 반복). */
export function RunAllRoutinesButton() {
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const push = (t: string) => setLog((l) => [...l, t]);
  const run = async () => {
    if (busy) return;
    setBusy(true);
    setLog([]);
    try {
      const p = await prepareAllRoutines();
      if (!p.ok) { push(p.message ?? "준비 실패"); return; }
      push(`업무 ${p.created ?? 0}건 생성 · 실행 대기 ${p.pending ?? 0}건`);
      let done = 0, fail = 0, idle = 0;
      for (let i = 0; i < 12; i++) {
        const b = await runRoutineBatch();
        if (!b.ok) { push(b.message ?? "실행 실패"); break; }
        done += b.ok_count; fail += b.failed.length;
        b.failed.forEach((f) => push(`실패 · ${f}`));
        push(`${i + 1}회차: ${b.ran}건 실행 (성공 ${b.ok_count}) · 남은 ${b.pending}건`);
        if (b.pending === 0) break;
        idle = b.ran === 0 ? idle + 1 : 0;
        if (idle >= 2) { push("더 실행할 수 있는 업무가 없습니다(실행중 잠금 또는 실패 재시도 대기)."); break; }
      }
      push(`완료: 성공 ${done}건 · 실패 ${fail}건. 결과는 업무투두의 각 AI 업무 본문·체크리스트에 있습니다.`);
    } catch (e) {
      push(`중단: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <button className="btn primary" disabled={busy} onClick={run}>
        {busy ? "전체 실행 중…" : "AI 직원 전체 테스트 실행"}
      </button>
      {log.length > 0 && (
        <div style={{ fontSize: 12.5, marginTop: 8, display: "grid", gap: 2, maxHeight: 220, overflow: "auto" }}>
          {log.map((t, i) => <div key={i} className="muted">{t}</div>)}
        </div>
      )}
    </div>
  );
}

export type RoutineView = {
  id: string;
  title: string;
  cadence: "daily" | "weekly";
  weekday: number | null;
  due_offset_days: number;
  priority: string;
  context_keys: string[];
  instructions: string;
  auto_run: boolean;
  requires_review: boolean;
  active: boolean;
};

export function RoutineActions({ r }: { r: RoutineView }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      const res = await fn();
      setMsg(res.message ? { ok: res.ok, text: res.message } : null);
    });
  return (
    <div>
      <div className="btn-row" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button className="btn primary" disabled={pending || !r.active} onClick={() => run(() => runRoutineNow(r.id))}>
          {pending ? "처리 중…" : "지금 실행"}
        </button>
        <button className="btn" disabled={pending} onClick={() => run(() => toggleRoutine(r.id, "active", !r.active))}>
          {r.active ? "일시 중지" : "다시 켜기"}
        </button>
        <button className="btn" disabled={pending} onClick={() => run(() => toggleRoutine(r.id, "auto_run", !r.auto_run))}>
          {r.auto_run ? "자동 실행 끄기(투두만 생성)" : "자동 실행 켜기"}
        </button>
        <button className="btn" disabled={pending} onClick={() => run(() => toggleRoutine(r.id, "requires_review", !r.requires_review))}>
          {r.requires_review ? "검토 없이 완료 처리" : "실행 후 검토 대기"}
        </button>
      </div>
      <Feedback msg={msg} />
    </div>
  );
}

const WD = ["월", "화", "수", "목", "금", "토", "일"];

export function RoutineEditor({
  agentKey,
  r,
  contextKeys,
  contextLabels,
}: {
  agentKey: string;
  r?: RoutineView;
  contextKeys: string[];
  contextLabels: Record<string, string>;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const [f, setF] = useState<RoutinePatch>({
    title: r?.title ?? "",
    cadence: r?.cadence ?? "weekly",
    weekday: r?.weekday ?? 1,
    due_offset_days: r?.due_offset_days ?? 1,
    priority: r?.priority ?? "보통",
    context_keys: r?.context_keys ?? [],
    instructions: r?.instructions ?? "",
  });
  const set = <K extends keyof RoutinePatch>(k: K, v: RoutinePatch[K]) => setF((p) => ({ ...p, [k]: v }));
  const field: React.CSSProperties = { width: "100%", padding: "6px 8px", fontSize: 13 };

  return (
    <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
      <input style={field} placeholder="업무명" value={f.title} onChange={(e) => set("title", e.target.value)} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 13 }}>
        <select value={f.cadence} onChange={(e) => set("cadence", e.target.value as RoutinePatch["cadence"])}>
          <option value="daily">매일(평일)</option>
          <option value="weekly">매주</option>
        </select>
        {f.cadence === "weekly" && (
          <select value={f.weekday ?? 1} onChange={(e) => set("weekday", Number(e.target.value))}>
            {WD.map((w, i) => (
              <option key={w} value={i + 1}>{w}요일</option>
            ))}
          </select>
        )}
        <label>
          마감 +
          <input
            type="number"
            min={0}
            max={14}
            value={f.due_offset_days}
            onChange={(e) => set("due_offset_days", Number(e.target.value))}
            style={{ width: 56, marginLeft: 4 }}
          />
          영업일
        </label>
        <select value={f.priority} onChange={(e) => set("priority", e.target.value)}>
          {["높음", "보통", "낮음"].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12.5 }}>
        {contextKeys.map((k) => (
          <label key={k} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={f.context_keys.includes(k)}
              onChange={(e) =>
                set("context_keys", e.target.checked ? [...f.context_keys, k] : f.context_keys.filter((x) => x !== k))
              }
            />
            {contextLabels[k] ?? k}
          </label>
        ))}
      </div>
      <textarea
        style={{ ...field, minHeight: 90 }}
        placeholder="지시문: 무엇을 확인·정리해 보고할지"
        value={f.instructions}
        onChange={(e) => set("instructions", e.target.value)}
      />
      <div style={{ display: "flex", gap: 6 }}>
        <button
          className="btn primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await updateRoutine(r?.id ?? null, agentKey, f);
              setMsg({ ok: res.ok, text: res.message ?? "" });
            })
          }
        >
          {r ? "저장" : "추가"}
        </button>
        {r && (
          <button
            className="btn"
            disabled={pending}
            onClick={() => {
              if (!confirm("이 루틴을 삭제할까요? 이미 만들어진 투두는 남습니다.")) return;
              start(async () => {
                const res = await deleteRoutine(r.id);
                setMsg({ ok: res.ok, text: res.message ?? "" });
              });
            }}
          >
            삭제
          </button>
        )}
      </div>
      <Feedback msg={msg} />
    </div>
  );
}
