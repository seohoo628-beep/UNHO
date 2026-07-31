import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ExecutionCard, { ExecItem } from "@/components/ExecutionCard";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  title: string;
  category: string | null;
  status: string;
  ai_agent_type: string | null;
  exec_channel: string | null;
  exec_link: string | null;
  exec_note: string | null;
  brands: { name: string } | null;
  ai_output: { body: string | null; agent_type: string | null } | null;
};

function toItem(r: Row): ExecItem {
  return {
    id: r.id,
    title: r.title,
    brandName: r.brands?.name ?? "-",
    category: r.category,
    status: r.status,
    agentType: r.ai_agent_type ?? r.ai_output?.agent_type ?? null,
    body: r.ai_output?.body ?? null,
    execChannel: r.exec_channel,
    execLink: r.exec_link,
    execNote: r.exec_note,
  };
}

export default async function ExecutePage() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");
  const supabase = createSupabaseServerClient();

  const sel =
    "id, title, category, status, ai_agent_type, exec_channel, exec_link, exec_note, brands(name), ai_output:ai_output_id(body, agent_type)";

  const [{ data: active }, { data: done }] = await Promise.all([
    supabase
      .from("tasks")
      .select(sel)
      .not("ai_output_id", "is", null)
      .in("status", ["예정", "진행", "보류"])
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("tasks")
      .select(sel)
      .not("ai_output_id", "is", null)
      .eq("status", "완료")
      .order("completed_date", { ascending: false })
      .limit(20),
  ]);

  const activeItems = ((active ?? []) as unknown as Row[]).map(toItem);
  const doneItems = ((done ?? []) as unknown as Row[]).map(toItem);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>집행 센터</h1>
          <p>대표가 승인한 산출물을 여기서 실제 집행한다. 원문을 복사해 채널에 올린 뒤 결과 링크를 남기면 완료된다.</p>
        </div>
      </div>

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
