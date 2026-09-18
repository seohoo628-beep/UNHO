import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { advanceVideoTask, type VideoMeta } from "@/lib/media/advance-video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel Cron: 5분마다 실행(사용량 절감). 진행 중(queued/processing)인 영상 태스크를 서버가 대신 전진시킨다.
// → 사용자가 화면을 꺼도 클립 생성·병합이 완료된다.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = createSupabaseServiceClient();
  const { data, error } = await db
    .from("tasks")
    .select("id, video_status, video_meta")
    .in("video_status", ["queued", "processing"])
    .order("updated_at", { ascending: true })
    .limit(15);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as { id: string; video_status: string | null; video_meta: VideoMeta | null }[];
  if (rows.length === 0) return NextResponse.json({ ran_at: new Date().toISOString(), advanced: 0, results: [] }); // 진행 중 작업 없음 → 즉시 종료
  const results = await Promise.allSettled(
    rows.map((r) => advanceVideoTask(db, r.id, { video_status: r.video_status, video_meta: r.video_meta }))
  );

  const summary = results.map((r, i) => ({
    id: rows[i].id,
    ...(r.status === "fulfilled" ? r.value : { ok: false, error: String(r.reason) }),
  }));
  return NextResponse.json({ ran_at: new Date().toISOString(), advanced: rows.length, results: summary });
}
