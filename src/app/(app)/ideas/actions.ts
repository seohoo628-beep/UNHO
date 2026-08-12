"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";
import { isCeoUser } from "@/lib/ceo";
import { getAnthropic, createMessageWithFallback } from "@/lib/anthropic";

type Result = { ok: boolean; error?: string; tableMissing?: boolean };

async function guard() {
  const u = await requireAppUser();
  if (!isCeoUser(u)) throw new Error("권한이 없습니다.");
  return u;
}
function missing(err: { code?: string; message?: string } | null) {
  return !!err && (err.code === "42P01" || /ideas/.test(err.message ?? ""));
}

export async function createIdea(title: string, body: string, tags: string, status: string): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const t = (title || "").trim(), b = (body || "").trim();
  if (!t && !b) return { ok: false, error: "제목이나 내용을 입력하세요." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("ideas").insert({ title: t || null, body: b || null, tags: (tags || "").trim() || null, status: status || "수집" });
  if (error) return { ok: false, error: error.message, tableMissing: missing(error) };
  revalidatePath("/ideas");
  return { ok: true };
}

// 저장 시 직전 상태를 버전 기록으로 스냅샷 후 업데이트.
export async function updateIdea(id: string, title: string, body: string, tags: string, status: string): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const supabase = createSupabaseServerClient();
  const { data: prev } = await supabase.from("ideas").select("title,body,tags,status").eq("id", id).single();
  if (prev) await supabase.from("idea_revisions").insert({ idea_id: id, title: prev.title, body: prev.body, tags: prev.tags, status: prev.status, note: "저장 전" });
  const { error } = await supabase.from("ideas").update({ title: (title || "").trim() || null, body: (body || "").trim() || null, tags: (tags || "").trim() || null, status: status || "수집", updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/ideas");
  return { ok: true };
}

export async function setIdeaStatus(id: string, status: string): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("ideas").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/ideas");
  return { ok: true };
}

export async function setIdeaPinned(id: string, pinned: boolean): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("ideas").update({ pinned }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/ideas");
  return { ok: true };
}

export async function deleteIdea(id: string): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("ideas").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/ideas");
  return { ok: true };
}

export type Revision = { id: string; title: string; body: string; tags: string; status: string; note: string; createdAt: string };

export async function listRevisions(ideaId: string): Promise<{ ok: boolean; error?: string; items?: Revision[] }> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("idea_revisions").select("*").eq("idea_id", ideaId).order("created_at", { ascending: false }).limit(100);
  if (error) return { ok: false, error: error.message };
  return { ok: true, items: (data ?? []).map((r: any) => ({ id: r.id, title: r.title ?? "", body: r.body ?? "", tags: r.tags ?? "", status: r.status ?? "", note: r.note ?? "", createdAt: r.created_at })) };
}

// 특정 버전으로 복원. 복원 전 현재 상태도 스냅샷(되돌리기 가능).
export async function restoreRevision(ideaId: string, revisionId: string): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const supabase = createSupabaseServerClient();
  const { data: rev } = await supabase.from("idea_revisions").select("title,body,tags,status").eq("id", revisionId).single();
  if (!rev) return { ok: false, error: "복원할 버전을 찾을 수 없습니다." };
  const { data: cur } = await supabase.from("ideas").select("title,body,tags,status").eq("id", ideaId).single();
  if (cur) await supabase.from("idea_revisions").insert({ idea_id: ideaId, title: cur.title, body: cur.body, tags: cur.tags, status: cur.status, note: "복원 전" });
  const { error } = await supabase.from("ideas").update({ title: rev.title, body: rev.body, tags: rev.tags, status: rev.status, updated_at: new Date().toISOString() }).eq("id", ideaId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/ideas");
  return { ok: true };
}

// AI 도우미: 아이디어를 발전/실행계획/리스크/네이밍으로 확장.
export async function aiIdea(mode: string, title: string, body: string): Promise<{ ok: boolean; error?: string; text?: string }> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const src = `제목: ${title || "-"}\n내용: ${body || "-"}`;
  const prompts: Record<string, string> = {
    발전: "아래 아이디어를 구체화·확장하세요. ① 핵심 가치/차별점 ② 구체적 실행 아이디어 3~5개 ③ 확장 가능성. 불릿으로 간결히.",
    실행계획: "아래 아이디어의 단계별 실행 계획을 세우세요. 1~2주/1개월/3개월 단위로, 각 단계에 필요한 리소스와 담당 역할까지. 불릿·번호로.",
    리스크: "아래 아이디어의 리스크·주의점과 각 리스크의 대응책을 정리하세요. 우선순위 높은 것부터.",
    네이밍: "아래 아이디어에 어울리는 브랜드·제품·콘텐츠 이름 후보 8개와 한 줄 슬로건을 제안하세요.",
  };
  const instr = prompts[mode] || prompts["발전"];
  try {
    const anthropic = await getAnthropic();
    const { msg } = await createMessageWithFallback(anthropic, {
      max_tokens: 1400,
      system: "당신은 운호컴퍼니(화장품·건기식·외식·유통) 대표의 아이디어 파트너입니다. 한국어로 실용적이고 구체적으로. 화장품·건기식은 과장·의학적 효능 단정을 피하세요.",
      messages: [{ role: "user", content: `${instr}\n\n[아이디어]\n${src}` }],
    });
    const text = msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
    return { ok: true, text: text || "(빈 응답)" };
  } catch (e: any) {
    const m = e?.message || String(e);
    if (/ANTHROPIC|api key/i.test(m)) return { ok: false, error: "AI 키가 설정되지 않았습니다(설정 화면)." };
    return { ok: false, error: `AI 오류: ${m}` };
  }
}
