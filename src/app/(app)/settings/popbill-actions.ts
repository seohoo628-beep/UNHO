"use server";

import { revalidatePath } from "next/cache";
import { requireAppUser } from "@/lib/auth";
import { setSetting } from "@/lib/settings";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getPopbillConfig, checkPopbill, popbillUrl, describePopbillError } from "@/lib/popbill";
import { digits } from "@/lib/popbillInvoice";

type Result = { ok: boolean; message: string };

async function ownerOnly() {
  const u = await requireAppUser();
  if (u.role !== "owner") throw new Error("대표만 바꿀 수 있습니다.");
}

/** LinkID·SecretKey 저장. 빈 값은 기존 값을 유지(비밀키를 화면에 다시 보여주지 않기 위해). */
export async function savePopbillKeys(linkId: string, secretKey: string, mode: "test" | "live"): Promise<Result> {
  await ownerOnly();
  const id = linkId.trim();
  const key = secretKey.trim();
  if (id) await setSetting("popbill_link_id", id);
  if (key) await setSetting("popbill_secret_key", key);
  await setSetting("popbill_is_test", mode === "live" ? "false" : null);
  revalidatePath("/settings");
  revalidatePath("/receivables");
  return { ok: true, message: `저장했습니다 · ${mode === "live" ? "운영(국세청 전송)" : "테스트베드"} 모드` };
}

export async function clearPopbillKeys(): Promise<Result> {
  await ownerOnly();
  await Promise.all([setSetting("popbill_link_id", null), setSetting("popbill_secret_key", null), setSetting("popbill_is_test", null)]);
  revalidatePath("/settings");
  return { ok: true, message: "팝빌 키를 지웠습니다." };
}

export type SupplierPatch = { name: string; bizType: string; bizItem: string; contact: string; email: string; address: string };

export async function saveSupplier(p: SupplierPatch): Promise<Result> {
  await ownerOnly();
  if (!["㈜운호컴퍼니", "뷰티밤㈜"].includes(p.name)) return { ok: false, message: "자사 법인만 수정할 수 있습니다." };
  const svc = createSupabaseServiceClient();
  const { error } = await svc
    .from("corporations")
    .update({
      biz_type: p.bizType.trim() || null,
      biz_item: p.bizItem.trim() || null,
      tax_contact: p.contact.trim() || null,
      tax_email: p.email.trim() || null,
      ...(p.address.trim() ? { address: p.address.trim() } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("name", p.name);
  if (error) return { ok: false, message: /biz_type|column/.test(error.message) ? "DB 마이그레이션(0104) 적용이 필요합니다." : error.message };
  revalidatePath("/settings");
  return { ok: true, message: `${p.name} 공급자 정보를 저장했습니다.` };
}

/** 법인별 팝빌 연결·인증서·포인트 확인 */
export async function testPopbill(): Promise<Result> {
  await ownerOnly();
  const cfg = await getPopbillConfig();
  if (!cfg) return { ok: false, message: "팝빌 키가 저장되지 않았습니다." };
  const svc = createSupabaseServiceClient();
  const { data } = await svc.from("corporations").select("name, business_no").in("name", ["㈜운호컴퍼니", "뷰티밤㈜"]);
  const lines: string[] = [];
  let allOk = true;
  for (const c of (data ?? []) as { name: string; business_no: string | null }[]) {
    const r = await checkPopbill(cfg, digits(c.business_no));
    allOk &&= r.ok;
    lines.push(`${c.name}: ${r.message}`);
  }
  return { ok: allOk, message: `[${cfg.isTest ? "테스트베드" : "운영"}] ${lines.join(" / ") || "자사 법인 정보가 없습니다."}` };
}

/** 법인별 공동인증서 등록 / 포인트 충전 팝빌 화면 주소 */
export async function openPopbillPage(corpName: string, kind: "cert" | "charge"): Promise<{ ok: boolean; url?: string; message?: string }> {
  await ownerOnly();
  const cfg = await getPopbillConfig();
  if (!cfg) return { ok: false, message: "팝빌 키가 저장되지 않았습니다." };
  const svc = createSupabaseServiceClient();
  const { data } = await svc.from("corporations").select("business_no").eq("name", corpName).maybeSingle();
  const corpNum = digits((data as { business_no?: string } | null)?.business_no);
  if (corpNum.length !== 10) return { ok: false, message: "사업자번호가 없습니다." };
  try {
    return { ok: true, url: await popbillUrl(cfg, corpNum, kind) };
  } catch (e) {
    return { ok: false, message: describePopbillError(e as { code?: number; message?: string }) };
  }
}
