"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";
import { generateExecutionContent } from "@/lib/agents/execute-content";
import { runComplianceCheck } from "@/lib/compliance";
import { submitSeedanceVideo } from "@/lib/media/seedance";
import { getSetting } from "@/lib/settings";
import { advanceVideoTask, type VideoMeta, type Clip } from "@/lib/media/advance-video";
import type { Brand } from "@/lib/types";


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

// 30초 영상을 위한 3개 장면 프롬프트(인트로·핵심·마무리). 각 10초 클립을 이어붙인다.
// 영상 모델이 한글 자막을 그려 깨지는 것을 막기 위해 프롬프트는 영어 시각 묘사 + '텍스트 금지'로 통일한다.
const NO_TEXT =
  "Absolutely no on-screen text, no captions, no subtitles, no letters, no words, no logos overlaid, no watermark. Keep any existing product label text on the product sharp, legible, static and undistorted — never warp, melt, morph or animate text.";

function scenePrompts(base: string): string[] {
  const b = (base || "").trim();
  // 사용자/AI 지시는 '연출 참고'로만 쓰고 화면에 글자로 렌더하지 않도록 명시한다.
  const ctx = b ? `Direction (context only, never render this text on screen): ${b}. ` : "";
  const common = `${ctx}Premium cinematic commercial, natural soft lighting, shallow depth of field, smooth dynamic camera motion, photorealistic, high detail, 4k. ${NO_TEXT}`;
  return [
    `Opening establishing shot: a smooth slow push-in that draws the viewer into the scene, gentle light bloom. ${common}`,
    `Detail beauty shot: rich texture and appetizing/product details from a flattering angle, subtle orbit and rack focus. ${common}`,
    `Hero closing shot: an elegant wide reveal with a slow graceful pull-back, warm lingering premium mood. ${common}`,
  ];
}

// 영상 생성 요청. 30초를 목표로 10초 클립 3개를 만들어 이어붙인다.
// images(제품컷 여러 장)가 있으면 클립마다 '다른 사진'을 써서 몽타주로 만들어 퀄리티를 높인다.
export async function submitVideo(
  taskId: string,
  imageUrl: string,
  prompt: string,
  images?: string[]
): Promise<VideoResult> {
  const user = await requireStaff();
  if (!user) return { ok: false, error: "권한이 없습니다." };
  if (!imageUrl) return { ok: false, error: "영상의 기준이 될 제품컷을 선택하세요." };

  // 저렴 모드: 10초 클립 1개만(크레딧 절약). 기본: 30초(10초×3 병합).
  const cheap = (await getSetting("video_cheap_mode")) === "1";
  const clipCount = cheap ? 1 : 3;

  const prompts = scenePrompts(prompt).slice(0, clipCount);
  // 클립별 소스 이미지: 선택 이미지를 맨 앞에 두고 나머지 제품컷으로 채운다(부족하면 반복).
  const pool = [imageUrl, ...(images ?? []).filter((u) => u && u !== imageUrl)];
  const sources = Array.from({ length: clipCount }, (_, i) => pool[i] ?? pool[pool.length - 1] ?? imageUrl);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  // 클립을 '동시에' 요청한다(빠름 → 서버 함수 시간초과로 클립이 누락되지 않음).
  // 각 클립은 실패 시 짧게 쉬고 1회 재시도해 429 순간 제한을 흡수한다.
  const settled = await Promise.allSettled(
    sources.map(async (src, i) => {
      try {
        return await submitSeedanceVideo(src, prompts[i]);
      } catch {
        await sleep(1500);
        return await submitSeedanceVideo(src, prompts[i]);
      }
    })
  );
  const clips: Clip[] = [];
  let lastErr = "영상 요청 실패";
  for (const r of settled) {
    if (r.status === "fulfilled") {
      clips.push({ status_url: r.value.statusUrl, response_url: r.value.responseUrl, url: null });
    } else {
      lastErr = r.reason instanceof Error ? r.reason.message : String(r.reason);
    }
  }
  // 하나도 큐에 못 넣었으면 사유를 기록하고 실패.
  if (clips.length === 0) {
    const supabase = createSupabaseServerClient();
    await supabase
      .from("tasks")
      .update({ video_status: "failed", video_meta: { note: `⚠ ${lastErr}`, error: lastErr } })
      .eq("id", taskId);
    revalidatePath("/execute");
    return { ok: false, error: lastErr };
  }
  // 요청한 클립 중 일부만 큐에 들어갔으면 사유를 함께 표기(대개 fal 요청제한/크레딧).
  const startNote =
    clips.length < sources.length
      ? `⏳ 클립 ${clips.length}/${sources.length}개만 요청됨 — 나머지는 fal에서 거부. (사유: ${lastErr})`
      : cheap
      ? "⏳ 10초 영상 생성 중… (저렴 모드)"
      : `⏳ 10초 클립 ${clips.length}개 생성 중… (완성되면 30초로 이어붙입니다)`;
  const meta: VideoMeta = {
    stage: "clips",
    clips,
    merge: null,
    image: imageUrl,
    prompt: prompt || null,
    target_sec: cheap ? 10 : 30,
    cheap,
    started_at: new Date().toISOString(),
    note: startNote,
  };

  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("tasks")
    .update({
      video_status: "queued",
      video_url: null,
      video_meta: meta,
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/execute");
  return { ok: true, status: "queued" };
}

// 영상 상태 확인(수동). 실제 상태 전진은 공용 상태머신(advanceVideoTask)에 위임한다.
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
  const t = task as { video_status: string | null; video_meta: VideoMeta | null };

  const r = await advanceVideoTask(supabase, taskId, t);
  revalidatePath("/execute");
  return r;
}
