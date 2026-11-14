"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";
import { canViewFinance } from "@/lib/finance";
import { logAudit } from "@/lib/audit";
import { MDT_STAGES, MDT_SHIP_KINDS } from "@/lib/mudangtea";

type Result = { ok: boolean; error?: string };

async function guard() {
  const u = await requireAppUser();
  if ((u.role !== "owner" && u.role !== "staff") || !canViewFinance(u)) return null;
  return u;
}

const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const int = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.round(Number(String(v).replace(/,/g, "")));
  return Number.isFinite(n) ? n : null;
};
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

const TABLES = {
  accounts: "mdt_accounts",
  lots: "mdt_lots",
  sales: "mdt_sales",
  shipments: "mdt_shipments",
} as const;
export type MdtKind = keyof typeof TABLES;

function toRow(kind: MdtKind, d: Record<string, unknown>): { row?: Record<string, unknown>; error?: string } {
  if (kind === "accounts") {
    const name = txt(d.name);
    if (!name) return { error: "판매처명을 입력하세요." };
    const stage = (MDT_STAGES as readonly string[]).includes(String(d.stage)) ? String(d.stage) : "발굴";
    const dealType = d.dealType === "사입" || d.dealType === "위탁" ? d.dealType : null;
    return { row: { name, channel: txt(d.channel), stage, deal_type: dealType, sale_price: int(d.salePrice), contact: txt(d.contact), next_action: txt(d.nextAction), next_date: date(d.nextDate), note: txt(d.note) } };
  }
  if (kind === "lots") {
    const lotNo = txt(d.lotNo), expiry = date(d.expiry), qtyIn = int(d.qtyIn);
    if (!lotNo || !expiry || !qtyIn || qtyIn <= 0) return { error: "로트(제조번호)·유통기한·입고 수량(1 이상)을 입력하세요." };
    return { row: { lot_no: lotNo, received_date: date(d.receivedDate), expiry, qty_in: qtyIn, note: txt(d.note) } };
  }
  if (kind === "sales") {
    const saleDate = date(d.saleDate), qty = int(d.qty), unitPrice = int(d.unitPrice), accountId = txt(d.accountId);
    if (!saleDate || !accountId || !qty || qty <= 0 || unitPrice === null) return { error: "날짜·판매처·수량(1 이상)·판매가를 입력하세요." };
    return { row: { sale_date: saleDate, account_id: accountId, lot_id: txt(d.lotId), qty, unit_price: unitPrice, ship_cost: int(d.shipCost), note: txt(d.note) } };
  }
  const shipDate = date(d.shipDate), cost = int(d.cost);
  if (!shipDate || cost === null) return { error: "날짜와 배송비를 입력하세요." };
  const kindV = (MDT_SHIP_KINDS as readonly string[]).includes(String(d.kind)) ? String(d.kind) : "기타";
  return { row: { ship_date: shipDate, kind: kindV, account_id: txt(d.accountId), cost, note: txt(d.note) } };
}

const LABEL: Record<MdtKind, string> = { accounts: "판매처", lots: "입고 로트", sales: "판매 기록", shipments: "기타 배송비" };

export async function saveMdt(kind: MdtKind, id: string | null, data: Record<string, unknown>): Promise<Result> {
  const u = await guard();
  if (!u) return { ok: false, error: "권한이 없습니다." };
  if (!(kind in TABLES)) return { ok: false, error: "잘못된 요청입니다." };
  const { row, error } = toRow(kind, data);
  if (!row) return { ok: false, error };
  const supabase = createSupabaseServerClient();
  const table = TABLES[kind];
  const res = id
    ? await supabase.from(table).update({ ...row, updated_at: new Date().toISOString() }).eq("id", id)
    : await supabase.from(table).insert({ ...row, created_by: u.id });
  if (res.error) return { ok: false, error: res.error.message };
  await logAudit({ actorId: u.id, actorName: u.name, action: id ? "updated" : "created", entity: "mudangtea", label: `${LABEL[kind]} ${String(row.name ?? row.lot_no ?? row.sale_date ?? row.ship_date ?? "")}` });
  revalidatePath("/mudangtea");
  return { ok: true };
}

export async function deleteMdt(kind: MdtKind, id: string): Promise<Result> {
  const u = await guard();
  if (!u) return { ok: false, error: "권한이 없습니다." };
  if (!(kind in TABLES)) return { ok: false, error: "잘못된 요청입니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from(TABLES[kind]).delete().eq("id", id);
  if (error) {
    if (/foreign key|violates/i.test(error.message)) {
      return { ok: false, error: kind === "accounts" ? "판매 기록이 있는 판매처는 지울 수 없습니다. 단계를 '종료'로 바꿔 주세요." : "판매 기록이 연결된 로트는 지울 수 없습니다." };
    }
    return { ok: false, error: error.message };
  }
  await logAudit({ actorId: u.id, actorName: u.name, action: "deleted", entity: "mudangtea", label: LABEL[kind] });
  revalidatePath("/mudangtea");
  return { ok: true };
}

export async function saveMdtSettings(data: Record<string, unknown>): Promise<Result> {
  const u = await guard();
  if (!u || u.role !== "owner") return { ok: false, error: "가격 설정은 대표 계정만 바꿀 수 있습니다." };
  const vat = Number(data.vatRate);
  const row = {
    id: "main",
    supply_price_incl: int(data.supplyPriceIncl),
    vat_rate: Number.isFinite(vat) && vat >= 0 && vat < 1 ? vat : 0.1,
    retail_price: int(data.retailPrice),
    ship_per_carton: int(data.shipPerCarton),
    boxes_per_carton: int(data.boxesPerCarton),
    updated_at: new Date().toISOString(),
  };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("mdt_settings").upsert(row);
  if (error) return { ok: false, error: error.message };
  await logAudit({ actorId: u.id, actorName: u.name, action: "updated", entity: "mudangtea", label: "가격 설정" });
  revalidatePath("/mudangtea");
  return { ok: true };
}
