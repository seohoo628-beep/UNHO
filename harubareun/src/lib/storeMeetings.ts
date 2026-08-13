"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getAnthropic, createMessageWithFallback } from "@/lib/anthropic";
import { getOpenAIKey, isAudioPath, transcribeAudio, transcribeViaFal } from "@/lib/transcribe";
import { assertStoreAccess } from "@/lib/storeAuth";

// /fnb, /dining 공개 플랫폼의 미팅·회의 일지. service_role로 처리(파일 업로드·AI 정리 포함).

type Result = { ok: boolean; error?: string };
const BUCKET = "generated-media";

function pf(v: FormDataEntryValue | null): "fnb" | "dining" {
  return String(v) === "dining" ? "dining" : "fnb";
}

export async function saveMeeting(formData: FormData): Promise<Result & { id?: string }> {
  const platform = pf(formData.get("platform"));
  try { await assertStoreAccess(platform); } catch (e: any) { return { ok: false, error: e?.message ?? "권한 오류" }; }
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { ok: false, error: "제목을 입력하세요." };

  const rec: Record<string, any> = {
    platform,
    store: String(formData.get("store") ?? "all") || "all",
    title,
    meeting_type: String(formData.get("meeting_type") ?? "내부") === "외부" ? "외부" : "내부",
    meeting_date: String(formData.get("meeting_date") ?? "") || null,
    attendees: String(formData.get("attendees") ?? "").trim() || null,
    location: String(formData.get("location") ?? "").trim() || null,
    body: String(formData.get("body") ?? "").trim() || null,
  };

  try {
    const svc = createSupabaseServiceClient();
    const file = formData.get("file");
    if (file instanceof File && file.size > 0) {
      if (file.size > 25 * 1024 * 1024) return { ok: false, error: "파일은 25MB 이하만 업로드할 수 있습니다." };
      const safe = file.name.replace(/[^\w.\-가-힣]/g, "_");
      const path = `meeting-files/${platform}_${Date.now()}_${safe}`;
      const buf = Buffer.from(await file.arrayBuffer());
      const { error: upErr } = await svc.storage.from(BUCKET).upload(path, buf, { contentType: file.type || undefined, upsert: false });
      if (upErr) return { ok: false, error: `업로드 실패: ${upErr.message} (공개 버킷 '${BUCKET}' 필요)` };
      rec.file_path = path;
      rec.file_name = file.name;
    }

    let newId = id;
    if (id) {
      rec.updated_at = new Date().toISOString();
      const { error } = await svc.from("store_meetings").update(rec).eq("id", id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { data: ins, error } = await svc.from("store_meetings").insert(rec).select("id").single();
      if (error) return { ok: false, error: error.message };
      newId = (ins as { id?: string } | null)?.id ?? "";
    }
    revalidatePath(`/${platform}/meetings`);
    return { ok: true, id: newId };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "오류" };
  }
}

export async function summarizeMeeting(id: string, platform: "fnb" | "dining"): Promise<Result & { summary?: string }> {
  try { await assertStoreAccess(platform); } catch (e: any) { return { ok: false, error: e?.message ?? "권한 오류" }; }
  try {
    const svc = createSupabaseServiceClient();
    const { data, error } = await svc
      .from("store_meetings")
      .select("title,meeting_type,meeting_date,attendees,location,body,file_path,file_name")
      .eq("id", id)
      .single();
    if (error || !data) return { ok: false, error: "기록을 찾을 수 없습니다." };

    // 본문이 없고 음성(녹음) 첨부가 있으면 자동으로 텍스트 변환(Whisper) 후 정리한다.
    let body = String(data.body ?? "").trim();
    if (!body && data.file_path && isAudioPath(data.file_path)) {
      const hasFal = !!process.env.FAL_KEY;
      const hasOpenAI = !!(await getOpenAIKey());
      if (!hasFal && !hasOpenAI) {
        return { ok: false, error: "음성 자동 변환기(FAL_KEY 또는 OpenAI 키)가 설정되지 않았습니다. 관리자에게 문의하거나 회의 내용을 직접 작성해 주세요." };
      }
      let tr: { ok: boolean; text?: string; error?: string } | null = null;
      // 1순위: fal Whisper(URL 기반·ffmpeg 내장, 통화녹음 등 포맷에 관대)
      if (hasFal) {
        const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${data.file_path}`;
        tr = await transcribeViaFal(publicUrl);
      }
      // 2순위: OpenAI Whisper(다운로드 후 전송)
      if ((!tr || !tr.ok) && hasOpenAI) {
        const dl = await svc.storage.from(BUCKET).download(data.file_path);
        if (dl.error || !dl.data) return { ok: false, error: "음성 파일을 불러오지 못했습니다." };
        const buf = Buffer.from(await dl.data.arrayBuffer());
        tr = await transcribeAudio(buf, data.file_name || "audio.webm", (dl.data as any).type || "audio/webm");
      }
      if (!tr || !tr.ok) return { ok: false, error: `음성 변환 실패: ${tr?.error ?? "변환기 없음"}` };
      if (!tr.text) return { ok: false, error: "음성에서 내용을 인식하지 못했습니다(무음이거나 잡음)." };
      body = tr.text;
      // 변환한 원문을 저장해 두어 재정리·검색에 재사용.
      await svc.from("store_meetings").update({ body, updated_at: new Date().toISOString() }).eq("id", id);
    }

    if (!body) return { ok: false, error: "정리할 내용이 없습니다. 먼저 회의 내용을 작성하거나 음성을 녹음·첨부하세요." };

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

${body}`;

    const { msg } = await createMessageWithFallback(anthropic, {
      max_tokens: 1800,
      messages: [{ role: "user", content: prompt }],
    });
    const summary = msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
    if (!summary) return { ok: false, error: "AI 응답이 비어 있습니다. 다시 시도하세요." };

    const { error: upErr } = await svc.from("store_meetings").update({ ai_summary: summary, updated_at: new Date().toISOString() }).eq("id", id);
    if (upErr) return { ok: false, error: upErr.message };
    revalidatePath(`/${platform}/meetings`);
    return { ok: true, summary };
  } catch (e: any) {
    return { ok: false, error: `AI 정리 실패: ${e?.message || e}` };
  }
}

export async function deleteMeeting(id: string, platform: "fnb" | "dining", filePath?: string): Promise<Result> {
  try { await assertStoreAccess(platform); } catch (e: any) { return { ok: false, error: e?.message ?? "권한 오류" }; }
  try {
    const svc = createSupabaseServiceClient();
    if (filePath) await svc.storage.from(BUCKET).remove([filePath]);
    const { error } = await svc.from("store_meetings").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/${platform}/meetings`);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "오류" };
  }
}
