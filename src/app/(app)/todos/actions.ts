"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";

type Result = { ok: boolean; error?: string };

async function requireStaff() {
  const user = await requireAppUser();
  if (user.role !== "owner" && user.role !== "staff") return null;
  return user;
}

export async function createTodo(fd: FormData): Promise<Result> {
  const user = await requireStaff();
  if (!user) return { ok: false, error: "권한이 없습니다." };

  const title = (fd.get("title") as string)?.trim();
  if (!title) return { ok: false, error: "업무 내용을 입력하세요." };

  const str = (k: string) => {
    const v = (fd.get(k) as string)?.trim();
    return v ? v : null;
  };

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("todos").insert({
    title,
    brand_id: str("brand_id"),
    assignee_user_id: str("assignee_user_id"),
    priority: str("priority") ?? "보통",
    due_date: str("due_date"),
    status: str("status") ?? "예정",
    ref_link: str("ref_link"),
    note: str("note"),
    created_by: user.id,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/todos");
  return { ok: true };
}

export async function updateTodo(id: string, fd: FormData): Promise<Result> {
  const user = await requireStaff();
  if (!user) return { ok: false, error: "권한이 없습니다." };

  const title = (fd.get("title") as string)?.trim();
  if (!title) return { ok: false, error: "업무 내용을 입력하세요." };

  const str = (k: string) => {
    const v = (fd.get(k) as string)?.trim();
    return v ? v : null;
  };
  const status = str("status") ?? "예정";

  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("todos")
    .update({
      title,
      brand_id: str("brand_id"),
      assignee_user_id: str("assignee_user_id"),
      priority: str("priority") ?? "보통",
      due_date: str("due_date"),
      status,
      completed_at: status === "완료" ? new Date().toISOString() : null,
      ref_link: str("ref_link"),
      note: str("note"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/todos");
  return { ok: true };
}

export async function setTodoStatus(id: string, status: string): Promise<Result> {
  const user = await requireStaff();
  if (!user) return { ok: false, error: "권한이 없습니다." };
  const done = status === "완료";
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("todos")
    .update({
      status,
      completed_at: done ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/todos");
  return { ok: true };
}

export async function deleteTodo(id: string): Promise<Result> {
  const user = await requireStaff();
  if (!user) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("todos").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/todos");
  return { ok: true };
}
