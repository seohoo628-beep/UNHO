"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { requireAppUser } from "@/lib/auth";
import { getAnthropic, createMessageWithFallback } from "@/lib/anthropic";

type Result = { ok: boolean; error?: string; tableMissing?: boolean };
const PUBLIC_MARKER = "/storage/v1/object/public/generated-media/";

async function guard() {
  const u = await requireAppUser();
  if (u.role !== "owner" && u.role !== "staff") throw new Error("권한이 없습니다.");
  return u;
}

function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42P01" || /business_cards/.test(err.message ?? "");
}

function row(fd: FormData) {
  return {
    name: String(fd.get("name") ?? "").trim() || null,
    company: String(fd.get("company") ?? "").trim() || null,
    department: String(fd.get("department") ?? "").trim() || null,
    position: String(fd.get("position") ?? "").trim() || null,
    mobile: String(fd.get("mobile") ?? "").trim() || null,
    office_phone: String(fd.get("office_phone") ?? "").trim() || null,
    email: String(fd.get("email") ?? "").trim() || null,
    fax: String(fd.get("fax") ?? "").trim() || null,
    address: String(fd.get("address") ?? "").trim() || null,
    website: String(fd.get("website") ?? "").trim() || null,
    tags: String(fd.get("tags") ?? "").trim() || null,
    image_url: String(fd.get("image_url") ?? "").trim() || null,
    met_date: String(fd.get("met_date") ?? "").trim() || null,
    note: String(fd.get("note") ?? "").trim() || null,
  };
}

export async function createCard(fd: FormData): Promise<Result> {
  try {
    await guard();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const base = row(fd);
  if (!base.name && !base.company && !base.image_url) return { ok: false, error: "이름·회사 또는 명함 이미지를 입력하세요." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("business_cards").insert(base);
  if (error) return { ok: false, error: error.message, tableMissing: isMissingTable(error) };
  revalidatePath("/business-cards");
  return { ok: true };
}

export async function updateCard(id: string, fd: FormData): Promise<Result> {
  try {
    await guard();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("business_cards").update({ ...row(fd), updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/business-cards");
  return { ok: true };
}

export async function deleteCard(id: string, imageUrl?: string): Promise<Result> {
  try {
    await guard();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  if (imageUrl && imageUrl.includes(PUBLIC_MARKER)) {
    const path = decodeURIComponent(imageUrl.split(PUBLIC_MARKER)[1] || "");
    if (path) {
      try {
        await createSupabaseServiceClient().storage.from("generated-media").remove([path]);
      } catch { /* 스토리지 정리 실패는 무시 */ }
    }
  }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("business_cards").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/business-cards");
  return { ok: true };
}

export type CardOcr = {
  name: string; company: string; department: string; position: string;
  mobile: string; office_phone: string; email: string; fax: string;
  address: string; website: string;
};

// 업로드된 명함 이미지(공개 URL)를 Claude 비전으로 읽어 필드를 추출한다.
export async function ocrCard(imageUrl: string): Promise<{ ok: boolean; error?: string; data?: CardOcr }> {
  try {
    await guard();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  if (!imageUrl?.trim()) return { ok: false, error: "이미지가 없습니다." };
  try {
    const anthropic = await getAnthropic();
    const prompt = `이 이미지는 명함입니다. 명함에 적힌 정보를 추출해 아래 JSON 형식으로만 답하세요(설명·코드블록 없이 순수 JSON).
값이 없으면 빈 문자열 "". 한국어는 한국어로, 숫자·이메일은 그대로.
{
  "name": "이름",
  "company": "회사명",
  "department": "부서",
  "position": "직책/직위",
  "mobile": "휴대폰번호",
  "office_phone": "회사(대표)전화",
  "email": "이메일",
  "fax": "팩스",
  "address": "주소",
  "website": "홈페이지"
}`;
    const { msg } = await createMessageWithFallback(anthropic, {
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "url", url: imageUrl } } as any,
          { type: "text", text: prompt },
        ],
      }],
    });
    const raw = msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
    const jsonStr = (raw.match(/\{[\s\S]*\}/) || [raw])[0];
    let parsed: any;
    try { parsed = JSON.parse(jsonStr); } catch { return { ok: false, error: "AI 응답을 해석하지 못했습니다. 수동으로 입력해 주세요." }; }
    const s = (v: any) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));
    const data: CardOcr = {
      name: s(parsed.name), company: s(parsed.company), department: s(parsed.department), position: s(parsed.position),
      mobile: s(parsed.mobile), office_phone: s(parsed.office_phone), email: s(parsed.email), fax: s(parsed.fax),
      address: s(parsed.address), website: s(parsed.website),
    };
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: `AI 인식 실패: ${e?.message || e}` };
  }
}
