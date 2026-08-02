"use server";

import { revalidatePath } from "next/cache";
import { requireAppUser } from "@/lib/auth";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getAnthropic, createMessageWithFallback } from "@/lib/anthropic";

type Result = { ok: boolean; error?: string };

const BUCKET = "generated-media";

async function guard() {
  const u = await requireAppUser();
  if (u.role !== "owner" && u.role !== "staff") return null;
  return u;
}

// 생성/수정 — 파일 업로드 포함(FormData)
export async function saveMeeting(formData: FormData): Promise<Result> {
  const u = await guard();
  if (!u) return { ok: false, error: "권한이 없습니다." };

  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { ok: false, error: "제목을 입력하세요." };

  const rec: Record<string, any> = {
    title,
    meeting_type: String(formData.get("meeting_type") ?? "내부") === "외부" ? "외부" : "내부",
    meeting_date: String(formData.get("meeting_date") ?? "") || null,
    attendees: String(formData.get("attendees") ?? "").trim() || null,
    location: String(formData.get("location") ?? "").trim() || null,
    body: String(formData.get("body") ?? "").trim() || null,
  };

  const svc = createSupabaseServiceClient();

  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > 25 * 1024 * 1024) return { ok: false, error: "파일은 25MB 이하만 업로드할 수 있습니다." };
    const safe = file.name.replace(/[^\w.\-가-힣]/g, "_");
    const path = `meeting-files/${Date.now()}_${safe}`;
    const buf = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await svc.storage.from(BUCKET).upload(path, buf, {
      contentType: file.type || undefined,
      upsert: false,
    });
    if (upErr) return { ok: false, error: `업로드 실패: ${upErr.message} (공개 버킷 '${BUCKET}' 필요)` };
    rec.file_path = path;
    rec.file_name = file.name;
  }

  if (id) {
    rec.updated_at = new Date().toISOString();
    const { error } = await svc.from("meetings").update(rec).eq("id", id);
    if (error) return { ok: false, error: error.message };
  } else {
    rec.created_by = u.id;
    const { error } = await svc.from("meetings").insert(rec);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/meetings");
  return { ok: true };
}

// AI 회의록 정리
export async function summarizeMeeting(id: string): Promise<Result & { summary?: string }> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const svc = createSupabaseServiceClient();
  const { data, error } = await svc
    .from("meetings")
    .select("title,meeting_type,meeting_date,attendees,location,body")
    .eq("id", id)
    .single();
  if (error || !data) return { ok: false, error: "기록을 찾을 수 없습니다." };
  if (!data.body || !String(data.body).trim())
    return { ok: false, error: "정리할 내용이 없습니다. 먼저 회의 내용을 작성하세요." };

  let summary = "";
  try {
    const anthropic = await getAnthropic();
    const prompt = `당신은 회의록 정리 담당자입니다. 아래 미팅 원문을 한국어 회의록으로 깔끔하게 정리하세요.
반드시 아래 마크다운 형식을 지키고, 원문에 없는 내용은 지어내지 마세요.

## 회의 개요
- 제목 / 일시 / 유형(외부·내부) / 장소 / 참석자
## 핵심 논의
- (불릿으로 요점만)
## 결정 사항
- (합의·결정된 것만. 없으면 "해당 없음")
## 액션 아이템
- [담당자 / 기한] 할 일 (원문에서 유추 가능한 범위)
## 후속 메모
- (특이사항·리스크·다음 미팅 등)

[원문]
제목: ${data.title}
유형: ${data.meeting_type}
일시: ${data.meeting_date || "-"}
장소: ${data.location || "-"}
참석자: ${data.attendees || "-"}

${data.body}`;

    const { msg } = await createMessageWithFallback(anthropic, {
      max_tokens: 1800,
      messages: [{ role: "user", content: prompt }],
    });
    summary = msg.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n")
      .trim();
  } catch (e: any) {
    return { ok: false, error: `AI 정리 실패: ${e?.message || e}` };
  }

  if (!summary) return { ok: false, error: "AI 응답이 비어 있습니다. 다시 시도하세요." };

  const { error: upErr } = await svc
    .from("meetings")
    .update({ ai_summary: summary, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (upErr) return { ok: false, error: upErr.message };

  revalidatePath("/meetings");
  return { ok: true, summary };
}

export async function deleteMeeting(id: string, filePath?: string): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const svc = createSupabaseServiceClient();
  if (filePath) await svc.storage.from(BUCKET).remove([filePath]);
  const { error } = await svc.from("meetings").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/meetings");
  return { ok: true };
}
