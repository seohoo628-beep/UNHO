"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { requireAppUser } from "@/lib/auth";
import { isCeoUser } from "@/lib/ceo";
import { getAnthropic, createMessageWithFallback } from "@/lib/anthropic";

type Result = { ok: boolean; error?: string; tableMissing?: boolean };
const PUBLIC_MARKER = "/storage/v1/object/public/generated-media/";

async function guard() {
  const u = await requireAppUser();
  if (!isCeoUser(u)) throw new Error("권한이 없습니다.");
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
    registered_date: String(fd.get("registered_date") ?? "").trim() || null,
    location: String(fd.get("location") ?? "").trim() || null,
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

// 명함 → 인맥관리(contacts) 폴더로 저장. CEO 전용(양쪽 모두 대표 전용).
export async function saveCardToContacts(id: string): Promise<{ ok: boolean; error?: string; duplicated?: boolean }> {
  try {
    await guard();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const supabase = createSupabaseServerClient();
  const { data: card, error: cErr } = await supabase.from("business_cards").select("*").eq("id", id).single();
  if (cErr || !card) return { ok: false, error: "명함을 찾을 수 없습니다." };

  const name = (card.name || "").trim();
  const mobile = (card.mobile || "").trim();
  const company = (card.company || "").trim();
  if (!name && !company) return { ok: false, error: "이름·회사가 없어 저장할 수 없습니다." };

  // 중복 방지: 같은 이름 + (같은 연락처 또는 같은 회사)면 이미 저장된 것으로 간주.
  if (name) {
    const { data: exist } = await supabase.from("contacts").select("id, contact, contact2, company").eq("name", name).limit(20);
    const dup = ((exist ?? []) as any[]).some((x) =>
      (mobile && (x.contact === mobile || x.contact2 === mobile)) || (company && x.company === company)
    );
    if (dup) return { ok: false, error: "이미 인맥관리에 있는 사람입니다.", duplicated: true };
  }

  const noteParts = [
    card.department ? `부서: ${card.department}` : "",
    card.website ? `홈페이지: ${card.website}` : "",
    card.fax ? `팩스: ${card.fax}` : "",
    card.tags ? `태그: ${card.tags}` : "",
    (card.note || "").trim(),
  ].filter(Boolean);

  const row = {
    name: name || company,
    company: company || null,
    title: (card.position || "").trim() || null,   // 직책
    contact: mobile || null,
    contact2: (card.office_phone || "").trim() || null,
    email: (card.email || "").trim() || null,
    address: (card.address || "").trim() || null,
    where_met: (card.location || card.met_date || "").trim() || null,  // 만난 곳/획득 장소
    note: noteParts.length ? noteParts.join("\n") : null,
  };

  const { error } = await supabase.from("contacts").insert(row);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/contacts");
  return { ok: true };
}

export type CardOcr = {
  name: string; company: string; department: string; position: string;
  mobile: string; office_phone: string; email: string; fax: string;
  address: string; website: string;
};

export type CardBox = { x0: number; y0: number; x1: number; y1: number };

// 명함 이미지(공개 URL 또는 data:base64)를 Claude 비전으로 읽어 필드 + 명함 경계상자를 추출한다.
export async function ocrCard(image: string): Promise<{ ok: boolean; error?: string; data?: CardOcr; box?: CardBox }> {
  try {
    await guard();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  if (!image?.trim()) return { ok: false, error: "이미지가 없습니다." };
  try {
    const anthropic = await getAnthropic();
    const imgBlock = image.startsWith("data:")
      ? { type: "image", source: { type: "base64", media_type: (image.match(/^data:(.*?);/)?.[1] || "image/jpeg"), data: image.split(",")[1] || "" } }
      : { type: "image", source: { type: "url", url: image } };
    const prompt = `이 이미지는 명함(사진)입니다. 아래 두 가지를 JSON으로만 답하세요(설명·코드블록 없이 순수 JSON).
1) 명함에 적힌 정보. 값이 없으면 빈 문자열 "". 한국어는 한국어로, 숫자·이메일은 그대로.
2) 이미지 안에서 '명함 카드'가 차지하는 사각형 영역(배경 제외, 명함의 바깥 테두리)을 이미지 전체 대비 0~1 비율로. card_box = 왼쪽(x0)·위(y0)·오른쪽(x1)·아래(y1). 명함이 이미지를 꽉 채우거나 불확실하면 0,0,1,1.
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
  "website": "홈페이지",
  "card_box": { "x0": 0.0, "y0": 0.0, "x1": 1.0, "y1": 1.0 }
}`;
    const { msg } = await createMessageWithFallback(anthropic, {
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: [imgBlock as any, { type: "text", text: prompt }],
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
    let box: CardBox | undefined;
    const b = parsed.card_box || {};
    const n = (v: any) => (typeof v === "number" ? v : parseFloat(v));
    const x0 = n(b.x0), y0 = n(b.y0), x1 = n(b.x1), y1 = n(b.y1);
    if ([x0, y0, x1, y1].every((v) => Number.isFinite(v) && v >= 0 && v <= 1) && x1 > x0 && y1 > y0) {
      box = { x0, y0, x1, y1 };
    }
    return { ok: true, data, box };
  } catch (e: any) {
    return { ok: false, error: `AI 인식 실패: ${e?.message || e}` };
  }
}
