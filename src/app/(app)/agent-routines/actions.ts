"use server";

import { revalidatePath } from "next/cache";
import { requireAppUser } from "@/lib/auth";
import { setSetting } from "@/lib/settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { seoulToday } from "@/lib/time";
import { materializeRoutines, periodKey, type Cadence } from "@/lib/agentRoutines";
import { runRoutineTodo, CONTEXT_KEYS } from "@/lib/agents/routine";

type Result = { ok: boolean; message?: string };

async function staffOnly() {
  const u = await requireAppUser();
  if (u.role !== "owner" && u.role !== "staff") throw new Error("권한이 없습니다.");
  return u;
}

const refresh = () => {
  revalidatePath("/agent-routines");
  revalidatePath("/todos");
};

export async function setRoutinesEnabled(enabled: boolean): Promise<Result> {
  const u = await requireAppUser();
  if (u.role !== "owner") return { ok: false, message: "대표만 바꿀 수 있습니다." };
  await setSetting("agent_routines_enabled", enabled ? null : "false");
  refresh();
  return { ok: true, message: enabled ? "AI 정기업무 자동 실행을 켰습니다." : "AI 정기업무 자동 실행을 껐습니다." };
}

export async function toggleRoutine(id: string, field: "active" | "auto_run" | "requires_review", value: boolean): Promise<Result> {
  await staffOnly();
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("agent_routines")
    .update({ [field]: value, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, message: error.message };
  refresh();
  return { ok: true };
}

export type RoutinePatch = {
  title: string;
  cadence: Cadence;
  weekday: number | null;
  due_offset_days: number;
  priority: string;
  context_keys: string[];
  instructions: string;
};

export async function updateRoutine(id: string | null, agentKey: string, p: RoutinePatch): Promise<Result> {
  await staffOnly();
  const title = (p.title || "").trim();
  const instructions = (p.instructions || "").trim();
  if (!title || !instructions) return { ok: false, message: "업무명과 지시문을 입력하세요." };
  const row = {
    title,
    cadence: p.cadence === "weekly" ? "weekly" : "daily",
    weekday: p.cadence === "weekly" ? Math.min(7, Math.max(1, Number(p.weekday) || 1)) : null,
    due_offset_days: Math.min(14, Math.max(0, Math.round(Number(p.due_offset_days) || 0))),
    priority: ["높음", "보통", "낮음"].includes(p.priority) ? p.priority : "보통",
    context_keys: (p.context_keys || []).filter((k) => CONTEXT_KEYS.includes(k)),
    instructions,
    updated_at: new Date().toISOString(),
  };
  const supabase = createSupabaseServerClient();
  const { error } = id
    ? await supabase.from("agent_routines").update(row).eq("id", id)
    : await supabase.from("agent_routines").insert({ ...row, agent_key: agentKey });
  if (error) return { ok: false, message: error.code === "23505" ? "같은 에이전트에 같은 업무명이 이미 있습니다." : error.message };
  refresh();
  return { ok: true, message: id ? "저장했습니다." : "루틴을 추가했습니다." };
}

export async function deleteRoutine(id: string): Promise<Result> {
  await staffOnly();
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("agent_routines").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };
  refresh();
  return { ok: true, message: "삭제했습니다. 이미 만들어진 투두는 남습니다." };
}

/** 지금 실행: 이번 기간 투두를 만들고(없으면) 바로 실행한다. */
export async function runRoutineNow(id: string): Promise<Result> {
  await staffOnly();
  const svc = createSupabaseServiceClient();
  const today = seoulToday();
  const { data: r } = await svc.from("agent_routines").select("id, cadence").eq("id", id).maybeSingle();
  if (!r) return { ok: false, message: "루틴을 찾을 수 없습니다." };
  const created = await materializeRoutines(svc, today, id);
  if (created === null) return { ok: false, message: "DB 마이그레이션(0100) 적용이 필요합니다." };

  const period = periodKey((r as { cadence: Cadence }).cadence, today);
  const { data: todo } = await svc
    .from("todos")
    .select("id, agent_status")
    .eq("routine_id", id)
    .eq("routine_period", period)
    .maybeSingle();
  if (!todo) return { ok: false, message: "투두를 만들지 못했습니다." };
  const t = todo as { id: string; agent_status: string | null };
  if (t.agent_status === "완료") return { ok: false, message: "이번 기간 업무는 이미 실행을 마쳤습니다. 결과는 업무투두 댓글에 있습니다." };
  if (t.agent_status !== "대기" && t.agent_status !== "실패") {
    await svc.from("todos").update({ agent_status: "대기" }).eq("id", t.id).is("agent_status", null);
  }
  const res = await runRoutineTodo(t.id);
  refresh();
  return res.ok
    ? { ok: true, message: "실행했습니다. 결과는 업무투두의 해당 업무 댓글에 등록됐습니다." }
    : { ok: false, message: res.error ?? "실행 실패" };
}
