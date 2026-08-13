import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { seoulToday } from "@/lib/time";
import CalendarClient, { type CalEvent } from "@/components/CalendarClient";

export const dynamic = "force-dynamic";

function monthRange(ym: string): { start: string; end: string } {
  const [y, m] = ym.split("-").map(Number);
  const start = `${ym}-01`;
  const end = new Date(y, m, 0);
  return { start, end: `${ym}-${String(end.getDate()).padStart(2, "0")}` };
}

export default async function CalendarPage({ searchParams }: { searchParams: { ym?: string } }) {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");
  const supabase = createSupabaseServerClient();

  const today = seoulToday();
  const ym = /^\d{4}-\d{2}$/.test(searchParams.ym ?? "") ? searchParams.ym! : today.slice(0, 7);
  const { start, end } = monthRange(ym);

  // 업무(마감일) — 완료/취소 제외
  const todosRes = await supabase
    .from("todos")
    .select("id, title, due_date, status")
    .gte("due_date", start)
    .lte("due_date", end)
    .not("status", "in", "(완료,취소)")
    .limit(500);

  // 미팅
  const meetingsRes = await supabase
    .from("meetings")
    .select("id, title, meeting_date, meeting_type")
    .gte("meeting_date", start)
    .lte("meeting_date", end)
    .limit(500);

  // 연차 — 승인된 것만(status 컬럼 없으면 전체)
  let leaveRows: { use_date: string; type: string; leave_members: { name: string } | null }[] = [];
  const leaveSel = "use_date, type, status, leave_members(name)";
  const lr = await supabase
    .from("leave_usages")
    .select(leaveSel)
    .gte("use_date", start)
    .lte("use_date", end)
    .limit(500);
  if (lr.error) {
    const lr2 = await supabase
      .from("leave_usages")
      .select("use_date, type, leave_members(name)")
      .gte("use_date", start)
      .lte("use_date", end)
      .limit(500);
    leaveRows = (lr2.data ?? []) as unknown as typeof leaveRows;
  } else {
    leaveRows = ((lr.data ?? []) as unknown as (typeof leaveRows[number] & { status?: string })[])
      .filter((r) => !r.status || r.status === "approved") as typeof leaveRows;
  }

  const events: CalEvent[] = [];
  for (const t of (todosRes.data ?? []) as { id: string; title: string; due_date: string | null }[]) {
    if (t.due_date) events.push({ date: t.due_date, kind: "todo", title: t.title, link: "/todos" });
  }
  for (const m of (meetingsRes.data ?? []) as { id: string; title: string; meeting_date: string | null; meeting_type: string }[]) {
    if (m.meeting_date)
      events.push({ date: m.meeting_date, kind: "meeting", title: m.title, link: "/meetings", sub: m.meeting_type });
  }
  for (const l of leaveRows) {
    if (l.use_date)
      events.push({
        date: l.use_date,
        kind: "leave",
        title: `${l.leave_members?.name ?? "직원"} ${l.type}`,
        link: "/leave",
      });
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>캘린더</h1>
          <p>업무 마감·미팅·연차를 한 화면에서. 월간 달력과 타임라인으로 일정을 관리한다.</p>
        </div>
      </div>
      <CalendarClient ym={ym} events={events} today={today} />
    </div>
  );
}
