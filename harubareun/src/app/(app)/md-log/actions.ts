"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

type Result = { ok: boolean; error?: string; tableMissing?: boolean };

// "use server" 모듈에서는 export가 모두 async 함수여야 하므로 상수는 내부에만 둔다.
const MD_LOG_KINDS = ["일일업무일지", "주간업무계획", "월간업무계획"] as const;

async function guardUser() {
  const user = await requireAppUser();
  if (user.role !== "owner" && user.role !== "staff") throw new Error("권한이 없습니다.");
  return user;
}

function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42P01" || /md_logs/.test(err.message ?? "");
}

// AttachmentPicker가 넘기는 files_json 파싱.
function parseFiles(v: FormDataEntryValue | null): { url: string; name: string }[] {
  try {
    const arr = JSON.parse(String(v ?? "[]"));
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((f) => f && typeof f.url === "string")
      .map((f) => ({ url: f.url, name: typeof f.name === "string" ? f.name : "file" }));
  } catch {
    return [];
  }
}

function normKind(v: FormDataEntryValue | null): string {
  const s = String(v ?? "").trim();
  return (MD_LOG_KINDS as readonly string[]).includes(s) ? s : "일일업무일지";
}

export async function createMdLog(formData: FormData): Promise<Result> {
  let user;
  try {
    user = await guardUser();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const supabase = createSupabaseServerClient();

  const logDate = String(formData.get("log_date") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const files = parseFiles(formData.get("files_json"));
  if (!note && files.length === 0) {
    return { ok: false, error: "내용 또는 첨부파일 중 하나는 입력하세요." };
  }

  const kind = normKind(formData.get("kind"));
  const row = {
    kind,
    log_date: logDate || undefined,
    title: String(formData.get("title") ?? "").trim() || null,
    note: note || null,
    files,
    author_user_id: String(formData.get("author_user_id") ?? "") || user.id,
    created_by: user.id,
  };

  const { error } = await supabase.from("md_logs").insert(row);
  if (error) return { ok: false, error: error.message, tableMissing: isMissingTable(error) };
  await logAudit({ actorId: user.id, actorName: user.name, action: "created", entity: "md_log", label: `${kind} ${logDate}` });
  revalidatePath("/md-log");
  return { ok: true };
}

export async function updateMdLog(id: string, formData: FormData): Promise<Result> {
  try {
    await guardUser();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const supabase = createSupabaseServerClient();
  const patch = {
    kind: normKind(formData.get("kind")),
    log_date: String(formData.get("log_date") ?? "").trim() || undefined,
    title: String(formData.get("title") ?? "").trim() || null,
    note: String(formData.get("note") ?? "").trim() || null,
    files: parseFiles(formData.get("files_json")),
    author_user_id: String(formData.get("author_user_id") ?? "") || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("md_logs").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/md-log");
  return { ok: true };
}

export async function deleteMdLog(id: string): Promise<Result> {
  let actor;
  try {
    actor = await guardUser();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("md_logs").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  await logAudit({ actorId: actor.id, actorName: actor.name, action: "deleted", entity: "md_log", label: id });
  revalidatePath("/md-log");
  return { ok: true };
}
