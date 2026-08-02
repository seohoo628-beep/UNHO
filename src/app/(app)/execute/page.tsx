import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ExecutionCard, { ExecItem } from "@/components/ExecutionCard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Row = {
  id: string;
  title: string;
  brand_id: string | null;
  category: string | null;
  status: string;
  ai_agent_type: string | null;
  exec_channel: string | null;
  exec_link: string | null;
  exec_note: string | null;
  exec_content: string | null;
  video_status: string | null;
  video_url: string | null;
  video_meta: { note?: string | null } | null;
  thumb_urls: string[] | null;
  brands: { name: string } | null;
  ai_output: { body: string | null; agent_type: string | null } | null;
};

type ShotImg = { url: string; label: string };

function toItem(r: Row, imagesByBrand: Map<string, ShotImg[]>): ExecItem {
  return {
    id: r.id,
    title: r.title,
    brandName: r.brands?.name ?? "-",
    category: r.category,
    status: r.status,
    agentType: r.ai_agent_type ?? r.ai_output?.agent_type ?? null,
    body: r.ai_output?.body ?? null,
    execContent: r.exec_content,
    execChannel: r.exec_channel,
    execLink: r.exec_link,
    execNote: r.exec_note,
    images: (r.brand_id && imagesByBrand.get(r.brand_id)) || [],
    videoStatus: r.video_status,
    videoUrl: r.video_url,
    videoNote: r.video_meta?.note ?? null,
    thumbUrls: (r.thumb_urls ?? []) as string[],
  };
}

export default async function ExecutePage() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");
  const supabase = createSupabaseServerClient();

  const common =
    "id, title, brand_id, category, status, ai_agent_type, exec_channel, exec_link, exec_note, exec_content, video_status, video_url, video_meta, brands(name), ai_output:ai_output_id(body, agent_type)";
  const selWith = `${common}, thumb_urls`;

  const loadWith = (sel: string) =>
    Promise.all([
      supabase
        .from("tasks")
        .select(sel)
        .not("ai_output_id", "is", null)
        .eq("ai_agent_type", "marketer") // 릴스·숏츠 콘텐츠 생성만
        .in("status", ["예정", "진행", "보류"])
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("tasks")
        .select(sel)
        .not("ai_output_id", "is", null)
        .eq("ai_agent_type", "marketer")
        .eq("status", "완료")
        .order("completed_date", { ascending: false })
        .limit(20),
    ]);

  let [{ data: active, error: aErr }, { data: done }] = await loadWith(selWith);
  let needsThumbMigration = false;
  if (aErr) {
    // thumb_urls 컬럼 미적용 → 컬럼 없이 다시 로드하고 안내 배너 표시.
    needsThumbMigration = true;
    [{ data: active }, { data: done }] = await loadWith(common);
  }

  const rowsAll = [...((active ?? []) as unknown as Row[]), ...((done ?? []) as unknown as Row[])];

  // 관련 브랜드들의 실제 제품컷을 한 번에 읽어 브랜드별로 묶는다.
  const brandIds = [...new Set(rowsAll.map((r) => r.brand_id).filter(Boolean))] as string[];
  const imagesByBrand = new Map<string, ShotImg[]>();
  if (brandIds.length > 0) {
    const { data: shots } = await supabase
      .from("product_shots")
      .select("brand_id, storage_path, label, file_name")
      .in("brand_id", brandIds)
      .order("created_at", { ascending: false });
    const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/generated-media/`;
    for (const s of (shots ?? []) as {
      brand_id: string;
      storage_path: string;
      label: string | null;
      file_name: string | null;
    }[]) {
      const arr = imagesByBrand.get(s.brand_id) ?? [];
      arr.push({ url: base + s.storage_path, label: s.label || s.file_name || "제품컷" });
      imagesByBrand.set(s.brand_id, arr);
    }
  }

  const activeItems = ((active ?? []) as unknown as Row[]).map((r) => toItem(r, imagesByBrand));
  const doneItems = ((done ?? []) as unknown as Row[]).map((r) => toItem(r, imagesByBrand));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>집행 센터</h1>
          <p>대표가 승인한 산출물을 여기서 실제 집행한다. 원문을 복사해 채널에 올린 뒤 결과 링크를 남기면 완료된다.</p>
        </div>
      </div>

      {needsThumbMigration && (
        <div className="card" style={{ borderLeft: "4px solid var(--warn, #f59e0b)", marginBottom: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>썸네일 저장 준비 — DB 한 줄 실행 필요</div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
            Supabase → SQL Editor에 아래를 실행하면 생성한 썸네일이 업무에 저장·표시됩니다.
          </p>
          <pre className="pre" style={{ fontSize: 11.5, overflow: "auto" }}>
            {`alter table public.tasks
  add column if not exists thumb_urls jsonb not null default '[]'::jsonb;`}
          </pre>
        </div>
      )}

      <div className="section-title">집행 대기 · 진행 ({activeItems.length})</div>
      {activeItems.length === 0 ? (
        <div className="card">
          <div className="empty">
            집행할 항목이 없습니다. 승인 큐에서 산출물을 <b>승인</b>하면 여기로 넘어옵니다.
          </div>
        </div>
      ) : (
        activeItems.map((it) => <ExecutionCard key={it.id} item={it} />)
      )}

      {doneItems.length > 0 && (
        <>
          <div className="section-title">최근 집행 완료 ({doneItems.length})</div>
          {doneItems.map((it) => (
            <ExecutionCard key={it.id} item={it} />
          ))}
        </>
      )}
    </div>
  );
}
