// 영상 생성 상태머신(클립 → 병합 → 완료). UI(checkVideo)와 크론(/api/cron/video)이 공유한다.
// db는 Supabase 클라이언트(UI는 서버 RLS, 크론은 service). revalidate는 호출측에서 처리.
import type { SupabaseClient } from "@supabase/supabase-js";
import { pollSeedanceVideo, submitMergeVideos } from "@/lib/media/seedance";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const BUCKET = "generated-media";

export type Clip = { status_url: string; response_url: string; url: string | null; failed?: boolean; error?: string };
export type VideoMeta = {
  stage?: "clips" | "merge" | "single";
  clips?: Clip[];
  merge?: { status_url: string; response_url: string } | null;
  image?: string;
  prompt?: string | null;
  target_sec?: number;
  cheap?: boolean;
  note?: string | null;
  error?: string;
  started_at?: string;
  merge_at?: string;
  // 레거시 단일 클립 필드
  status_url?: string;
  response_url?: string;
  request_id?: string;
};

export type AdvanceResult = { ok: boolean; error?: string; status?: string };

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

// 한 태스크의 영상 상태를 한 스텝 전진시킨다.
export async function advanceVideoTask(
  db: SupabaseClient,
  taskId: string,
  task: { video_status: string | null; video_meta: VideoMeta | null }
): Promise<AdvanceResult> {
  if (task.video_status === "done") return { ok: true, status: "done" };
  const t = task;
  const meta: VideoMeta = t.video_meta ?? {};

  const fail = async (error: string): Promise<AdvanceResult> => {
    await db
      .from("tasks")
      .update({ video_status: "failed", video_meta: { ...meta, error, note: `⚠ ${error}` } })
      .eq("id", taskId);
    return { ok: false, error, status: "failed" };
  };
  const finish = async (fatUrl: string, note?: string): Promise<AdvanceResult> => {
    const publicUrl = await finalizeUrl(taskId, fatUrl);
    await db
      .from("tasks")
      .update({
        video_status: "done",
        video_url: publicUrl,
        video_meta: { ...meta, note: note ?? null },
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId);
    return { ok: true, status: "done" };
  };

  // ── 레거시: 단일 클립(구버전 요청) ──
  if (meta.stage === "single" || (!meta.stage && meta.status_url && meta.response_url)) {
    try {
      const poll = await pollSeedanceVideo(meta.status_url!, meta.response_url!);
      if (poll.state === "processing") {
        if (t.video_status !== "processing")
          await db.from("tasks").update({ video_status: "processing" }).eq("id", taskId);
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
        if (elapsed(meta.merge_at) > 300000) {
          const first = meta.clips?.find((c) => c.url)?.url;
          if (first)
            return finish(first, `⚠ 30초 병합이 5분 넘게 안 끝나 10초본을 제공합니다. (fal 상태: ${poll.status ?? "?"})`);
        }
        const note = `⏳ 클립 3개를 30초로 이어붙이는 중… (${sec}초, fal: ${poll.status ?? "?"})`;
        if (t.video_status !== "processing" || meta.note !== note)
          await db.from("tasks").update({ video_status: "processing", video_meta: { ...meta, note } }).eq("id", taskId);
        return { ok: true, status: "processing" };
      }
      if (poll.state === "failed") {
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

  // ── 클립 단계: 각 클립 폴링 ──
  const clips = meta.clips ?? [];
  if (clips.length === 0) return { ok: true, status: t.video_status ?? "idle" };

  let changed = false;
  for (const clip of clips) {
    if (clip.url || clip.failed) continue;
    try {
      const poll = await pollSeedanceVideo(clip.status_url, clip.response_url);
      if (poll.state === "failed") {
        clip.failed = true;
        clip.error = poll.error;
        changed = true;
      } else if (poll.state === "done") {
        clip.url = poll.videoUrl;
        changed = true;
      }
    } catch {
      /* 일시 오류는 다음 폴링에서 재시도 */
    }
  }

  const doneCount = clips.filter((c) => c.url).length;
  const resolved = clips.every((c) => c.url || c.failed);
  const el = elapsed(meta.started_at);
  const softTimeout = !resolved && el > 240000 && doneCount >= 1;
  const hardTimeout = !resolved && el > 360000;
  if (!resolved && !softTimeout && !hardTimeout) {
    const pend = clips.length - clips.filter((c) => c.url || c.failed).length;
    const progressNote = `⏳ 10초 클립 생성 중 (완료 ${doneCount}/${clips.length}${pend ? `, 진행 ${pend}` : ""}) — 완성되면 30초로 이어붙입니다.`;
    if (changed || t.video_status !== "processing" || meta.note !== progressNote) {
      await db
        .from("tasks")
        .update({ video_status: "processing", video_meta: { ...meta, clips, note: progressNote } })
        .eq("id", taskId);
    }
    return { ok: true, status: "processing" };
  }

  const urls = clips.map((c) => c.url).filter((u): u is string => !!u);
  const firstErr = clips.find((c) => c.failed)?.error;

  if (urls.length === 0) {
    if (hardTimeout) return fail("영상 생성이 6분 넘게 완료되지 않았습니다. 다시 시도하세요.");
    return fail(`클립 생성 실패: ${firstErr ?? "알 수 없는 오류"}`);
  }
  if (urls.length < 2) {
    if (meta.cheap) return finish(urls[0], "✓ 10초 영상을 만들었습니다. (저렴 모드)");
    const why = firstErr ? ` (일부 클립 실패: ${firstErr})` : "";
    return finish(urls[0], `⚠ 클립 1개만 성공해 10초본으로 제공합니다.${why}`);
  }

  // 모든(또는 성공) 클립 완료 → 이어붙이기 요청. 실패하면 첫 클립으로 폴백.
  try {
    const mergeSub = await submitMergeVideos(urls);
    await db
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
    const reason = e instanceof Error ? e.message : "병합 실패";
    return finish(urls[0], `⚠ 30초 병합에 실패해 우선 10초본을 제공합니다. (${reason})`);
  }
}
