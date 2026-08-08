"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { requireAppUser } from "@/lib/auth";
import { notifyUsers } from "@/lib/notify";
import { logAudit } from "@/lib/audit";

type Result = { ok: boolean; error?: string; tableMissing?: boolean };

function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42P01" || /approval_requests/.test(err.message ?? "");
}

function numOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
}

function parseFiles(v: FormDataEntryValue | null): { url: string; name: string }[] {
  try {
    const arr = JSON.parse(String(v ?? "[]"));
    if (!Array.isArray(arr)) return [];
    return arr.filter((f) => f && typeof f.url === "string").map((f) => ({ url: f.url, name: String(f.name ?? "file") }));
  } catch {
    return [];
  }
}

export async function createApprovalRequest(fd: FormData): Promise<Result> {
  const user = await requireAppUser();
  if (user.role !== "owner" && user.role !== "staff") return { ok: false, error: "권한이 없습니다." };
  const title = String(fd.get("title") ?? "").trim();
  if (!title) return { ok: false, error: "제목을 입력하세요." };

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("approval_requests").insert({
    kind: String(fd.get("kind") ?? "일반"),
    title,
    amount: numOrNull(fd.get("amount")),
    body: String(fd.get("body") ?? "").trim() || null,
    files: parseFiles(fd.get("files_json")),
    requester_id: user.id,
    status: "pending",
  });
  if (error) return { ok: false, error: error.message, tableMissing: isMissingTable(error) };

  await logAudit({ actorId: user.id, actorName: user.name, action: "created", entity: "approval", label: title, detail: String(fd.get("kind") ?? "일반") });

  // 대표에게 알림
  try {
    const svc = createSupabaseServiceClient();
    const { data: owners } = await svc.from("users").select("id").eq("role", "owner");
    const ownerIds = ((owners ?? []) as { id: string }[]).map((o) => o.id);
    await notifyUsers({
      userIds: ownerIds,
      excludeUserId: user.id,
      type: "general",
      title: `결재 요청: ${title}`,
      body: `${user.name || "직원"} · ${String(fd.get("kind") ?? "일반")}`,
      link: "/e-approval",
    });
  } catch {
    /* ignore */
  }

  revalidatePath("/e-approval");
  return { ok: true };
}

export async function decideApproval(
  id: string,
  decision: "approved" | "rejected",
  note?: string
): Promise<Result> {
  const user = await requireAppUser();
  if (user.role !== "owner") return { ok: false, error: "대표만 결재할 수 있습니다." };
  const supabase = createSupabaseServerClient();
  const { data: before } = await supabase
    .from("approval_requests")
    .select("title, requester_id")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("approval_requests")
    .update({
      status: decision,
      decided_by: user.id,
      decided_at: new Date().toISOString(),
      decision_note: note?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await logAudit({ actorId: user.id, actorName: user.name, action: decision, entity: "approval", label: (before as { title?: string } | null)?.title, detail: note?.trim() || undefined });

  // 기안자에게 결과 알림
  const b = before as { title?: string; requester_id?: string } | null;
  if (b?.requester_id) {
    await notifyUsers({
      userIds: [b.requester_id],
      type: "general",
      title: `결재 ${decision === "approved" ? "승인" : "반려"}: ${b.title ?? "요청"}`,
      body: note?.trim() || undefined,
      link: "/e-approval",
    });
  }

  revalidatePath("/e-approval");
  return { ok: true };
}

export async function deleteApprovalRequest(id: string): Promise<Result> {
  const user = await requireAppUser();
  if (user.role !== "owner") return { ok: false, error: "대표만 삭제할 수 있습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("approval_requests").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/e-approval");
  return { ok: true };
}
