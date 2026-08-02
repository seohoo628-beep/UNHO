"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

// /fnb, /dining 공개 플랫폼의 공유 데이터(거래처·온라인 주문처) 서버 액션.
// 공개 플랫폼이므로 service_role로 처리(키는 서버에만). 링크로 접근 가능한 내부 도구 수준.

type Result = { ok: boolean; error?: string };
type Platform = "fnb" | "dining";

export interface VendorInput {
  platform: Platform;
  store: string;
  cat: string;
  name: string;
  contact: string;
  phone: string;
  items: string;
  terms: string;
  note: string;
}

function vRow(v: VendorInput) {
  return {
    platform: v.platform,
    store: v.store,
    cat: v.cat || "식자재",
    name: v.name.trim(),
    contact: v.contact?.trim() || null,
    phone: v.phone?.trim() || null,
    items: v.items?.trim() || null,
    terms: v.terms?.trim() || null,
    note: v.note?.trim() || null,
  };
}

export async function createVendor(v: VendorInput): Promise<Result> {
  if (!v.name?.trim()) return { ok: false, error: "거래처명을 입력하세요." };
  try {
    const s = createSupabaseServiceClient();
    const { error } = await s.from("store_vendors").insert(vRow(v));
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/${v.platform}/vendors`);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "오류" };
  }
}

export async function updateVendor(id: string, v: VendorInput): Promise<Result> {
  try {
    const s = createSupabaseServiceClient();
    const { error } = await s.from("store_vendors").update({ ...vRow(v), updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/${v.platform}/vendors`);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "오류" };
  }
}

export async function deleteVendor(id: string, platform: Platform): Promise<Result> {
  try {
    const s = createSupabaseServiceClient();
    const { error } = await s.from("store_vendors").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/${platform}/vendors`);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "오류" };
  }
}

export interface LinkInput {
  platform: Platform;
  store: string;
  cat: string;
  name: string;
  url: string;
  note: string;
}

export async function createLink(l: LinkInput): Promise<Result> {
  if (!l.name?.trim() || !l.url?.trim()) return { ok: false, error: "이름과 URL을 입력하세요." };
  try {
    const s = createSupabaseServiceClient();
    const { error } = await s.from("store_order_links").insert({
      platform: l.platform,
      store: l.store,
      cat: l.cat || "기타",
      name: l.name.trim(),
      url: l.url.trim(),
      note: l.note?.trim() || null,
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/${l.platform}/assets`);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "오류" };
  }
}

export async function deleteLink(id: string, platform: Platform): Promise<Result> {
  try {
    const s = createSupabaseServiceClient();
    const { error } = await s.from("store_order_links").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/${platform}/assets`);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "오류" };
  }
}
