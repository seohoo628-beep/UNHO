"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";
import { sendCeoTodoDigest } from "@/lib/ceoTodoDigest";
import { sendCeoDueReminders } from "@/lib/ceoTodoReminders";
import { isCeoUser } from "@/lib/ceo";
import { snapshotCeoRecord } from "@/lib/ceoRevisions";
import { getAnthropic, createMessageWithFallback } from "@/lib/anthropic";
import type { CeoTodo, Pri } from "./data";
import { PRI_ORDER, CATS } from "./data";

type Result = { ok: boolean; error?: string; tableMissing?: boolean };

async function ownerGuard() {
  const u = await requireAppUser();
  return isCeoUser(u) ? u : null;
}

function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42P01" || /ceo_todos/.test(err.message ?? "");
}

function toRow(t: CeoTodo) {
  return {
    id: t.id,
    no: t.no ?? null,
    cat: t.cat ?? null,
    brand: t.brand ?? null,
    text: t.text,
    pri: t.pri,
    done: !!t.done,
    link: t.link ?? null,
    files: (t.files && t.files.length ? t.files : t.fileUrl ? [{ url: t.fileUrl, name: t.fileName ?? "파일" }] : []),
    due_date: t.dueDate ?? null,
    checklist: Array.isArray(t.checklist) ? t.checklist : [],
    src: t.src ?? null,
    updated_at: new Date().toISOString(),
  };
}

// 선택 컬럼(due_date/brand/checklist) 미적용 시 나는 오류인지 판별.
function isOptColMissing(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42703" || /due_date|brand|checklist/.test(err.message ?? "");
}

export async function upsertCeoTodo(t: CeoTodo): Promise<Result> {
  if (!(await ownerGuard())) return { ok: false, error: "대표만 사용할 수 있습니다." };
  const supabase = createSupabaseServerClient();
  // 기존 항목 수정이면 편집 직전 상태를 버전 기록으로 남긴다.
  const { data: prevRow } = await supabase.from("ceo_todos").select("*").eq("id", t.id).single();
  if (prevRow) await snapshotCeoRecord("ceo_todos", t.id, prevRow, "저장 전");
  let { error } = await supabase.from("ceo_todos").upsert(toRow(t));
  if (error && isOptColMissing(error)) {
    const { due_date, brand, checklist, ...rest } = toRow(t);
    void due_date; void brand; void checklist;
    ({ error } = await supabase.from("ceo_todos").upsert(rest));
  }
  if (error) return { ok: false, error: error.message, tableMissing: isMissingTable(error) };
  revalidatePath("/ceo-todos");
  return { ok: true };
}

// 하위 체크리스트만 저장(카드에서 즉시 체크). 컬럼 없으면 안내.
export async function setCeoChecklist(id: string, checklist: { id: string; text: string; done: boolean }[]): Promise<Result> {
  if (!(await ownerGuard())) return { ok: false, error: "대표만 사용할 수 있습니다." };
  const clean = (Array.isArray(checklist) ? checklist : [])
    .map((c) => ({ id: String(c?.id ?? ""), text: String(c?.text ?? "").trim(), done: !!c?.done }))
    .filter((c) => c.text).slice(0, 100);
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("ceo_todos").update({ checklist: clean, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) {
    if (error.code === "42703" || /checklist/.test(error.message ?? "")) return { ok: false, error: "체크리스트 컬럼이 없습니다. 0078_todo_checklist.sql을 실행하세요." };
    return { ok: false, error: error.message };
  }
  revalidatePath("/ceo-todos");
  return { ok: true };
}

export async function toggleCeoTodo(id: string, done: boolean): Promise<Result> {
  if (!(await ownerGuard())) return { ok: false, error: "대표만 사용할 수 있습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("ceo_todos").update({ done, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message, tableMissing: isMissingTable(error) };
  revalidatePath("/ceo-todos");
  return { ok: true };
}

export async function deleteCeoTodo(id: string): Promise<Result> {
  if (!(await ownerGuard())) return { ok: false, error: "대표만 사용할 수 있습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("ceo_todos").delete().eq("id", id);
  if (error) return { ok: false, error: error.message, tableMissing: isMissingTable(error) };
  revalidatePath("/ceo-todos");
  return { ok: true };
}

// 지금 바로 '당장실행' 다이제스트 테스트 발송(대표 전용).
export async function testSendCeoDigest(): Promise<{ ok: boolean; sent?: boolean; count?: number; dueToday?: number; due3?: number; error?: string }> {
  if (!(await ownerGuard())) return { ok: false, error: "대표만 사용할 수 있습니다." };
  const r = await sendCeoTodoDigest();
  const rem = await sendCeoDueReminders();
  if (r.skipped) return { ok: false, error: "메일 발송 설정(RESEND_API_KEY)이 필요합니다." };
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, sent: r.sent, count: r.count, dueToday: rem.dueToday, due3: rem.due3 };
}

// 상단 고정 토글. pinned 컬럼 없으면 columnMissing.
export async function setCeoPinned(id: string, pinned: boolean): Promise<{ ok: boolean; error?: string; columnMissing?: boolean }> {
  if (!(await ownerGuard())) return { ok: false, error: "대표만 사용할 수 있습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("ceo_todos").update({ pinned }).eq("id", id);
  if (error) {
    const columnMissing = error.code === "42703" || /pinned/.test(error.message ?? "");
    return { ok: false, error: error.message, columnMissing };
  }
  revalidatePath("/ceo-todos");
  return { ok: true };
}

// 수동 정렬 순서 저장(위/아래 이동). sort_order 컬럼 없으면 columnMissing.
export async function reorderCeoTodos(
  order: { id: string; sortOrder: number }[]
): Promise<{ ok: boolean; error?: string; columnMissing?: boolean }> {
  if (!(await ownerGuard())) return { ok: false, error: "대표만 사용할 수 있습니다." };
  const supabase = createSupabaseServerClient();
  const results = await Promise.all(
    (order || []).map((o) => supabase.from("ceo_todos").update({ sort_order: o.sortOrder }).eq("id", o.id))
  );
  const err = results.find((r) => r.error)?.error;
  if (err) {
    const columnMissing = err.code === "42703" || /sort_order/.test(err.message ?? "");
    return { ok: false, error: err.message, columnMissing };
  }
  revalidatePath("/ceo-todos");
  return { ok: true };
}

// ── AI 자동 정리: 분류별 묶기 + 의미 단위 재구성 → 상위 업무 + 하위 체크리스트 ──
export type ReorgGroup = { title: string; cat: string; pri: Pri; items: string[]; sourceIds: string[] };

// 현재 CEO 투두(완료 제외)를 AI로 재구성해 '제안'만 반환(저장 안 함).
export async function proposeCeoReorg(): Promise<{ ok: boolean; groups?: ReorgGroup[]; error?: string }> {
  if (!(await ownerGuard())) return { ok: false, error: "대표만 사용할 수 있습니다." };
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("ceo_todos").select("id,text,cat,brand,pri,done").eq("done", false).limit(500);
  if (error) return { ok: false, error: error.message };
  const todos = (data ?? []) as { id: string; text: string; cat: string | null; brand: string | null; pri: string | null }[];
  if (todos.length === 0) return { ok: false, error: "정리할 미완료 항목이 없습니다." };

  let anthropic;
  try { anthropic = await getAnthropic(); }
  catch { return { ok: false, error: "AI 연결(Anthropic 키)이 설정되지 않았습니다. 설정에서 키를 넣어주세요." }; }

  type T = { id: string; text: string; cat: string | null; pri: string | null };

  // 한 배치를 AI로 그룹핑. 실패 시 [] 반환(폴백이 커버).
  const groupBatch = async (batch: T[]): Promise<ReorgGroup[]> => {
    const idByNum = new Map<string, string>();
    const textByNum = new Map<string, string>();
    const list = batch.map((t, i) => {
      const n = "n" + (i + 1);
      idByNum.set(n, t.id);
      textByNum.set(n, t.text);
      return `${n} [${t.cat ?? "미분류"}${t.pri ? "/" + t.pri : ""}] ${t.text}`;
    }).join("\n");
    const prompt = `대표의 개인 할일들을 분류(cat)별로 묶고, 의미가 비슷한 것끼리 상위 업무로 재구성해라.
각 상위 업무: {"title":상위 업무명,"cat":분류,"pri":우선순위,"ids":[묶은 항목번호]}.
- title 은 묶음을 대표하는 **짧은 요약 제목(15자 내외)**. 원문 문장을 그대로 넣지 마라. 원문 내용은 하위 체크리스트로 들어간다.
- 관련된 항목 2~6개를 한 상위 업무로 묶어라(1개짜리 그룹은 최소화).
- 모든 번호(n1,n2…)가 정확히 하나의 상위 업무에 포함. 원문은 쓰지 말고 번호만.
- cat 은 [${CATS.join(", ")}, 미분류] 중 하나. pri 는 [${PRI_ORDER.join(", ")}] 중 하나(가장 높은 것).
출력은 JSON만: {"groups":[{"title":"","cat":"","pri":"","ids":["n1"]}]}. 다른 말 금지.

[할일]
${list}`;
    const callOnce = async (withThinking: boolean): Promise<string> => {
      const params: any = { max_tokens: 8000, messages: [{ role: "user", content: prompt }] };
      if (withThinking) params.thinking = { type: "enabled", budget_tokens: 1024 };
      const { msg } = await createMessageWithFallback(anthropic, params);
      const tp = msg.content.find((c) => c.type === "text") as { text: string } | undefined;
      return (tp?.text ?? "").trim();
    };
    let raw = "";
    try { raw = await callOnce(false); }
    catch { try { raw = await callOnce(true); } catch { return []; } }
    // 만약 잘렸다면 thinking 캡을 켜고 한 번 더.
    if (raw.indexOf("{") < 0 || raw.lastIndexOf("}") <= raw.indexOf("{")) {
      try { raw = await callOnce(true); } catch { /* keep */ }
    }
    const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
    if (s < 0 || e <= s) return [];
    let parsed: { groups?: any[] };
    try { parsed = JSON.parse(raw.slice(s, e + 1)); } catch { return []; }
    return (parsed.groups ?? []).map((g) => {
      const nums: string[] = Array.isArray(g?.ids) ? g.ids.map((x: any) => String(x)).filter((n: string) => idByNum.has(n)) : [];
      return {
        title: String(g?.title ?? "").trim(),
        cat: CATS.includes(String(g?.cat)) ? String(g.cat) : "미분류",
        pri: (PRI_ORDER as string[]).includes(String(g?.pri)) ? (String(g.pri) as Pri) : "중간",
        items: nums.map((n) => textByNum.get(n) ?? "").filter(Boolean),
        sourceIds: nums.map((n) => idByNum.get(n)!).filter(Boolean),
      };
    }).filter((g) => g.title && g.sourceIds.length);
  };

  // 30개씩 배치로 나눠 **병렬** 처리(시간초과·출력 잘림 방지).
  const CHUNK = 30;
  const batches: T[][] = [];
  for (let i = 0; i < todos.length; i += CHUNK) batches.push(todos.slice(i, i + CHUNK) as T[]);
  const groups: ReorgGroup[] = [];
  const covered = new Set<string>();
  const results = await Promise.all(batches.map((b) => groupBatch(b).catch(() => [] as ReorgGroup[])));
  for (const gs of results) for (const g of gs) { groups.push(g); g.sourceIds.forEach((id) => covered.add(id)); }

  // AI가 놓친 항목은 분류별로 묶어 보완(빠짐 방지).
  const uncovered = todos.filter((t) => !covered.has(t.id));
  if (uncovered.length) {
    const byCat = new Map<string, T[]>();
    for (const t of uncovered as T[]) {
      const k = t.cat && CATS.includes(t.cat) ? t.cat : "미분류";
      if (!byCat.has(k)) byCat.set(k, []);
      byCat.get(k)!.push(t);
    }
    for (const [k, arr] of byCat) {
      groups.push({
        title: `${k} (기타 정리)`,
        cat: k,
        pri: "중간",
        items: arr.map((t) => t.text),
        sourceIds: arr.map((t) => t.id),
      });
    }
  }

  if (groups.length === 0) return { ok: false, error: "AI 정리 결과가 비었습니다. 다시 시도해 주세요." };
  return { ok: true, groups };
}

// 확정: 제안(groups)대로 상위 업무를 새로 만들고, 소비된 원본 항목은 삭제한다.
export async function applyCeoReorg(groups: ReorgGroup[]): Promise<Result & { added?: number; removed?: number }> {
  if (!(await ownerGuard())) return { ok: false, error: "대표만 사용할 수 있습니다." };
  const supabase = createSupabaseServerClient();
  const clean = (Array.isArray(groups) ? groups : []).filter((g) => g && g.title);
  if (clean.length === 0) return { ok: false, error: "정리안이 비었습니다." };

  const genId = () => "u_" + Math.random().toString(36).slice(2, 9) + Math.random().toString(36).slice(2, 5);
  const cItemId = () => Math.random().toString(36).slice(2, 9);
  const rows = clean.map((g) => ({
    id: genId(),
    cat: g.cat && g.cat !== "미분류" ? g.cat : null,
    text: g.title,
    pri: g.pri,
    done: false,
    checklist: (g.items || []).map((t) => ({ id: cItemId(), text: t, done: false })),
    updated_at: new Date().toISOString(),
  }));
  const removeIds = [...new Set(clean.flatMap((g) => g.sourceIds || []))];

  // 새 상위 업무 삽입. 하위항목은 반드시 checklist 컬럼에 저장돼야 하므로,
  // 컬럼이 없으면 조용히 버리지 않고 명확히 알린다(원본도 삭제하지 않음).
  const insErr = (await supabase.from("ceo_todos").insert(rows)).error;
  if (insErr) {
    if (insErr.code === "42703" || /checklist/.test(insErr.message ?? "")) {
      return { ok: false, error: "하위 체크리스트 컬럼이 없어 저장할 수 없습니다. Supabase에서 0078_todo_checklist.sql을 실행한 뒤 다시 시도하세요. (원본은 그대로 유지됨)" };
    }
    return { ok: false, error: insErr.message, tableMissing: isMissingTable(insErr) };
  }

  // 소비된 원본 삭제
  let removed = 0;
  if (removeIds.length) {
    const { error: delErr } = await supabase.from("ceo_todos").delete().in("id", removeIds);
    if (!delErr) removed = removeIds.length;
  }
  revalidatePath("/ceo-todos");
  return { ok: true, added: rows.length, removed };
}

// 여러 개 한 번에 서버로 올리기(이 기기 localStorage 이전 · 전직원 투두 이관에 사용)
export async function importCeoTodos(list: CeoTodo[]): Promise<Result> {
  if (!(await ownerGuard())) return { ok: false, error: "대표만 사용할 수 있습니다." };
  const rows = (list || []).filter((t) => t && t.id && t.text).map(toRow);
  if (rows.length === 0) return { ok: true };
  const supabase = createSupabaseServerClient();
  let { error } = await supabase.from("ceo_todos").upsert(rows);
  if (error && isOptColMissing(error)) {
    const stripped = rows.map(({ due_date, brand, checklist, ...rest }) => { void due_date; void brand; void checklist; return rest; });
    ({ error } = await supabase.from("ceo_todos").upsert(stripped));
  }
  if (error) return { ok: false, error: error.message, tableMissing: isMissingTable(error) };
  revalidatePath("/ceo-todos");
  return { ok: true };
}
