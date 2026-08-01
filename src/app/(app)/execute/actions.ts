"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";
import { generateExecutionContent } from "@/lib/agents/execute-content";
import { runComplianceCheck } from "@/lib/compliance";
import { submitSeedanceVideo, pollSeedanceVideo } from "@/lib/media/seedance";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { Brand } from "@/lib/types";

const BUCKET = "generated-media";

type Result = { ok: boolean; error?: string };

async function requireStaff() {
  const user = await requireAppUser();
  if (user.role !== "owner" && user.role !== "staff") return null;
  return user;
}

// 집행 시작: 상태를 '진행'으로.
export async function startExecution(taskId: string): Promise<Result> {
  const user = await requireStaff();
  if (!user) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("tasks")
    .update({ status: "진행", assignee_user_id: user.id, updated_at: new Date().toISOString() })
    .eq("id", taskId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/execute");
  revalidatePath("/tasks");
  return { ok: true };
}

// 집행 콘텐츠 생성: 승인 원문 + 실제 제품컷으로 최종 게시본을 만든다. 상태도 '진행'으로.
export async function generateExecContent(taskId: string): Promise<Result> {
  const user = await requireStaff();
  if (!user) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();

  const { data: task } = await supabase
    .from("tasks")
    .select("id, brand_id, ai_output_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return { ok: false, error: "업무를 찾을 수 없습니다." };
  const t = task as { id: string; brand_id: string | null; ai_output_id: string | null };
  if (!t.brand_id) return { ok: false, error: "브랜드 정보가 없습니다." };

  const [{ data: brand }, { data: output }, { data: shots }] = await Promise.all([
    supabase.from("brands").select("*").eq("id", t.brand_id).maybeSingle(),
    t.ai_output_id
      ? supabase.from("ai_outputs").select("body").eq("id", t.ai_output_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("product_shots").select("label, file_name").eq("brand_id", t.brand_id).limit(30),
  ]);
  if (!brand) return { ok: false, error: "브랜드를 찾을 수 없습니다." };

  const draft = (output as { body: string | null } | null)?.body ?? "";
  const shotList = (shots ?? []) as { label: string | null; file_name: string | null }[];

  let gen;
  try {
    gen = await generateExecutionContent(brand as Brand, draft, shotList);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "콘텐츠 생성 실패" };
  }

  // 생성된 최종본도 규칙 기반 규제 검수를 한 번 더 — 걸리면 경고를 문구 위에 붙인다.
  const check = runComplianceCheck(brand as Brand, gen.content);
  const content =
    check.verdict === "fail"
      ? `⚠ 규제 확인 필요: ${check.findings.map((f) => `“${f.phrase}”(${f.rule})`).join(", ")}\n\n${gen.content}`
      : gen.content;

  const { error } = await supabase
    .from("tasks")
    .update({
      exec_content: content,
      exec_gen_model: gen.model,
      status: "진행",
      assignee_user_id: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/execute");
  return { ok: true };
}

// 집행 완료: 채널·결과 링크·메모를 기록하고 완료 처리.
export async function completeExecution(
  taskId: string,
  data: { channel: string; link: string; note: string }
): Promise<Result> {
  const user = await requireStaff();
  if (!user) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
  const { error } = await supabase
    .from("tasks")
    .update({
      status: "완료",
      exec_channel: data.channel.trim() || null,
      exec_link: data.link.trim() || null,
      exec_note: data.note.trim() || null,
      completed_date: today,
      assignee_user_id: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/execute");
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  return { ok: true };
}

// 되돌리기: 완료를 다시 진행으로.
export async function reopenExecution(taskId: string): Promise<Result> {
  const user = await requireStaff();
  if (!user) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("tasks")
    .update({ status: "진행", completed_date: null, updated_at: new Date().toISOString() })
    .eq("id", taskId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/execute");
  return { ok: true };
}

// ── Seedance 영상 생성 (제품컷 → 영상, fal 큐) ──────────────────────────────

type VideoResult = { ok: boolean; error?: string; status?: string };

// 영상 생성 요청. 상태를 queued로 두고 폴링(checkVideo)으로 완성 여부를 확인한다.
export async function submitVideo(
  taskId: string,
  imageUrl: string,
  prompt: string
): Promise<VideoResult> {
  const user = await requireStaff();
  if (!user) return { ok: false, error: "권한이 없습니다." };
  if (!imageUrl) return { ok: false, error: "영상의 기준이 될 제품컷을 선택하세요." };

  let sub;
  try {
    sub = await submitSeedanceVideo(imageUrl, prompt);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "영상 요청 실패" };
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("tasks")
    .update({
      video_status: "queued",
      video_url: null,
      video_meta: {
        request_id: sub.requestId,
        status_url: sub.statusUrl,
        response_url: sub.responseUrl,
        image: imageUrl,
        prompt: prompt || null,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/execute");
  return { ok: true, status: "queued" };
}

// 영상 상태 확인. 완성되면 결과 영상을 Storage로 내려받아 저장한다.
export async function checkVideo(taskId: string): Promise<VideoResult> {
  const user = await requireStaff();
  if (!user) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();

  const { data: task } = await supabase
    .from("tasks")
    .select("video_status, video_meta")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return { ok: false, error: "업무를 찾을 수 없습니다." };
  const t = task as { video_status: string | null; video_meta: Record<string, string> | null };
  if (t.video_status === "done") return { ok: true, status: "done" };

  const meta = t.video_meta ?? {};
  if (!meta.status_url || !meta.response_url) return { ok: true, status: t.video_status ?? "idle" };

  let poll;
  try {
    poll = await pollSeedanceVideo(meta.status_url, meta.response_url);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "상태 확인 실패" };
  }

  if (poll.state === "processing") {
    if (t.video_status !== "processing") {
      await supabase.from("tasks").update({ video_status: "processing" }).eq("id", taskId);
    }
    return { ok: true, status: "processing" };
  }

  if (poll.state === "failed") {
    await supabase
      .from("tasks")
      .update({ video_status: "failed", video_meta: { ...meta, error: poll.error } })
      .eq("id", taskId);
    return { ok: false, error: poll.error, status: "failed" };
  }

  // done — 결과 영상을 Storage로 내려받아 영구 저장.
  let publicUrl = poll.videoUrl;
  try {
    const svc = createSupabaseServiceClient();
    const bin = await fetch(poll.videoUrl, { cache: "no-store" });
    const buf = Buffer.from(await bin.arrayBuffer());
    const path = `videos/${taskId}-${Date.now()}.mp4`;
    const { error: upErr } = await svc.storage
      .from(BUCKET)
      .upload(path, buf, { contentType: "video/mp4", upsert: true });
    if (!upErr) {
      publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
    }
  } catch {
    /* 저장 실패 시 fal URL 그대로 사용 */
  }

  await supabase
    .from("tasks")
    .update({ video_status: "done", video_url: publicUrl, updated_at: new Date().toISOString() })
    .eq("id", taskId);
  revalidatePath("/execute");
  return { ok: true, status: "done" };
}
