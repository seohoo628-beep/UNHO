"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

type Result = { ok: boolean; error?: string; tableMissing?: boolean };

// 통합 업무일지 대상 테이블(화이트리스트). 임의 테이블 접근 차단.
const LOG_TABLES = ["designer_logs", "marketer_logs", "bm_logs", "md_logs"] as const;
type LogTable = (typeof LOG_TABLES)[number];
const LOG_KINDS = ["일일업무일지", "주간업무계획", "월간업무계획"] as const;

function assertTable(t: string): LogTable {
  if (!(LOG_TABLES as readonly string[]).includes(t)) throw new Error("알 수 없는 일지 종류입니다.");
  return t as LogTable;
}

async function guardUser() {
  const user = await requireAppUser();
  if (user.role !== "owner" && user.role !== "staff") throw new Error("권한이 없습니다.");
  return user;
}

function isMissingTable(err: { code?: string; message?: string } | null, table: string): boolean {
  if (!err) return false;
  return err.code === "42P01" || new RegExp(table).test(err.message ?? "");
}

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
  return (LOG_KINDS as readonly string[]).includes(s) ? s : "일일업무일지";
}

export async function createWorkLog(table: string, formData: FormData): Promise<Result> {
  let user;
  try {
    user = await guardUser();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  let t: LogTable;
  try { t = assertTable(table); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "테이블 오류" }; }

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
  const { error } = await supabase.from(t).insert(row);
  if (error) return { ok: false, error: error.message, tableMissing: isMissingTable(error, t) };
  await logAudit({ actorId: user.id, actorName: user.name, action: "created", entity: t, label: `${kind} ${logDate}` });
  revalidatePath("/work-logs");
  return { ok: true };
}

export async function updateWorkLog(table: string, id: string, formData: FormData): Promise<Result> {
  try {
    await guardUser();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  let t: LogTable;
  try { t = assertTable(table); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "테이블 오류" }; }

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
  const { error } = await supabase.from(t).update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/work-logs");
  return { ok: true };
}

export async function deleteWorkLog(table: string, id: string): Promise<Result> {
  let actor;
  try {
    actor = await guardUser();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  let t: LogTable;
  try { t = assertTable(table); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "테이블 오류" }; }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from(t).delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  await logAudit({ actorId: actor.id, actorName: actor.name, action: "deleted", entity: t, label: id });
  revalidatePath("/work-logs");
  return { ok: true };
}
