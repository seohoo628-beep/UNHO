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
  body?: string;
  draft?: DraftConditions;
};
export type DraftConditions = { purpose: string; payment: string; delivery: string; special: string };

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
  // 본문·초안 조건(0106). 컬럼이 없으면 기본 항목만 저장한다.
  const withBody = { ...row, body: c.body?.trim() || null, draft_inputs: c.draft ?? null };
  const supabase = createSupabaseServerClient();
  const write = (r: Record<string, unknown>) => (id
    ? supabase.from("contracts").update(r).eq("id", id).select("id").maybeSingle()
    : supabase.from("contracts").insert({ ...r, created_by: u.id }).select("id").maybeSingle());
  let res = await write(withBody);
  if (res.error && /body|draft_inputs/.test(res.error.message)) {
    if (c.body?.trim()) return { ok: false, message: "계약서 본문을 저장하려면 DB 마이그레이션(0106) 적용이 필요합니다." };
    res = await write(row);
  }
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

/** 표준 계약서 초안 작성(AI). 저장하지 않고 본문만 돌려준다. 금액·날짜는 입력값만 쓰고 나머지는 빈칸. */
export async function draftContract(c: ContractInput): Promise<{ ok: boolean; body?: string; message?: string }> {
  await guard();
  if (!c.title.trim() || !c.counterparty.trim()) return { ok: false, message: "계약명과 상대방을 먼저 입력하세요." };
  const d = c.draft ?? { purpose: "", payment: "", delivery: "", special: "" };
  if (!d.purpose.trim()) return { ok: false, message: "계약 목적·대상을 한 줄 이상 적어 주세요." };
  const supabase = createSupabaseServerClient();
  const ourName = c.ourParty === "뷰티밤" ? "뷰티밤㈜" : "㈜운호컴퍼니";
  const [{ data: corp }, vendorRes] = await Promise.all([
    supabase.from("corporations").select("name, business_no, ceo, address").eq("name", ourName).maybeSingle(),
    c.vendorId ? supabase.from("vendors").select("name, business_no, ceo, address").eq("id", c.vendorId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const o = (corp ?? { name: ourName }) as { name: string; business_no?: string; ceo?: string; address?: string };
  const v = (vendorRes.data ?? null) as { name: string; business_no?: string; ceo?: string; address?: string } | null;
  const { buildDraftPrompt } = await import("@/lib/contractDraft");
  const { system, user } = buildDraftPrompt({
    kind: c.kind, title: c.title.trim(),
    ours: { name: o.name, bizNo: o.business_no, ceo: o.ceo, address: o.address },
    theirs: { name: c.counterparty.trim(), bizNo: v?.business_no, ceo: v?.ceo, address: v?.address },
    startDate: c.startDate, endDate: c.endDate, autoRenew: c.autoRenew, amount: c.amount,
    purpose: d.purpose.trim(), payment: d.payment.trim(), delivery: d.delivery.trim(), special: d.special.trim(),
  });
  try {
    const { getAnthropic, createMessageWithFallback } = await import("@/lib/anthropic");
    const { extractText } = await import("@/lib/agents/common");
    const anthropic = await getAnthropic();
    const { msg } = await createMessageWithFallback(anthropic, { max_tokens: 3200, system, messages: [{ role: "user", content: user }] });
    const body = extractText(msg).replace(/\*\*/g, "").replace(/^#+\s*/gm, "").trim();
    if (!body) return { ok: false, message: "빈 응답입니다. 다시 시도하세요." };
    return { ok: true, body };
  } catch (e) {
    const { friendlyAiError } = await import("@/lib/anthropic");
    return { ok: false, message: friendlyAiError(e) };
  }
}
