import { redirect } from "next/navigation";
import Link from "next/link";
import { requireAppUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { GenerateTodayButton, ConfirmPlanButton } from "@/components/ThaiContentControls";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Plan = { id: string; title: string; status: string; due_date: string | null; note: string | null; agent_status: string | null; agent_error: string | null };

const SERIES = [
  { name: "① 태국 음식점 투어", desc: "서울의 태국 식당, 방콕 현지 식당·시장·노점, 첫 반응" },
  { name: "② 태국어 공부", desc: "하루 한 표현, 발음 실수담, 태국 친구 검사" },
  { name: "③ 합방·문화 비교", desc: "태국 배우·크리에이터 합방(섭외 전 기획), 한·태 문화 비교, 편의점 리뷰" },
];

const bodyOf = (note: string) => note.replace(/^\[AI 정기업무 결과[^\n]*\n[^\n]*\n\n/, "").split("\n\n[업무 지시]")[0];

// 태국 타깃 숏폼(틱톡·숏츠·릴스) 채널 폴더. AI 태국 콘텐츠 PD가 매일 시리즈별 기획안·촬영 구도를 올린다.
export default async function ThaiContentPage() {
  const user = await requireAppUser();
  if (user.role !== "owner" && user.role !== "staff") redirect("/hub");
  const supabase = createSupabaseServerClient();
  const { data: routines, error } = await supabase
    .from("agent_routines")
    .select("id, title")
    .eq("agent_key", "thai-content-pd")
    .eq("active", true)
    .order("title");
  const ready = !error && (routines ?? []).length > 0;
  const ids = ((routines ?? []) as { id: string }[]).map((r) => r.id);

  let plans: Plan[] = [];
  if (ready) {
    const since = new Date(Date.now() - 45 * 86400000).toISOString();
    const { data } = await supabase
      .from("todos")
      .select("id, title, status, due_date, note, agent_status, agent_error")
      .in("routine_id", ids)
      .gte("created_at", since)
      .order("due_date", { ascending: false })
      .order("title")
      .limit(150);
    plans = (data ?? []) as Plan[];
  }
  const byDate = new Map<string, Plan[]>();
  for (const p of plans) {
    const d = p.due_date ?? "-";
    (byDate.get(d) ?? byDate.set(d, []).get(d)!).push(p);
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>태국 숏폼 채널</h1>
          <p>틱톡·유튜브 숏츠·인스타 릴스. AI 태국 콘텐츠 PD가 매일 아침 시리즈별 기획안 3건과 촬영 구도(컷리스트)를 올립니다.</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
          {ready && <GenerateTodayButton routineIds={ids} />}
          <Link className="btn" href="/agent-routines">지시문 수정</Link>
        </div>
      </div>

      {!ready && (
        <div className="card" style={{ borderLeft: "4px solid var(--warn)", marginBottom: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>DB 준비 필요</div>
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
            Supabase SQL Editor에서 <span className="mono">supabase/migrations/0103_thai_content.sql</span>을 실행하면 AI 태국 콘텐츠 PD와 매일 기획 업무 3개가 등록됩니다.
          </p>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginBottom: 16 }}>
        {SERIES.map((s) => (
          <div key={s.name} className="card" style={{ margin: 0, padding: "12px 14px" }}>
            <div style={{ fontWeight: 700 }}>{s.name}</div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{s.desc}</div>
          </div>
        ))}
      </div>

      {ready && plans.length === 0 && <div className="card"><div className="empty">아직 기획안이 없습니다. &lsquo;오늘 기획안 지금 만들기&rsquo;를 누르거나 내일 아침 자동 작성을 기다리세요.</div></div>}

      {[...byDate.entries()].map(([date, list], di) => (
        <details key={date} open={di === 0} className="card" style={{ marginBottom: 12 }}>
          <summary style={{ cursor: "pointer", fontWeight: 800, fontSize: 15 }}>{date} · 기획 {list.length}건</summary>
          {list.map((p) => (
            <div key={p.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 10, marginTop: 10 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                <b>{p.title.replace("태국 숏폼 기획 ", "")}</b>
                {p.status === "완료" ? <span className="badge ok">촬영 확정</span>
                  : p.note?.startsWith("[AI 정기업무 결과") ? <ConfirmPlanButton todoId={p.id} />
                  : <span className="badge">{p.agent_status === "실패" ? `작성 실패 · ${p.agent_error ?? ""}` : "작성 대기"}</span>}
              </div>
              {p.note?.startsWith("[AI 정기업무 결과") && (
                <div style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.6, background: "var(--bg)", borderRadius: 8, padding: 12 }}>{bodyOf(p.note)}</div>
              )}
            </div>
          ))}
        </details>
      ))}
    </div>
  );
}
