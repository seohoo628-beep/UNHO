"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";
import { isCeoUser } from "@/lib/ceo";
import { snapshotCeoRecord } from "@/lib/ceoRevisions";

type Result = { ok: boolean; error?: string; tableMissing?: boolean };

async function guard() {
  const user = await requireAppUser();
  if (!isCeoUser(user)) throw new Error("권한이 없습니다.");
  return user;
}

function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42P01" || /contacts/.test(err.message ?? "");
}

// "use server" 모듈이라 export는 async 함수만. 상수는 내부에만 둔다(클라이언트는 자체 선언).
const CONTACT_CATEGORIES = ["기업인", "연예인", "인플루언서", "전문직", "투자관련", "운동선수", "정치인", "F&B", "엔터&제작사", "직장인", "ss", "기타"] as const;

function row(fd: FormData) {
  return {
    name: String(fd.get("name") ?? "").trim(),
    category: String(fd.get("category") ?? "").trim() || null,
    job: String(fd.get("job") ?? "").trim() || null,
    title: String(fd.get("title") ?? "").trim() || null,
    company: String(fd.get("company") ?? "").trim() || null,
    agency: String(fd.get("agency") ?? "").trim() || null,
    group_work: String(fd.get("group_work") ?? "").trim() || null,
    contact: String(fd.get("contact") ?? "").trim() || null,
    contact2: String(fd.get("contact2") ?? "").trim() || null,
    email: String(fd.get("email") ?? "").trim() || null,
    birthday: String(fd.get("birthday") ?? "").trim() || null,
    birth_year: (() => { const s = String(fd.get("birth_year") ?? "").trim(); const n = parseInt(s, 10); return Number.isFinite(n) && n > 1900 && n < 2100 ? n : null; })(),
    hometown: String(fd.get("hometown") ?? "").trim() || null,
    education: String(fd.get("education") ?? "").trim() || null,
    address: String(fd.get("address") ?? "").trim() || null,
    where_met: String(fd.get("where_met") ?? "").trim() || null,
    marital: String(fd.get("marital") ?? "").trim() || null,
    has_children: String(fd.get("has_children") ?? "") === "on" || String(fd.get("has_children") ?? "") === "true",
    children_names: String(fd.get("children_names") ?? "").trim() || null,
    note: String(fd.get("note") ?? "").trim() || null,
  };
}

export async function createContact(fd: FormData): Promise<Result> {
  try {
    await guard();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const base = row(fd);
  if (!base.name) return { ok: false, error: "이름을 입력하세요." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("contacts").insert(base);
  if (error) return { ok: false, error: error.message, tableMissing: isMissingTable(error) };
  revalidatePath("/contacts");
  return { ok: true };
}

export async function updateContact(id: string, fd: FormData): Promise<Result> {
  try {
    await guard();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const supabase = createSupabaseServerClient();
  const { data: prev } = await supabase.from("contacts").select("*").eq("id", id).single();
  if (prev) await snapshotCeoRecord("contacts", id, prev, "저장 전");
  const { error } = await supabase.from("contacts").update({ ...row(fd), updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/contacts");
  return { ok: true };
}

// 명단 붙여넣기 일괄 추가. 한 줄에 한 명.
// 형식: 이름[, 직업군][, 직업][, 회사][, 연락처]  (구분자: 콤마/탭/세로바)
// 이미 있는 이름이면 비어있는 항목만 채우고 직업군을 갱신(중복 생성 안 함).
export async function bulkAddContacts(text: string): Promise<Result & { added?: number; updated?: number }> {
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
    const name = parts[0] ?? "";
    let category: string | null = null;
    const rest: string[] = [];
    for (const p of parts.slice(1)) {
      if (!category && (CONTACT_CATEGORIES as readonly string[]).includes(p)) category = p;
      else rest.push(p);
    }
    return { name, category, job: rest[0] ?? null, company: rest[1] ?? null, contact: rest[2] ?? null };
  }).filter((r) => r.name);

  // 기존 이름 → 행 매핑
  const { data: existingRows, error: exErr } = await supabase
    .from("contacts")
    .select("id,name,category,job,company,contact");
  if (exErr) return { ok: false, error: exErr.message, tableMissing: isMissingTable(exErr) };
  const byName = new Map<string, any>();
  for (const r of (existingRows ?? []) as any[]) byName.set(r.name, r);

  const toInsert: any[] = [];
  let updated = 0;
  for (const p of parsed) {
    const ex = byName.get(p.name);
    if (ex) {
      const patch: any = {};
      if (p.category && p.category !== ex.category) patch.category = p.category;
      if (p.job && !ex.job) patch.job = p.job;
      if (p.company && !ex.company) patch.company = p.company;
      if (p.contact && !ex.contact) patch.contact = p.contact;
      if (Object.keys(patch).length) {
        patch.updated_at = new Date().toISOString();
        const { error } = await supabase.from("contacts").update(patch).eq("id", ex.id);
        if (!error) updated++;
      }
    } else {
      toInsert.push({ name: p.name, category: p.category, job: p.job, company: p.company, contact: p.contact });
      byName.set(p.name, { name: p.name }); // 같은 붙여넣기 내 중복 방지
    }
  }

  let added = 0;
  if (toInsert.length) {
    const { error } = await supabase.from("contacts").insert(toInsert);
    if (error) return { ok: false, error: error.message, tableMissing: isMissingTable(error) };
    added = toInsert.length;
  }

  revalidatePath("/contacts");
  return { ok: true, added, updated };
}

// 휴대폰 연락처 가져오기(Contact Picker / .vcf 파싱 결과). 이름 또는 번호가 겹치면 건너뛴다.
export type ImportedContact = { name?: string; contact?: string; contact2?: string; email?: string; company?: string };
export async function importContacts(list: ImportedContact[]): Promise<Result & { added?: number; skipped?: number }> {
  try {
    await guard();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const supabase = createSupabaseServerClient();
  const digits = (s?: string | null) => (s ?? "").replace(/[^0-9]/g, "");

  const cleaned = (Array.isArray(list) ? list : [])
    .map((c) => ({
      name: String(c.name ?? "").trim(),
      contact: String(c.contact ?? "").trim() || null,
      contact2: String(c.contact2 ?? "").trim() || null,
      email: String(c.email ?? "").trim() || null,
      company: String(c.company ?? "").trim() || null,
    }))
    .filter((c) => c.name || c.contact);
  if (cleaned.length === 0) return { ok: false, error: "가져올 연락처가 없습니다." };

  const { data: existingRows, error: exErr } = await supabase
    .from("contacts")
    .select("name,contact,contact2");
  if (exErr) return { ok: false, error: exErr.message, tableMissing: isMissingTable(exErr) };
  const seenNames = new Set<string>();
  const seenPhones = new Set<string>();
  for (const r of (existingRows ?? []) as any[]) {
    if (r.name) seenNames.add(String(r.name).trim());
    for (const p of [r.contact, r.contact2]) { const d = digits(p); if (d.length >= 9) seenPhones.add(d); }
  }

  const toInsert: any[] = [];
  let skipped = 0;
  for (const c of cleaned) {
    const d = digits(c.contact);
    const dupName = c.name && seenNames.has(c.name);
    const dupPhone = d.length >= 9 && seenPhones.has(d);
    if (dupName || dupPhone) { skipped++; continue; }
    toInsert.push({ name: c.name || "(이름 없음)", contact: c.contact, contact2: c.contact2, email: c.email, company: c.company, category: "기타" });
    if (c.name) seenNames.add(c.name);
    if (d.length >= 9) seenPhones.add(d);
  }

  let added = 0;
  if (toInsert.length) {
    const { error } = await supabase.from("contacts").insert(toInsert);
    if (error) return { ok: false, error: error.message, tableMissing: isMissingTable(error) };
    added = toInsert.length;
  }
  revalidatePath("/contacts");
  return { ok: true, added, skipped };
}

// 한 사람 카드에 휴대폰에서 고른 번호/이메일/회사를 채워 넣는다(비어있는 항목만 보완).
export async function enrichContactFromPhone(
  id: string,
  picked: { contact?: string; contact2?: string; email?: string; company?: string }
): Promise<Result & { filled?: string[] }> {
  try {
    await guard();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const supabase = createSupabaseServerClient();
  const { data: prev, error: getErr } = await supabase.from("contacts").select("*").eq("id", id).single();
  if (getErr || !prev) return { ok: false, error: getErr?.message ?? "연락처를 찾지 못했습니다.", tableMissing: isMissingTable(getErr) };

  const patch: any = {};
  const filled: string[] = [];
  const c = String(picked.contact ?? "").trim();
  const c2 = String(picked.contact2 ?? "").trim();
  const em = String(picked.email ?? "").trim();
  const co = String(picked.company ?? "").trim();
  // 연락처: 비어있으면 첫 번호, 이미 있으면 두 번째 칸으로.
  if (c && !prev.contact) { patch.contact = c; filled.push("연락처"); }
  else if (c && prev.contact && prev.contact !== c && !prev.contact2) { patch.contact2 = c; filled.push("연락처2"); }
  if (c2 && !patch.contact2 && !prev.contact2) { patch.contact2 = c2; filled.push("연락처2"); }
  if (em && !prev.email) { patch.email = em; filled.push("이메일"); }
  if (co && !prev.company) { patch.company = co; filled.push("회사"); }

  if (Object.keys(patch).length === 0) return { ok: true, filled: [] };
  await snapshotCeoRecord("contacts", id, prev, "연락처 가져오기 전");
  patch.updated_at = new Date().toISOString();
  const { error } = await supabase.from("contacts").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/contacts");
  return { ok: true, filled };
}

export async function deleteContact(id: string): Promise<Result> {
  try {
    await guard();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("contacts").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/contacts");
  return { ok: true };
}
