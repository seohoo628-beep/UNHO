"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";

type Result = { ok: boolean; error?: string };

export async function createTask(formData: FormData): Promise<Result> {
  const user = await requireAppUser();
  if (user.role !== "owner" && user.role !== "staff") {
    return { ok: false, error: "권한이 없습니다." };
  }
  const supabase = createSupabaseServerClient();

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { ok: false, error: "업무 내용을 입력하세요." };

  const brandId = String(formData.get("brand_id") ?? "");
  const assigneeUserId = String(formData.get("assignee_user_id") ?? "");
  const dueDate = String(formData.get("due_date") ?? "");
  const waitTarget = String(formData.get("wait_target") ?? "").trim();

  const { error } = await supabase.from("tasks").insert({
    title,
    brand_id: brandId || null,
    category: String(formData.get("category") ?? "") || null,
    assignee_kind: "user",
    assignee_user_id: assigneeUserId || null,
    status: String(formData.get("status") ?? "예정"),
    due_date: dueDate || null,
    wait_reason: String(formData.get("wait_reason") ?? "").trim() || null,
    wait_target: waitTarget || null,
    note: String(formData.get("note") ?? "").trim() || null,
    created_by: user.id,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateTaskStatus(
  taskId: string,
  status: string
): Promise<Result> {
  const user = await requireAppUser();
  if (user.role !== "owner" && user.role !== "staff") {
    return { ok: false, error: "권한이 없습니다." };
  }
  const supabase = createSupabaseServerClient();
  const patch: Record<string, unknown> = { status };
  if (status === "완료") {
    patch.completed_date = new Date().toISOString().slice(0, 10);
  }
  const { error } = await supabase.from("tasks").update(patch).eq("id", taskId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  return { ok: true };
}
