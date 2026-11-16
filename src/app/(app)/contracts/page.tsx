import { redirect } from "next/navigation";
import { requireAppUser } from "@/lib/auth";
import { canViewFinance } from "@/lib/finance";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { seoulToday } from "@/lib/time";
import ContractsClient, { type Contract } from "@/components/ContractsClient";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 표준 계약서 AI 작성

export default async function ContractsPage() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");
  if (!canViewFinance(user)) redirect("/hub");
  const supabase = createSupabaseServerClient();
  const [{ data, error }, { data: vendors }] = await Promise.all([
    supabase.from("contracts").select("*").order("end_date", { ascending: true, nullsFirst: false }).limit(500),
    supabase.from("vendors").select("id, name").order("name"),
  ]);
  return (
    <ContractsClient
      ready={!error}
      today={seoulToday()}
      vendors={(vendors ?? []) as { id: string; name: string }[]}
      rows={((data ?? []) as any[]).map((c): Contract => ({
        id: c.id, title: c.title, counterparty: c.counterparty, vendorId: c.vendor_id ?? "", ourParty: c.our_party, kind: c.kind, status: c.status,
        signedDate: c.signed_date ?? "", startDate: c.start_date ?? "", endDate: c.end_date ?? "", autoRenew: !!c.auto_renew, noticeDays: c.notice_days ?? 30,
        amount: c.amount != null ? Number(c.amount) : null, terms: c.terms ?? "", note: c.note ?? "", files: Array.isArray(c.files) ? c.files : [],
        body: c.body ?? "", draft: c.draft_inputs ?? undefined,
      }))}
    />
  );
}
