"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";

type Result = { ok: boolean; error?: string };

async function guard() {
  const u = await requireAppUser();
  if (u.role !== "owner" && u.role !== "staff") throw new Error("권한이 없습니다.");
  return u;
}

const STATUSES = ["미착수", "진행", "완료", "지연", "보류"];

export async function updateChecklistStatus(id: string, status: string): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  if (!STATUSES.includes(status)) return { ok: false, error: "잘못된 상태" };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("launch_checklist")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/launch-prep");
  return { ok: true };
}

type SubItem = { text: string; done: boolean };
export async function setLaunchChecklist(id: string, checklist: SubItem[]): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const clean = (Array.isArray(checklist) ? checklist : [])
    .slice(0, 100)
    .map((c) => ({ text: String(c?.text ?? "").slice(0, 300), done: !!c?.done }))
    .filter((c) => c.text.trim() !== "");
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("launch_checklist")
    .update({ checklist: clean, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/launch-prep");
  return { ok: true };
}

export async function promoteLaunchChecklistItem(parentId: string, text: string): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const t = String(text ?? "").trim();
  if (!t) return { ok: false, error: "내용이 없습니다." };
  const supabase = createSupabaseServerClient();
  const { data: p } = await supabase
    .from("launch_checklist")
    .select("brand_id, scope, category, owner_role, collab, reviewer, priority")
    .eq("id", parentId)
    .maybeSingle();
  const parent = (p ?? {}) as { brand_id?: string | null; scope?: string; category?: string; owner_role?: string | null; collab?: string | null; reviewer?: string | null; priority?: string };
  const { error } = await supabase.from("launch_checklist").insert({
    brand_id: parent.brand_id ?? null,
    scope: parent.scope ?? "전사",
    category: parent.category ?? "기타",
    item: t,
    owner_role: parent.owner_role ?? null,
    collab: parent.collab ?? null,
    reviewer: parent.reviewer ?? null,
    priority: parent.priority ?? "일반",
    status: "미착수",
    sort_order: 999,
    note: "상위로 이동됨",
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/launch-prep");
  return { ok: true };
}
