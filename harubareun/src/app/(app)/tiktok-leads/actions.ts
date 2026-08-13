"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";
import { isCeoUser } from "@/lib/ceo";

type Result = { ok: boolean; error?: string; tableMissing?: boolean };

async function guard() {
  const user = await requireAppUser();
  if (!isCeoUser(user)) throw new Error("권한이 없습니다.");
  return user;
}

function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42P01" || /tiktok_leads/.test(err.message ?? "");
}

// "use server" 모듈이라 export는 async 함수만. 상수는 내부에만 둔다(클라이언트는 자체 선언).
const CATEGORIES = ["뷰티", "패션", "음식", "리빙", "헬스", "유아", "반려", "여행", "기타"] as const;
const STAGES = ["미접촉", "DM발송", "회신대기", "협의중", "계약완료", "보류", "거절"] as const;

function toInt(s: string): number | null {
  const cleaned = s.replace(/[,\s]/g, "").replace(/만$/, "0000").replace(/k$/i, "000");
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function row(fd: FormData) {
  return {
    handle: String(fd.get("handle") ?? "").trim() || null,
    name: String(fd.get("name") ?? "").trim() || null,
    category: String(fd.get("category") ?? "").trim() || null,
    stage: String(fd.get("stage") ?? "").trim() || null,
    followers: toInt(String(fd.get("followers") ?? "")),
    product: String(fd.get("product") ?? "").trim() || null,
    contact: String(fd.get("contact") ?? "").trim() || null,
    contact2: String(fd.get("contact2") ?? "").trim() || null,
    email: String(fd.get("email") ?? "").trim() || null,
    link: String(fd.get("link") ?? "").trim() || null,
    agency: String(fd.get("agency") ?? "").trim() || null,
    source: String(fd.get("source") ?? "").trim() || null,
    note: String(fd.get("note") ?? "").trim() || null,
  };
}

export async function createLead(fd: FormData): Promise<Result> {
  try {
    await guard();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const base = row(fd);
  if (!base.handle && !base.name) return { ok: false, error: "계정명 또는 이름을 입력하세요." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("tiktok_leads").insert(base);
  if (error) return { ok: false, error: error.message, tableMissing: isMissingTable(error) };
  revalidatePath("/tiktok-leads");
  return { ok: true };
}

export async function updateLead(id: string, fd: FormData): Promise<Result> {
  try {
    await guard();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("tiktok_leads").update({ ...row(fd), updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/tiktok-leads");
  return { ok: true };
}

// 명단 붙여넣기 일괄 추가. 한 줄에 한 명.
// 형식: 계정명(@핸들), 이름, 분야, 팔로워, 연락처  (구분자: 콤마/탭/세로바)
// 앞 항목부터 계정명·이름 순, 분야/팔로워/연락처는 자동 인식. 같은 계정명이면 빈 칸만 채움.
export async function bulkAddLeads(text: string): Promise<Result & { added?: number; updated?: number }> {
  try {
    await guard();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const supabase = createSupabaseServerClient();

  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { ok: false, error: "붙여넣은 내용이 없습니다." };

  const parsed = lines.map((line) => {
    const parts = line.split(/[,\t|]/).map((s) => s.trim()).filter((s) => s !== "");
    let category: string | null = null;
    let stage: string | null = null;
    let followers: number | null = null;
    let contact: string | null = null;
    const rest: string[] = [];
    for (const p of parts) {
      if (!category && (CATEGORIES as readonly string[]).includes(p)) category = p;
      else if (!stage && (STAGES as readonly string[]).includes(p)) stage = p;
      else if (!contact && /^[0-9][0-9\-\s]{7,}$/.test(p)) contact = p.replace(/\s/g, "");
      else if (followers === null && /^[\d.,]+\s*[만kK]?$/.test(p) && toInt(p) && toInt(p)! >= 100) followers = toInt(p);
      else rest.push(p);
    }
    const handle = rest[0] ?? null;
    const name = rest[1] ?? null;
    return { handle, name, category, stage, followers, contact };
  }).filter((r) => r.handle || r.name);

  const key = (h: string | null, n: string | null) => (h || n || "").toLowerCase();

  const { data: existingRows, error: exErr } = await supabase
    .from("tiktok_leads")
    .select("id,handle,name,category,stage,followers,contact");
  if (exErr) return { ok: false, error: exErr.message, tableMissing: isMissingTable(exErr) };
  const byKey = new Map<string, any>();
  for (const r of (existingRows ?? []) as any[]) byKey.set(key(r.handle, r.name), r);

  const toInsert: any[] = [];
  let updated = 0;
  for (const p of parsed) {
    const ex = byKey.get(key(p.handle, p.name));
    if (ex) {
      const patch: any = {};
      if (p.category && !ex.category) patch.category = p.category;
      if (p.stage && !ex.stage) patch.stage = p.stage;
      if (p.followers && !ex.followers) patch.followers = p.followers;
      if (p.name && !ex.name) patch.name = p.name;
      if (p.contact && !ex.contact) patch.contact = p.contact;
      if (Object.keys(patch).length) {
        patch.updated_at = new Date().toISOString();
        const { error } = await supabase.from("tiktok_leads").update(patch).eq("id", ex.id);
        if (!error) updated++;
      }
    } else {
      toInsert.push({ handle: p.handle, name: p.name, category: p.category, stage: p.stage || "미접촉", followers: p.followers, contact: p.contact });
      byKey.set(key(p.handle, p.name), { handle: p.handle, name: p.name });
    }
  }

  let added = 0;
  if (toInsert.length) {
    const { error } = await supabase.from("tiktok_leads").insert(toInsert);
    if (error) return { ok: false, error: error.message, tableMissing: isMissingTable(error) };
    added = toInsert.length;
  }

  revalidatePath("/tiktok-leads");
  return { ok: true, added, updated };
}

export async function deleteLead(id: string): Promise<Result> {
  try {
    await guard();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("tiktok_leads").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/tiktok-leads");
  return { ok: true };
}
