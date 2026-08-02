"use server";

import { revalidatePath } from "next/cache";
import { requireAppUser } from "@/lib/auth";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getAnthropic, createMessageWithFallback } from "@/lib/anthropic";
import { getOpenAIKey, isAudioPath, transcribeAudio } from "@/lib/transcribe";

type Result = { ok: boolean; error?: string };

const BUCKET = "generated-media";

async function guard() {
  const u = await requireAppUser();
  if (u.role !== "owner" && u.role !== "staff") return null;
  return u;
}

// 파일은 클라이언트에서 Supabase Storage로 직접 올리고(대용량·Vercel 4.5MB 한도 회피),
// 여기서는 경로 문자열만 받아 기록한다.
export interface MeetingInput {
  id?: string;
  title: string;
  meetingType: string;
  meetingDate: string;
  attendees: string;
  location: string;
  body: string;
  filePath?: string;
  fileName?: string;
}

const TITLE_PLACEHOLDER = "(제목 생성 중)";

export async function saveMeeting(inp: MeetingInput): Promise<Result & { id?: string }> {
  const u = await guard();
  if (!u) return { ok: false, error: "권한이 없습니다." };
  if (!inp.title?.trim() && !inp.body?.trim() && !inp.filePath)
    return { ok: false, error: "제목 또는 회의 내용을 입력하거나 음성을 녹음·첨부하세요." };

  const rec: Record<string, any> = {
    title: inp.title?.trim() || TITLE_PLACEHOLDER,
    meeting_type: inp.meetingType === "외부" ? "외부" : "내부",
    meeting_date: inp.meetingDate || null,
    attendees: inp.attendees?.trim() || null,
    location: inp.location?.trim() || null,
    body: inp.body?.trim() || null,
  };
  if (inp.filePath) {
    rec.file_path = inp.filePath;
    rec.file_name = inp.fileName || null;
  }

  const svc = createSupabaseServiceClient();
  if (inp.id) {
    rec.updated_at = new Date().toISOString();
    const { error } = await svc.from("meetings").update(rec).eq("id", inp.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/meetings");
    return { ok: true, id: inp.id };
  }
  rec.created_by = u.id;
  const { data: ins, error } = await svc.from("meetings").insert(rec).select("id").single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/meetings");
  return { ok: true, id: ins?.id };
}

// AI 회의록 정리
export async function summarizeMeeting(id: string): Promise<Result & { summary?: string; title?: string }> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const svc = createSupabaseServiceClient();
  const { data, error } = await svc
    .from("meetings")
    .select("title,meeting_type,meeting_date,attendees,location,body,file_path,file_name")
    .eq("id", id)
    .single();
  if (error || !data) return { ok: false, error: "기록을 찾을 수 없습니다." };

  // 본문이 없고 음성 파일이 첨부돼 있으면, 먼저 음성을 텍스트로 변환한다.
  let body = (data.body || "").trim();
  if (!body && data.file_path && isAudioPath(data.file_path)) {
    if (!(await getOpenAIKey())) {
      return {
        ok: false,
        error:
          "첨부된 음성 파일을 자동 정리하려면 설정 화면에서 ‘음성 텍스트 변환(OpenAI)’을 연결하세요. 또는 ‘수정’에서 🎙 음성 녹음으로 직접 받아 적을 수 있습니다.",
      };
    }
    const dl = await svc.storage.from(BUCKET).download(data.file_path);
    if (dl.error || !dl.data) return { ok: false, error: "음성 파일을 불러오지 못했습니다." };
    const buf = Buffer.from(await dl.data.arrayBuffer());
    const tr = await transcribeAudio(buf, data.file_name || "audio.m4a", (dl.data as any).type || "audio/m4a");
    if (!tr.ok) return { ok: false, error: `음성 변환 실패: ${tr.error}` };
    if (!tr.text) return { ok: false, error: "음성에서 내용을 인식하지 못했습니다(무음이거나 잡음)." };
    body = tr.text;
    await svc.from("meetings").update({ body, updated_at: new Date().toISOString() }).eq("id", id);
  }

  if (!body) return { ok: false, error: "정리할 내용이 없습니다. 먼저 회의 내용을 작성하거나 음성을 녹음·첨부하세요." };

  let summary = "";
  try {
    const anthropic = await getAnthropic();
    const prompt = `당신은 회의록 정리 담당자입니다. 아래 미팅 원문을 한국어 회의록으로 깔끔하게 정리하세요.
원문에 없는 내용은 지어내지 마세요. 반드시 아래 형식을 그대로 지키세요.
맨 첫 줄에 회의를 대표하는 20자 이내 제목을 "제목: " 형식으로 쓰고, 한 줄 띄운 뒤 회의록을 작성하세요.

제목: (여기에 간결한 제목)

## 회의 개요
- 일시 / 유형(외부·내부) / 장소 / 참석자
## 핵심 논의
- (불릿으로 요점만)
## 결정 사항
- (합의·결정된 것만. 없으면 "해당 없음")
## 액션 아이템
- [담당자 / 기한] 할 일 (원문에서 유추 가능한 범위)
## 후속 메모
- (특이사항·리스크·다음 미팅 등)

[원문]
유형: ${data.meeting_type}
일시: ${data.meeting_date || "-"}
장소: ${data.location || "-"}
참석자: ${data.attendees || "-"}

${body}`;

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

  // 첫 줄의 '제목:' 을 뽑아 제목이 비어있거나 자동 플레이스홀더면 채운다.
  const titleMatch = summary.match(/^\s*제목\s*[:：]\s*(.+)$/m);
  const genTitle = titleMatch ? titleMatch[1].trim().slice(0, 60) : "";
  const minutes = summary.replace(/^\s*제목\s*[:：].*$/m, "").trim() || summary;

  const placeholders = ["", TITLE_PLACEHOLDER, "무제", "무제 미팅"];
  const upd: Record<string, any> = { ai_summary: minutes, updated_at: new Date().toISOString() };
  if (genTitle && placeholders.includes((data.title || "").trim())) upd.title = genTitle;

  const { error: upErr } = await svc.from("meetings").update(upd).eq("id", id);
  if (upErr) return { ok: false, error: upErr.message };

  revalidatePath("/meetings");
  return { ok: true, summary: minutes, title: upd.title };
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
