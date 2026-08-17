"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";
import { isCeoUser } from "@/lib/ceo";
import { snapshotCeoRecord } from "@/lib/ceoRevisions";
import { getAnthropic, createMessageWithFallback } from "@/lib/anthropic";

type Result = { ok: boolean; error?: string; tableMissing?: boolean; columnMissing?: boolean };

// 어시스턴트와 동일하게 빠른 모델 우선.
const FAST_MODELS = ["claude-haiku-4-5-20251001", "claude-sonnet-5", "claude-3-5-haiku-20241022", "claude-3-5-sonnet-latest"];
const genId = () => Math.random().toString(36).slice(2, 9) + Math.random().toString(36).slice(2, 5);

export type ReminderReorgItem = { text: string; srcIds: string[] };
export type ReminderReorgGroup = { title: string; items: ReminderReorgItem[] };

async function guard() {
  const user = await requireAppUser();
  if (!isCeoUser(user)) throw new Error("권한이 없습니다.");
  return user;
}

function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42P01" || /reminders/.test(err.message ?? "");
}

export async function createReminder(text: string, cat: string, brand: string): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const t = (text || "").trim();
  if (!t) return { ok: false, error: "내용을 입력하세요." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("reminders").insert({ text: t, cat: (cat || "").trim() || null, brand: (brand || "").trim() || null });
  if (error) return { ok: false, error: error.message, tableMissing: isMissingTable(error) };
  revalidatePath("/reminders");
  return { ok: true };
}

export async function updateReminder(id: string, text: string, cat: string, brand: string): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const t = (text || "").trim();
  if (!t) return { ok: false, error: "내용을 입력하세요." };
  const supabase = createSupabaseServerClient();
  const { data: prev } = await supabase.from("reminders").select("*").eq("id", id).single();
  if (prev) await snapshotCeoRecord("reminders", id, prev, "저장 전");
  const { error } = await supabase.from("reminders").update({ text: t, cat: (cat || "").trim() || null, brand: (brand || "").trim() || null, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/reminders");
  return { ok: true };
}

export async function toggleReminder(id: string, done: boolean): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("reminders").update({ done, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/reminders");
  return { ok: true };
}

// 하위 체크리스트 저장(jsonb).
export async function setReminderChecklist(id: string, checklist: { id: string; text: string; done: boolean; pinned?: boolean }[]): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const supabase = createSupabaseServerClient();
  const clean = (Array.isArray(checklist) ? checklist : [])
    .map((c: any) => ({ id: String(c?.id ?? ""), text: String(c?.text ?? "").trim(), done: !!c?.done, pinned: !!c?.pinned, brand: c?.brand ? String(c.brand) : null, due: /^\d{4}-\d{2}-\d{2}$/.test(String(c?.due ?? "")) ? String(c.due) : null }))
    .filter((c) => c.id && c.text);
  const { error } = await supabase.from("reminders").update({ checklist: clean, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) {
    const columnMissing = error.code === "42703" || /checklist/.test(error.message ?? "");
    return { ok: false, error: columnMissing ? "체크리스트 컬럼이 없습니다. 0080 마이그레이션을 실행해 주세요." : error.message, columnMissing };
  }
  revalidatePath("/reminders");
  return { ok: true };
}

// 체크리스트 항목을 다른 리마인드의 체크리스트로 이동(교차 드래그).
const normCk = (v: any) => (Array.isArray(v) ? v : []).map((c: any) => ({ id: String(c?.id ?? genId()), text: String(c?.text ?? "").trim(), done: !!c?.done, pinned: !!c?.pinned, brand: c?.brand ? String(c.brand) : null, due: /^\d{4}-\d{2}-\d{2}$/.test(String(c?.due ?? "")) ? String(c.due) : null })).filter((c: any) => c.text);
export async function moveReminderChecklistItem(fromId: string, toId: string, itemId: string): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  if (fromId === toId) return { ok: true };
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("reminders").select("id,checklist").in("id", [fromId, toId]);
  if (error) return { ok: false, error: error.message };
  const from = (data ?? []).find((r: any) => r.id === fromId); const to = (data ?? []).find((r: any) => r.id === toId);
  if (!from || !to) return { ok: false, error: "대상을 찾을 수 없습니다." };
  const fromList = normCk(from.checklist); const item = fromList.find((c: any) => c.id === itemId);
  if (!item) return { ok: false, error: "항목을 찾을 수 없습니다." };
  const r1 = await supabase.from("reminders").update({ checklist: fromList.filter((c: any) => c.id !== itemId), updated_at: new Date().toISOString() }).eq("id", fromId);
  const r2 = await supabase.from("reminders").update({ checklist: [...normCk(to.checklist), item], updated_at: new Date().toISOString() }).eq("id", toId);
  if (r1.error || r2.error) return { ok: false, error: (r1.error || r2.error)!.message };
  revalidatePath("/reminders");
  return { ok: true };
}

// 상위 리마인드를 다른 리마인드의 체크리스트로 편입 후 원본 삭제.
export async function demoteReminderToChecklist(parentId: string, targetId: string): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  if (parentId === targetId) return { ok: true };
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("reminders").select("id,text,checklist").in("id", [parentId, targetId]);
  if (error) return { ok: false, error: error.message };
  const src = (data ?? []).find((r: any) => r.id === parentId); const tgt = (data ?? []).find((r: any) => r.id === targetId);
  if (!src || !tgt) return { ok: false, error: "대상을 찾을 수 없습니다." };
  const nextTo = [...normCk(tgt.checklist), { id: genId(), text: String(src.text ?? "").trim() || "항목", done: false }, ...normCk(src.checklist)];
  const r1 = await supabase.from("reminders").update({ checklist: nextTo, updated_at: new Date().toISOString() }).eq("id", targetId);
  if (r1.error) return { ok: false, error: r1.error.message };
  await supabase.from("reminders").delete().eq("id", parentId);
  revalidatePath("/reminders");
  return { ok: true };
}

// 상단 고정 토글.
export async function setReminderPinned(id: string, pinned: boolean): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("reminders").update({ pinned }).eq("id", id);
  if (error) {
    const columnMissing = error.code === "42703" || /pinned/.test(error.message ?? "");
    return { ok: false, error: error.message, columnMissing };
  }
  revalidatePath("/reminders");
  return { ok: true };
}

// 수동 정렬 순서 저장(위/아래·최상단·드래그 이동).
export async function reorderReminders(order: { id: string; sortOrder: number }[]): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const supabase = createSupabaseServerClient();
  const results = await Promise.all(
    (order || []).map((o) => supabase.from("reminders").update({ sort_order: o.sortOrder }).eq("id", o.id))
  );
  const err = results.find((r) => r.error)?.error;
  if (err) {
    const columnMissing = err.code === "42703" || /sort_order/.test(err.message ?? "");
    return { ok: false, error: err.message, columnMissing };
  }
  revalidatePath("/reminders");
  return { ok: true };
}

export async function deleteReminder(id: string): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("reminders").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/reminders");
  return { ok: true };
}

// ── 리마인드 자동 정리(분야별 상위 카테고리 + 하위 체크리스트 + 문구 다듬기) ──
// AI가 분야별로 묶고 각 항목 문구를 간결히 다듬어 제안. 미리보기 후 확정 시 반영.
export async function proposeReminderReorg(): Promise<{ ok: boolean; error?: string; groups?: ReminderReorgGroup[] }> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("reminders").select("id,text,cat").eq("done", false).limit(600);
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []).filter((r: any) => (r.text || "").trim());
  if (!rows.length) return { ok: false, error: "정리할 리마인드가 없습니다." };

  // 컴팩트 입력: n|기존분류|내용
  const idByN = new Map<number, string>();
  const lines = rows.map((r: any, i: number) => { idByN.set(i + 1, r.id); return `${i + 1}|${(r.cat || "").trim()}|${String(r.text).replace(/\s+/g, " ").trim().slice(0, 200)}`; });

  const system = `당신은 한국어 리마인드(메모) 목록을 깔끔하게 재구성하는 도우미입니다.
규칙:
- 항목들을 의미가 비슷한 것끼리 분야별 상위 카테고리 4~9개로 묶습니다(예: 제품·브랜드, 자금·투자, 유통·영업, 인맥·네트워크, 개인·건강, 마케팅·콘텐츠, 운영·시스템, F&B, 원칙·전략 등 내용에 맞게).
- 각 항목의 문구를 군더더기 없이 간결하고 명확하게 다듬되(맞춤법·띄어쓰기 정리, 중복어 제거), 의미와 고유명사는 절대 바꾸지 않습니다.
- 거의 같은 내용은 하나로 합쳐도 됩니다(그럴 땐 n을 여러 개 나열).
- 반드시 아래 JSON 형식만 출력합니다(설명·코드펜스 금지):
{"groups":[{"title":"카테고리명","items":[{"n":[1,2],"text":"다듬은 문구"}]}]}
- 모든 입력 번호가 최소 한 번은 items의 n에 포함돼야 합니다.`;
  const userMsg = `아래는 "번호|기존분류|내용" 형식의 리마인드 목록입니다. 위 규칙대로 재구성해 JSON만 출력하세요.\n\n${lines.join("\n")}`;

  try {
    const anthropic = await getAnthropic();
    const { msg } = await createMessageWithFallback(anthropic, { max_tokens: 8000, system, messages: [{ role: "user", content: userMsg }] } as any, FAST_MODELS);
    const raw = ((msg.content ?? []) as any[]).filter((b) => b.type === "text").map((b) => b.text || "").join("").trim();
    const jsonStr = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const start = jsonStr.indexOf("{"); const end = jsonStr.lastIndexOf("}");
    const parsed = JSON.parse(start >= 0 && end >= 0 ? jsonStr.slice(start, end + 1) : jsonStr);
    const rawGroups = Array.isArray(parsed?.groups) ? parsed.groups : [];
    const groups: ReminderReorgGroup[] = [];
    for (const g of rawGroups) {
      const title = String(g?.title ?? "").trim();
      const items: ReminderReorgItem[] = [];
      for (const it of (Array.isArray(g?.items) ? g.items : [])) {
        const text = String(it?.text ?? "").trim();
        const ns = Array.isArray(it?.n) ? it.n : (it?.n != null ? [it.n] : []);
        const srcIds = ns.map((n: any) => idByN.get(Number(n))).filter((x: any): x is string => !!x);
        if (text && srcIds.length) items.push({ text, srcIds });
      }
      if (title && items.length) groups.push({ title, items });
    }
    if (!groups.length) return { ok: false, error: "AI 응답을 해석하지 못했습니다. 다시 시도해 주세요." };
    return { ok: true, groups };
  } catch (e: any) {
    return { ok: false, error: `정리 실패: ${e?.message || String(e)}` };
  }
}

// 확정 반영: 카테고리별 상위 리마인드 생성(하위 체크리스트 포함) + 흡수된 기존 항목 삭제.
export async function applyReminderReorg(groups: ReminderReorgGroup[]): Promise<Result & { created?: number; removed?: number }> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  if (!Array.isArray(groups) || !groups.length) return { ok: false, error: "적용할 내용이 없습니다." };
  const supabase = createSupabaseServerClient();

  const consumed = new Set<string>();
  let created = 0;
  for (const g of groups) {
    const checklist = g.items.map((it) => ({ id: genId(), text: it.text, done: false }));
    for (const it of g.items) for (const id of it.srcIds) consumed.add(id);
    const { error } = await supabase.from("reminders").insert({ text: g.title, cat: g.title, checklist });
    if (error) {
      const columnMissing = error.code === "42703" || /checklist/.test(error.message ?? "");
      return { ok: false, error: columnMissing ? "체크리스트 컬럼이 없습니다. 0080 마이그레이션을 먼저 실행하세요." : error.message, columnMissing };
    }
    created++;
  }
  const ids = [...consumed];
  let removed = 0;
  if (ids.length) {
    const { error } = await supabase.from("reminders").delete().in("id", ids);
    if (!error) removed = ids.length;
  }
  revalidatePath("/reminders");
  return { ok: true, created, removed };
}

// 리마인드 → CEO 투두로 이동(내용·분류·브랜드·체크리스트 이전 후 원본 삭제).
export async function moveReminderToCeoTodo(id: string): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const supabase = createSupabaseServerClient();
  const { data: r, error } = await supabase.from("reminders").select("text,cat,brand,done,checklist").eq("id", id).single();
  if (error || !r) return { ok: false, error: "항목을 찾을 수 없습니다." };
  const cid = "u_" + genId();
  const row: any = { id: cid, text: r.text, cat: r.cat ?? null, brand: r.brand ?? null, pri: "최우선", done: !!r.done };
  let ins = await supabase.from("ceo_todos").insert({ ...row, checklist: Array.isArray(r.checklist) ? r.checklist : [] });
  if (ins.error && /checklist/.test(ins.error.message ?? "")) ins = await supabase.from("ceo_todos").insert(row);
  if (ins.error) return { ok: false, error: ins.error.message };
  await supabase.from("reminders").delete().eq("id", id);
  revalidatePath("/reminders"); revalidatePath("/ceo-todos");
  return { ok: true };
}

// 리마인드의 하위 체크리스트 항목 하나를 CEO 투두의 상위 항목으로 이동.
export async function moveReminderChecklistItemToCeo(reminderId: string, itemId: string): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const supabase = createSupabaseServerClient();
  const { data: r, error } = await supabase.from("reminders").select("cat,brand,checklist").eq("id", reminderId).single();
  if (error || !r) return { ok: false, error: "항목을 찾을 수 없습니다." };
  const list: any[] = Array.isArray(r.checklist) ? r.checklist : [];
  const it = list.find((c) => String(c?.id) === String(itemId));
  if (!it) return { ok: false, error: "체크리스트 항목을 찾을 수 없습니다." };
  const text = String(it.text ?? "").trim();
  if (!text) return { ok: false, error: "빈 항목은 이동할 수 없습니다." };
  const cid = "u_" + genId();
  const row: any = { id: cid, text, cat: r.cat ?? null, brand: it.brand ?? r.brand ?? null, pri: "최우선", done: !!it.done };
  let ins = await supabase.from("ceo_todos").insert({ ...row, checklist: [] });
  if (ins.error && /checklist/.test(ins.error.message ?? "")) ins = await supabase.from("ceo_todos").insert(row);
  if (ins.error) return { ok: false, error: ins.error.message };
  const next = list.filter((c) => String(c?.id) !== String(itemId));
  await supabase.from("reminders").update({ checklist: next, updated_at: new Date().toISOString() }).eq("id", reminderId);
  revalidatePath("/reminders"); revalidatePath("/ceo-todos");
  return { ok: true };
}
