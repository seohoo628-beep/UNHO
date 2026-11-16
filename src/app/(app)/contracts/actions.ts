"use server";

import { revalidatePath } from "next/cache";
import { requireAppUser } from "@/lib/auth";
import { canViewFinance } from "@/lib/finance";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Result = { ok: boolean; message: string; id?: string };
export type ContractFile = { path: string; name: string; size: number };
export type ContractInput = {
  title: string; counterparty: string; vendorId: string; ourParty: string; kind: string; status: string;
  signedDate: string; startDate: string; endDate: string; autoRenew: boolean; noticeDays: number;
  amount: number | null; terms: string; note: string; files: ContractFile[];
};

async function guard() {
  const u = await requireAppUser();
  if (!canViewFinance(u)) throw new Error("권한이 없습니다.");
  return u;
}

const STATUSES = ["검토중", "체결", "만료", "해지"];

export async function saveContract(id: string | null, c: ContractInput): Promise<Result> {
  const u = await guard();
  if (!c.title.trim() || !c.counterparty.trim()) return { ok: false, message: "계약명과 상대방을 입력하세요." };
  const row = {
    title: c.title.trim().slice(0, 200),
    counterparty: c.counterparty.trim().slice(0, 120),
    vendor_id: c.vendorId || null,
    our_party: c.ourParty || "운호컴퍼니",
    kind: c.kind || "기타",
    status: STATUSES.includes(c.status) ? c.status : "체결",
    signed_date: c.signedDate || null,
    start_date: c.startDate || null,
    end_date: c.endDate || null,
    auto_renew: !!c.autoRenew,
    notice_days: Math.min(365, Math.max(0, Math.round(Number(c.noticeDays) || 30))),
    amount: c.amount != null && Number(c.amount) > 0 ? Math.round(Number(c.amount)) : null,
    terms: c.terms.trim() || null,
    note: c.note.trim() || null,
    files: (c.files || []).filter((f) => f?.path?.startsWith("contracts/")).slice(0, 30),
    updated_at: new Date().toISOString(),
  };
  const supabase = createSupabaseServerClient();
  const res = id
    ? await supabase.from("contracts").update(row).eq("id", id).select("id").maybeSingle()
    : await supabase.from("contracts").insert({ ...row, created_by: u.id }).select("id").maybeSingle();
  if (res.error) return { ok: false, message: /contracts/.test(res.error.message) && /exist|schema/.test(res.error.message) ? "DB 마이그레이션(0105) 적용이 필요합니다." : res.error.message };
  revalidatePath("/contracts");
  return { ok: true, message: "저장했습니다.", id: (res.data as { id?: string } | null)?.id };
}

export async function deleteContract(id: string): Promise<Result> {
  await guard();
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.from("contracts").select("files").eq("id", id).maybeSingle();
  const paths = (((data as { files?: ContractFile[] } | null)?.files) ?? []).map((f) => f.path);
  const { error } = await supabase.from("contracts").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };
  if (paths.length) await createSupabaseServiceClient().storage.from("contracts").remove(paths);
  revalidatePath("/contracts");
  return { ok: true, message: "삭제했습니다." };
}

/** 비공개 계약서 파일 열람용 60초 서명 주소 */
export async function contractFileUrl(path: string): Promise<{ ok: boolean; url?: string; message?: string }> {
  await guard();
  if (!path.startsWith("contracts/")) return { ok: false, message: "잘못된 파일입니다." };
  const { data, error } = await createSupabaseServiceClient().storage.from("contracts").createSignedUrl(path, 60);
  if (error || !data) return { ok: false, message: error?.message ?? "파일을 열 수 없습니다." };
  return { ok: true, url: data.signedUrl };
}
