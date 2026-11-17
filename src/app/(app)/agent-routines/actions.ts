"use server";

import { revalidatePath } from "next/cache";
import { requireAppUser } from "@/lib/auth";
import { setSetting } from "@/lib/settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { seoulToday } from "@/lib/time";
import { materializeRoutines, periodKey, addDays, type Cadence } from "@/lib/agentRoutines";
import { runRoutineTodo, runPendingRoutineTodos, CONTEXT_KEYS } from "@/lib/agents/routine";
import { actionViews, cleanPicks, defaultPicks, reportBody, WHOLE, type DispatchPick, type Staff } from "@/lib/agentDispatch";

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
  if (t.agent_status === "완료") return { ok: false, message: "이번 기간 업무는 이미 실행을 마쳤습니다. 결과는 업무투두의 해당 업무 본문에 있습니다." };
  if (t.agent_status !== "대기" && t.agent_status !== "실패") {
    await svc.from("todos").update({ agent_status: "대기" }).eq("id", t.id).is("agent_status", null);
  }
  const res = await runRoutineTodo(t.id);
  refresh();
  return res.ok
    ? { ok: true, message: "실행했습니다. 결과는 업무투두의 해당 업무 본문과 체크리스트에 작성됐습니다." }
    : { ok: false, message: res.error ?? "실행 실패" };
}

// ── 전체 테스트 실행 ────────────────────────────────────────────────────────
// 요일과 무관하게 모든 활성 루틴의 이번 기간 업무를 만들고, 화면이 묶음 단위(6건)로 반복 호출해 끝까지 실행한다.
// 대표 일일 보고(run_last)는 다른 업무가 모두 끝난 묶음에서 실행된다.

async function pendingCount(svc: ReturnType<typeof createSupabaseServiceClient>, today: string): Promise<number> {
  const { count } = await svc
    .from("todos")
    .select("id", { count: "exact", head: true })
    .not("routine_id", "is", null)
    .in("agent_status", ["대기", "실패", "실행중"])
    .in("status", ["예정", "진행"])
    .gte("due_date", addDays(today, -7));
  return count ?? 0;
}

export async function prepareAllRoutines(): Promise<Result & { pending?: number; created?: number }> {
  const u = await requireAppUser();
  if (u.role !== "owner") return { ok: false, message: "대표만 전체 실행할 수 있습니다." };
  const svc = createSupabaseServiceClient();
  const today = seoulToday();
  const { data: list, error } = await svc.from("agent_routines").select("id").eq("active", true);
  if (error) return { ok: false, message: "DB 마이그레이션(0100·0101) 적용이 필요합니다." };
  let created = 0;
  for (const r of (list ?? []) as { id: string }[]) {
    const n = await materializeRoutines(svc, today, r.id);
    if (n === null) return { ok: false, message: "DB 마이그레이션(0100·0101) 적용이 필요합니다." };
    created += n;
  }
  // 자동 실행이 꺼진 루틴 업무도 이번 테스트에서는 실행 대기로 올린다(이미 완료된 건은 그대로).
  await svc.from("todos").update({ agent_status: "대기" }).not("routine_id", "is", null).is("agent_status", null).in("status", ["예정", "진행"]);
  refresh();
  return { ok: true, created, pending: await pendingCount(svc, today) };
}

export async function runRoutineBatch(): Promise<Result & { ran: number; ok_count: number; failed: string[]; pending: number }> {
  const u = await requireAppUser();
  if (u.role !== "owner") return { ok: false, ran: 0, ok_count: 0, failed: [], pending: 0, message: "대표만 전체 실행할 수 있습니다." };
  const svc = createSupabaseServiceClient();
  const today = seoulToday();
  const res = await runPendingRoutineTodos(6);
  refresh();
  return {
    ok: true,
    ran: res.length,
    ok_count: res.filter((r) => r.ok).length,
    failed: res.filter((r) => !r.ok).map((r) => `${r.title}: ${r.error ?? "실패"}`),
    pending: await pendingCount(svc, today),
  };
}

/**
 * 승인 처리: 업무를 완료로. 검토 기록 컬럼(0102)이 없으면 완료 처리만 한다.
 * @returns 처리 건수, 실패 시 오류 메시지
 */
async function approveIds(svc: ReturnType<typeof createSupabaseServiceClient>, ids: string[], note = ""): Promise<number | string> {
  if (ids.length === 0) return 0;
  const now = new Date().toISOString();
  const base = { status: "완료", progress: 100, completed_at: now };
  const q = (patch: Record<string, unknown>) =>
    svc.from("todos").update(patch).in("id", ids).not("routine_id", "is", null).select("id");
  let res = await q({ ...base, agent_review: "승인", agent_review_note: note || null, agent_reviewed_at: now });
  if (res.error && /agent_review|column/i.test(res.error.message)) res = await q(base);
  if (res.error) return res.error.message;
  return (res.data ?? []).length;
}

// ── AI 결과 검토: 승인 / 반려(사유 → 다음 실행 지시에 반영, 바로 재실행 대기) ──
export async function reviewAgentTodo(todoId: string, decision: "승인" | "반려", note: string): Promise<Result> {
  const u = await staffOnly();
  const svc = createSupabaseServiceClient();
  const reason = (note || "").trim().slice(0, 500);
  if (decision === "반려" && !reason) return { ok: false, message: "반려 사유를 적어 주세요. 다음 실행 지시에 그대로 반영됩니다." };
  // 0102 전에는 agent_reject_count 컬럼이 없으므로 기본 컬럼만 먼저 읽는다.
  const { data: t } = await svc.from("todos").select("id, title, routine_id").eq("id", todoId).maybeSingle();
  const todo = t as { id: string; title: string; routine_id: string | null; agent_reject_count?: number } | null;
  if (todo && decision === "반려") {
    const { data: rc } = await svc.from("todos").select("agent_reject_count").eq("id", todoId).maybeSingle();
    todo.agent_reject_count = (rc as { agent_reject_count?: number } | null)?.agent_reject_count ?? 0;
  }
  if (!todo?.routine_id) return { ok: false, message: "AI 정기업무가 아닙니다." };
  const now = new Date().toISOString();

  if (decision === "승인") {
    const n = await approveIds(svc, [todoId], reason);
    if (typeof n === "string") return { ok: false, message: n };
    refresh();
    return { ok: true, message: "승인했습니다. 업무를 완료로 옮겼습니다." };
  }

  // 반려: 사유를 루틴 피드백(최신 5건)에 쌓고, 업무를 다시 실행 대기로 돌린다.
  const { data: r } = await svc.from("agent_routines").select("feedback").eq("id", todo.routine_id).maybeSingle();
  const prev = ((r as { feedback?: string | null } | null)?.feedback ?? "").split("\n").filter(Boolean);
  const line = `- ${seoulToday()} ${u.name ?? "대표"}: ${reason.replace(/\s+/g, " ")}`;
  const feedback = [line, ...prev].slice(0, 5).join("\n");
  const { error: e1 } = await svc.from("agent_routines").update({ feedback, updated_at: now }).eq("id", todo.routine_id);
  if (e1) return { ok: false, message: /feedback/.test(e1.message) ? "DB 마이그레이션(0102) 적용이 필요합니다." : e1.message };
  const { error: e2 } = await svc
    .from("todos")
    .update({
      agent_review: null,
      agent_review_note: reason,
      agent_reviewed_at: now,
      agent_reject_count: (todo.agent_reject_count ?? 0) + 1,
      agent_status: "대기",
      agent_error: null,
      status: "예정",
      progress: 0,
    })
    .eq("id", todoId);
  if (e2) return { ok: false, message: e2.message };
  refresh();
  return { ok: true, message: "반려했습니다. 사유를 반영해 다음 실행(또는 '지금 다시 실행')에서 새로 작성합니다." };
}

/** 반려 후 바로 다시 실행 */
export async function rerunAgentTodo(todoId: string): Promise<Result> {
  await staffOnly();
  const res = await runRoutineTodo(todoId);
  refresh();
  return res.ok ? { ok: true, message: "다시 실행했습니다. 새 결과가 업무 본문에 작성됐습니다." } : { ok: false, message: res.error ?? "실행 실패" };
}

// ── 승인 = 배정: 대표가 승인하면 결과는 사람 담당자의 업무가 된다 ──────────
type DispatchSrc = { id: string; title: string; routine_id: string | null; brand_id: string | null; priority: string | null; checklist: unknown; note: string | null };
const SRC_COLS = "id, title, routine_id, brand_id, priority, checklist, note";

async function activeStaff(svc: ReturnType<typeof createSupabaseServiceClient>): Promise<Staff[]> {
  const { data } = await svc.from("users").select("id, name, job_title").in("role", ["owner", "staff"]).eq("active", true).limit(200);
  return ((data ?? []) as { id: string; name: string | null; job_title: string | null }[])
    .filter((s) => s.name)
    .map((s) => ({ id: s.id, name: s.name as string, job_title: s.job_title }));
}

/** 고른 항목을 담당자 업무로 만들고 결과 업무를 승인(완료) 처리한다. */
async function dispatchAndApprove(
  svc: ReturnType<typeof createSupabaseServiceClient>,
  todo: DispatchSrc,
  picks: DispatchPick[],
  staffIds: Set<string>,
  approverId: string
): Promise<{ made: number; failed: string[]; error?: string }> {
  const list = cleanPicks(picks, staffIds);
  const checklist = Array.isArray(todo.checklist) ? ([...todo.checklist] as Record<string, unknown>[]) : [];
  const today = seoulToday();
  const body = reportBody(todo.note).slice(0, 1500);
  let made = 0;
  const failed: string[] = [];
  for (const p of list) {
    if (p.idx !== WHOLE && checklist[p.idx]?.dispatched) continue; // 이미 배정됨
    const from = p.idx === WHOLE ? "" : `\n제안 원문: ${String(checklist[p.idx]?.text ?? "")}`;
    const row = {
      title: p.title,
      brand_id: todo.brand_id,
      assignee_user_id: p.assigneeId,
      assignee_user_ids: [p.assigneeId],
      priority: todo.priority ?? "보통",
      due_date: p.due ?? addDays(today, 2),
      status: "예정",
      note: `[AI 제안 · 대표 승인 ${today}] '${todo.title}' 결과에서 배정된 업무입니다.${from}\n\n${body}`,
      created_by: approverId,
    };
    let ins = await svc.from("todos").insert({ ...row, source_todo_id: todo.id }).select("id").single();
    // 0108 전에는 출처 컬럼 없이 만든다.
    if (ins.error && /source_todo_id/.test(ins.error.message)) ins = await svc.from("todos").insert(row).select("id").single();
    if (ins.error || !ins.data) { failed.push(p.title); continue; }
    made += 1;
    if (p.idx !== WHOLE && checklist[p.idx]) checklist[p.idx] = { ...checklist[p.idx], dispatched: (ins.data as { id: string }).id };
  }
  if (made) await svc.from("todos").update({ checklist }).eq("id", todo.id);
  // 배정이 한 건도 안 됐으면 결과 업무를 닫지 않는다(승인이 배정 없이 사라지지 않게).
  if (made === 0) return { made, failed, error: failed.length ? `배정 실패: ${failed.join(", ")}` : "배정할 업무를 하나 이상 고르세요." };
  const n = await approveIds(svc, [todo.id], `업무 ${made}건 배정`);
  if (typeof n === "string") return { made, failed, error: n };
  return { made, failed };
}

/** 카드별 승인: 대표가 고른 항목·담당·마감으로 배정 */
export async function approveAndDispatch(todoId: string, picks: DispatchPick[]): Promise<Result> {
  const u = await staffOnly();
  const svc = createSupabaseServiceClient();
  const { data: t } = await svc.from("todos").select(SRC_COLS).eq("id", todoId).maybeSingle();
  const todo = t as DispatchSrc | null;
  if (!todo?.routine_id) return { ok: false, message: "AI 정기업무가 아닙니다." };
  const staff = await activeStaff(svc);
  const res = await dispatchAndApprove(svc, todo, picks, new Set(staff.map((s) => s.id)), u.id);
  refresh();
  revalidatePath("/ceo-todos");
  if (res.error) return { ok: false, message: res.error };
  const tail = res.failed.length ? ` 배정 실패: ${res.failed.join(", ")}` : "";
  return { ok: res.failed.length === 0, message: `승인해 업무 ${res.made}건을 배정했습니다.${tail}` };
}

/** 전체 승인: 카드마다 기본 배정안(추천 담당, 없으면 승인자)으로 배정 */
export async function approveAllAndDispatch(ids: string[]): Promise<Result> {
  const u = await staffOnly();
  const svc = createSupabaseServiceClient();
  const list = (ids || []).filter((x) => typeof x === "string").slice(0, 100);
  if (list.length === 0) return { ok: false, message: "승인할 업무가 없습니다." };
  const { data } = await svc.from("todos").select(SRC_COLS).in("id", list).not("routine_id", "is", null);
  const staff = await activeStaff(svc);
  const valid = new Set(staff.map((s) => s.id));
  let cards = 0, made = 0;
  const errs: string[] = [];
  for (const todo of (data ?? []) as DispatchSrc[]) {
    const picks = defaultPicks(actionViews(todo.checklist, staff), todo.title, u.id);
    const res = await dispatchAndApprove(svc, todo, picks, valid, u.id);
    if (res.error) errs.push(`${todo.title}: ${res.error}`);
    else { cards += 1; made += res.made; }
  }
  refresh();
  revalidatePath("/ceo-todos");
  const tail = errs.length ? ` 처리 못 한 건: ${errs.slice(0, 3).join(" / ")}` : "";
  return { ok: errs.length === 0, message: `${cards}건을 승인해 업무 ${made}건을 배정했습니다. 담당 추천이 없던 항목은 대표님께 배정됐으니 업무투두에서 넘기세요.${tail}` };
}
