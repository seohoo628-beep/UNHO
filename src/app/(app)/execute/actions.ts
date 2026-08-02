"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";
import { generateExecutionContent } from "@/lib/agents/execute-content";
import { runComplianceCheck } from "@/lib/compliance";
import { submitSeedanceVideo, pollSeedanceVideo, submitMergeVideos } from "@/lib/media/seedance";
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

type Clip = { status_url: string; response_url: string; url: string | null; failed?: boolean; error?: string };
type VideoMeta = {
  stage?: "clips" | "merge" | "single";
  clips?: Clip[];
  merge?: { status_url: string; response_url: string } | null;
  image?: string;
  prompt?: string | null;
  target_sec?: number;
  note?: string | null;
  error?: string;
  started_at?: string;
  merge_at?: string;
  // 레거시 단일 클립 필드
  status_url?: string;
  response_url?: string;
  request_id?: string;
};

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

// 결과 fal 영상 URL을 Storage로 내려받아 영구 공개 URL로 만든다. 실패하면 원본 URL 사용.
async function finalizeUrl(taskId: string, videoUrl: string): Promise<string> {
  try {
    const svc = createSupabaseServiceClient();
    const bin = await fetch(videoUrl, { cache: "no-store" });
    const buf = Buffer.from(await bin.arrayBuffer());
    const path = `videos/${taskId}-${Date.now()}.mp4`;
    const { error: upErr } = await svc.storage
      .from(BUCKET)
      .upload(path, buf, { contentType: "video/mp4", upsert: true });
    if (!upErr) {
      return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
    }
  } catch {
    /* 저장 실패 시 fal URL 그대로 사용 */
  }
  return videoUrl;
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

  const prompts = scenePrompts(prompt);
  // 클립별 소스 이미지: 선택 이미지를 맨 앞에 두고 나머지 제품컷으로 3장을 채운다(부족하면 반복).
  const pool = [imageUrl, ...(images ?? []).filter((u) => u && u !== imageUrl)];
  const sources = [0, 1, 2].map((i) => pool[i] ?? pool[pool.length - 1] ?? imageUrl);

  // fal 동시 요청 제한(429)을 피하려고 클립을 순차로 큐에 넣는다.
  const clips: Clip[] = [];
  try {
    for (let i = 0; i < prompts.length; i++) {
      const s = await submitSeedanceVideo(sources[i], prompts[i]);
      clips.push({ status_url: s.statusUrl, response_url: s.responseUrl, url: null });
    }
  } catch (e) {
    // 일부라도 큐에 들어갔으면 그것으로 진행(최소 10초라도 나오게), 하나도 없으면 오류를 기록.
    if (clips.length === 0) {
      const error = e instanceof Error ? e.message : "영상 요청 실패";
      const supabase = createSupabaseServerClient();
      await supabase
        .from("tasks")
        .update({ video_status: "failed", video_meta: { note: `⚠ ${error}`, error } })
        .eq("id", taskId);
      revalidatePath("/execute");
      return { ok: false, error };
    }
  }
  const meta: VideoMeta = {
    stage: "clips",
    clips,
    merge: null,
    image: imageUrl,
    prompt: prompt || null,
    target_sec: 30,
    started_at: new Date().toISOString(),
    note: `⏳ 10초 클립 ${clips.length}개 생성 중… (완성되면 30초로 이어붙입니다)`,
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

// 영상 상태 확인. 클립 3개 → 병합 → 완료의 상태머신. 병합이 안 되면 첫 클립으로 폴백.
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
  if (t.video_status === "done") return { ok: true, status: "done" };

  const meta: VideoMeta = t.video_meta ?? {};

  const fail = async (error: string): Promise<VideoResult> => {
    await supabase
      .from("tasks")
      .update({ video_status: "failed", video_meta: { ...meta, error, note: `⚠ ${error}` } })
      .eq("id", taskId);
    return { ok: false, error, status: "failed" };
  };
  const finish = async (fatUrl: string, note?: string): Promise<VideoResult> => {
    const publicUrl = await finalizeUrl(taskId, fatUrl);
    await supabase
      .from("tasks")
      .update({
        video_status: "done",
        video_url: publicUrl,
        video_meta: { ...meta, note: note ?? null },
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId);
    revalidatePath("/execute");
    return { ok: true, status: "done" };
  };

  // ── 레거시: 단일 클립(구버전 요청) ──
  if (meta.stage === "single" || (!meta.stage && meta.status_url && meta.response_url)) {
    try {
      const poll = await pollSeedanceVideo(meta.status_url!, meta.response_url!);
      if (poll.state === "processing") {
        if (t.video_status !== "processing")
          await supabase.from("tasks").update({ video_status: "processing" }).eq("id", taskId);
        return { ok: true, status: "processing" };
      }
      if (poll.state === "failed") return fail(poll.error);
      return finish(poll.videoUrl, "10초 단일 영상(구버전)입니다. ‘다시 생성’을 누르면 30초로 만듭니다.");
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "상태 확인 실패" };
    }
  }

  const elapsed = (iso?: string) => (iso ? Date.now() - Date.parse(iso) : 0);

  // ── 병합 단계: 이어붙인 30초 영상 폴링 ──
  if (meta.stage === "merge" && meta.merge) {
    try {
      const poll = await pollSeedanceVideo(meta.merge.status_url, meta.merge.response_url);
      if (poll.state === "processing") {
        const sec = Math.round(elapsed(meta.merge_at) / 1000);
        // 병합이 5분 넘게 안 끝나면 무한 대기 대신 10초본으로 마무리.
        if (elapsed(meta.merge_at) > 300000) {
          const first = meta.clips?.find((c) => c.url)?.url;
          if (first)
            return finish(first, `⚠ 30초 병합이 5분 넘게 안 끝나 10초본을 제공합니다. (fal 상태: ${poll.status ?? "?"})`);
        }
        // 진행 상황(경과·fal 상태)을 화면에 남긴다.
        const note = `⏳ 클립 3개를 30초로 이어붙이는 중… (${sec}초, fal: ${poll.status ?? "?"})`;
        if (t.video_status !== "processing" || meta.note !== note)
          await supabase
            .from("tasks")
            .update({ video_status: "processing", video_meta: { ...meta, note } })
            .eq("id", taskId);
        return { ok: true, status: "processing" };
      }
      if (poll.state === "failed") {
        // 병합 실패 → 첫 클립이라도 살린다.
        const first = meta.clips?.find((c) => c.url)?.url;
        if (first) return finish(first, `⚠ 30초 병합에 실패해 우선 10초본을 제공합니다. (${poll.error})`);
        return fail(`영상 병합 실패: ${poll.error}`);
      }
      return finish(poll.videoUrl, "✓ 10초 클립 3개를 이어붙여 30초 영상을 만들었습니다.");
    } catch (e) {
      const first = meta.clips?.find((c) => c.url)?.url;
      if (first) return finish(first, "30초 병합 확인 중 오류로 우선 10초본을 제공합니다.");
      return { ok: false, error: e instanceof Error ? e.message : "병합 확인 실패" };
    }
  }

  // ── 클립 단계: 3개 클립 각각 폴링 ──
  const clips = meta.clips ?? [];
  if (clips.length === 0) return { ok: true, status: t.video_status ?? "idle" };

  let changed = false;
  for (const clip of clips) {
    if (clip.url || clip.failed) continue;
    try {
      const poll = await pollSeedanceVideo(clip.status_url, clip.response_url);
      if (poll.state === "failed") {
        // 클립 하나가 실패해도 전체를 죽이지 않는다. 표시만 하고 나머지로 진행.
        clip.failed = true;
        clip.error = poll.error;
        changed = true;
      } else if (poll.state === "done") {
        clip.url = poll.videoUrl;
        changed = true;
      }
      // processing이면 다음 폴링에서 다시 확인
    } catch {
      // 일시 오류는 다음 폴링에서 재시도
    }
  }

  const doneCount = clips.filter((c) => c.url).length;
  const resolved = clips.every((c) => c.url || c.failed); // 성공 또는 실패로 판정 끝
  // 4분 넘게 다 판정 안 나면, 지금까지 된 것만으로 진행(무한 대기 방지).
  const clipTimedOut = !resolved && elapsed(meta.started_at) > 240000 && doneCount >= 1;
  if (!resolved && !clipTimedOut) {
    const pend = clips.length - clips.filter((c) => c.url || c.failed).length;
    const progressNote = `⏳ 10초 클립 생성 중 (완료 ${doneCount}/${clips.length}${pend ? `, 진행 ${pend}` : ""}) — 완성되면 30초로 이어붙입니다.`;
    if (changed || t.video_status !== "processing" || meta.note !== progressNote) {
      await supabase
        .from("tasks")
        .update({ video_status: "processing", video_meta: { ...meta, clips, note: progressNote } })
        .eq("id", taskId);
    }
    return { ok: true, status: "processing" };
  }

  const urls = clips.map((c) => c.url).filter((u): u is string => !!u);
  const firstErr = clips.find((c) => c.failed)?.error;

  // 성공한 클립이 하나도 없으면 실패(정확한 사유 표기).
  if (urls.length === 0) {
    return fail(`클립 생성 실패: ${firstErr ?? "알 수 없는 오류"}`);
  }
  // 성공 클립이 1개뿐이면 이어붙일 게 없으니 10초본으로 마무리.
  if (urls.length < 2) {
    const why = firstErr ? ` (일부 클립 실패: ${firstErr})` : "";
    return finish(urls[0], `⚠ 클립 1개만 성공해 10초본으로 제공합니다.${why}`);
  }

  // 모든 클립 완료 → 이어붙이기 요청. 실패하면 첫 클립으로 폴백(사유 기록).
  try {
    const mergeSub = await submitMergeVideos(urls);
    await supabase
      .from("tasks")
      .update({
        video_status: "processing",
        video_meta: {
          ...meta,
          clips,
          stage: "merge",
          merge: { status_url: mergeSub.statusUrl, response_url: mergeSub.responseUrl },
          merge_at: new Date().toISOString(),
          note: `⏳ 클립 ${urls.length}개를 30초로 이어붙이는 중…`,
        },
      })
      .eq("id", taskId);
    return { ok: true, status: "processing" };
  } catch (e) {
    // 병합 엔드포인트 미지원 등 → 첫 클립을 결과물로 저장하되 사유를 남긴다.
    const reason = e instanceof Error ? e.message : "병합 실패";
    return finish(urls[0], `⚠ 30초 병합에 실패해 우선 10초본을 제공합니다. (${reason})`);
  }
}
