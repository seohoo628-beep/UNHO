import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { escapeHtml, sendEmail } from "@/lib/email";
import { gmailConfigured, listMessages } from "@/lib/gmail";
import { getTodayCalendarEvents } from "@/lib/calendar";
import { fetchEcommerceNews } from "@/lib/news";
import { seoulToday } from "@/lib/time";

// CEO 아침 브리핑 생성. 플랫폼 데이터(일정·투두·알림·생일) + Gmail 미확인 메일 +
// 이커머스 뉴스 소스 링크로 하루치 브리핑 HTML을 만든다.
// (구글 캘린더 개인일정·실시간 뉴스 기사는 별도 연동 필요 → 일정은 플랫폼 등록 기준)

type Item = { title: string; sub?: string; link?: string };

function addDays(ymd: string, n: number): string {
  const d = new Date(ymd + "T00:00:00+09:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function birthdayMD(s: string): { m: number; d: number } | null {
  if (!s || s.includes("음력")) return null;
  const nums = (s.match(/\d+/g) ?? []).map((n) => parseInt(n, 10));
  let m: number | undefined, d: number | undefined;
  if (nums.length >= 3) { m = nums[nums.length - 2]; d = nums[nums.length - 1]; }
  else if (nums.length === 2) { m = nums[0]; d = nums[1]; }
  else return null;
  if (!m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { m, d };
}

// 고정 이커머스 뉴스 소스(실시간 기사 연동 전까지 바로가기 제공).
const NEWS_SOURCES: Item[] = [
  { title: "코스인코리아 (뷰티·화장품 업계)", link: "https://www.cosinkorea.com" },
  { title: "플래텀 (스타트업·커머스)", link: "https://platum.kr" },
  { title: "아웃스탠딩 (IT·비즈니스 트렌드)", link: "https://outstanding.kr" },
  { title: "바이라인네트워크 (이커머스·유통)", link: "https://byline.network" },
  { title: "더그루/헤럴드 유통 (식품·외식)", link: "https://biz.heraldcorp.com" },
];

export type BriefData = {
  dateLabel: string;
  today: string;
  schedule: Item[];
  birthdays: Item[];
  ceoTodos: Item[];
  dueSoon: Item[];
  emails: Item[];
  notifications: Item[];
  ecommerceNote: string;
  news: Item[];
};

export async function buildBriefData(): Promise<BriefData> {
  const svc = createSupabaseServiceClient();
  const today = seoulToday();
  const soon = addDays(today, 2);
  const dateLabel = new Date(today + "T00:00:00+09:00").toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", weekday: "long",
  });

  const ceoEmail = (process.env.CEO_EMAIL || process.env.CEO_TODO_EMAIL || "seohoo628@gmail.com").toLowerCase();

  // CEO users 행 id (알림 조회용)
  let ceoUserId: string | null = null;
  try {
    const { data } = await svc.from("users").select("id").eq("email", ceoEmail).maybeSingle();
    ceoUserId = (data as { id?: string } | null)?.id ?? null;
    if (!ceoUserId) {
      const { data: byFlag } = await svc.from("users").select("id").eq("is_ceo", true).limit(1).maybeSingle();
      ceoUserId = (byFlag as { id?: string } | null)?.id ?? null;
    }
  } catch { /* ignore */ }

  const safe = async <T>(fn: () => Promise<T>, fb: T): Promise<T> => { try { return await fn(); } catch { return fb; } };

  // 오늘 일정: 구글 캘린더(iCal) 오늘 일정 + 오늘 미팅 + 오늘 마감 투두
  const schedule: Item[] = [];
  await safe(async () => {
    const evs = await getTodayCalendarEvents(today);
    for (const e of evs) schedule.push({ title: `🗓 ${e.title}`, sub: `${e.time} · 구글 캘린더` });
  }, undefined);
  await safe(async () => {
    const { data } = await svc.from("meetings").select("title, meeting_date").eq("meeting_date", today).limit(20);
    for (const m of (data ?? []) as { title: string }[]) schedule.push({ title: `📝 ${m.title}`, sub: "오늘 미팅", link: "/meetings" });
  }, undefined);
  await safe(async () => {
    const { data } = await svc.from("todos").select("title, assignee_user_ids").in("status", ["예정", "진행"]).eq("due_date", today).limit(20);
    for (const t of (data ?? []) as { title: string }[]) schedule.push({ title: `📋 ${t.title}`, sub: "오늘 마감", link: "/todos" });
  }, undefined);

  // 오늘 생일(인맥)
  const birthdays: Item[] = [];
  await safe(async () => {
    const [ , tm, td] = today.split("-").map((n) => parseInt(n, 10));
    const { data } = await svc.from("contacts").select("name, birthday, category").limit(3000);
    for (const c of (data ?? []) as { name: string; birthday: string | null; category: string | null }[]) {
      const md = birthdayMD(c.birthday ?? "");
      if (md && md.m === tm && md.d === td) birthdays.push({ title: `🎂 ${c.name}`, sub: c.category ?? "오늘 생일", link: "/contacts" });
    }
  }, undefined);

  // CEO 투두(당장실행/리마인드/고정)
  const ceoTodos: Item[] = [];
  await safe(async () => {
    const { data } = await svc.from("ceo_todos").select("text, pri, pinned").eq("done", false).limit(300);
    const rows = (data ?? []) as { text: string; pri: string; pinned?: boolean }[];
    const picked = rows.filter((t) => t.pinned || t.pri === "당장실행" || t.pri === "리마인드");
    const rank = (t: { pinned?: boolean; pri: string }) => (t.pinned ? 0 : 1) * 10 + (t.pri === "당장실행" ? 0 : t.pri === "리마인드" ? 1 : 2);
    picked.sort((a, b) => rank(a) - rank(b));
    for (const t of picked.slice(0, 12)) ceoTodos.push({ title: t.text, sub: [t.pinned ? "📌 고정" : "", t.pri].filter(Boolean).join(" · "), link: "/ceo-todos" });
  }, undefined);

  // 마감 임박(오늘~2일)
  const dueSoon: Item[] = [];
  await safe(async () => {
    const { data } = await svc.from("todos").select("title, due_date").in("status", ["예정", "진행"]).not("due_date", "is", null).lte("due_date", soon).order("due_date", { ascending: true }).limit(15);
    for (const t of (data ?? []) as { title: string; due_date: string | null }[]) {
      if ((t.due_date ?? "") === today) continue; // 오늘 마감은 일정에 이미
      const overdue = (t.due_date ?? "") < today;
      dueSoon.push({ title: t.title, sub: overdue ? `지연 · ${t.due_date}` : `마감 ${t.due_date}`, link: "/todos" });
    }
  }, undefined);

  // 안 읽은 알림(CEO 본인)
  const notifications: Item[] = [];
  if (ceoUserId) {
    await safe(async () => {
      const { data } = await svc.from("notifications").select("title, body, link").eq("user_id", ceoUserId).is("read_at", null).order("created_at", { ascending: false }).limit(10);
      for (const n of (data ?? []) as { title: string; body: string | null; link: string | null }[]) notifications.push({ title: n.title, sub: n.body ?? undefined, link: n.link || "/" });
    }, undefined);
  }

  // 이메일함(Gmail 미확인)
  const emails: Item[] = [];
  if (gmailConfigured()) {
    await safe(async () => {
      const r = await listMessages({ q: "is:unread in:inbox", max: 6 });
      if (r.ok && r.messages) for (const m of r.messages as { subject?: string | null; from?: string | null }[]) emails.push({ title: m.subject || "(제목 없음)", sub: m.from ?? undefined, link: "/email" });
    }, undefined);
  }

  // 이커머스 관점 코멘트(AI, 링크·수치 지어내지 않음). 실패해도 무시.
  let ecommerceNote = "";
  await safe(async () => {
    const { getAnthropic, createMessageWithFallback } = await import("@/lib/anthropic");
    const anthropic = await getAnthropic();
    const prompt = `당신은 이커머스 SME(자사몰·공동구매·뷰티/식품/외식 브랜드 운영)의 대표를 돕는 참모입니다. 오늘 대표가 새길 만한 이커머스/유통 관점의 짧은 코멘트를 2~3문장으로 한국어로 써 주세요. 특정 기사·수치·링크는 지어내지 말고, 일반 원칙·체크포인트 위주로. 불릿 없이 문장으로.`;
    const { msg } = await createMessageWithFallback(anthropic, { max_tokens: 300, messages: [{ role: "user", content: prompt }] });
    ecommerceNote = msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join(" ").trim();
  }, undefined);

  // 이커머스 뉴스 자동 수집(구글뉴스 RSS). 실패·빈 결과면 고정 소스 링크로 대체.
  let news: Item[] = [];
  await safe(async () => {
    const fetched = await fetchEcommerceNews(5);
    news = fetched.map((n) => ({ title: n.title, link: n.link, sub: n.source }));
  }, undefined);
  if (news.length === 0) news = NEWS_SOURCES;

  return { dateLabel, today, schedule, birthdays, ceoTodos, dueSoon, emails, notifications, ecommerceNote, news };
}

function section(title: string, items: Item[]): string {
  if (items.length === 0) return "";
  const rows = items.map((it) => {
    const link = it.link && it.link.startsWith("http") ? it.link : it.link ? `https://unho.vercel.app${it.link}` : "";
    const t = link ? `<a href="${escapeHtml(link)}" style="color:#111827;text-decoration:none">${escapeHtml(it.title)}</a>` : escapeHtml(it.title);
    const sub = it.sub ? `<div style="font-size:12.5px;color:#6b7280;margin-top:2px">${escapeHtml(it.sub)}</div>` : "";
    return `<li style="padding:10px 0;border-bottom:1px solid #ececec"><div style="font-size:14.5px;font-weight:600">${t}</div>${sub}</li>`;
  }).join("");
  return `<h2 style="font-size:12px;font-weight:700;letter-spacing:.08em;color:#111827;margin:26px 0 8px;text-transform:uppercase">${escapeHtml(title)}</h2><ul style="list-style:none;margin:0;padding:0">${rows}</ul>`;
}

export function renderBriefHtml(d: BriefData): string {
  const count = d.schedule.length + d.birthdays.length + d.ceoTodos.length + d.dueSoon.length + d.emails.length + d.notifications.length;
  const note = d.ecommerceNote
    ? `<h2 style="font-size:12px;font-weight:700;letter-spacing:.08em;color:#111827;margin:26px 0 8px;text-transform:uppercase">오늘의 이커머스 관점</h2><p style="font-size:14px;line-height:1.7;color:#374151;margin:0 0 4px">${escapeHtml(d.ecommerceNote)}</p>`
    : "";
  const newsRows = d.news.map((n) => `<li style="padding:8px 0;border-bottom:1px solid #ececec"><a href="${escapeHtml(n.link ?? "#")}" style="color:#111827;text-decoration:none;font-size:14px">${escapeHtml(n.title)} ↗</a></li>`).join("");
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Apple SD Gothic Neo',sans-serif;max-width:680px;margin:0 auto;color:#2E2C27">
    <div style="font-size:13px;letter-spacing:.05em;color:#6b7280;margin-bottom:6px">${escapeHtml(d.dateLabel)}</div>
    <h1 style="font-size:24px;font-weight:800;margin:0 0 4px">🌅 CEO 아침 브리핑</h1>
    <div style="font-size:13px;color:#9ca3af;margin-bottom:8px">오늘 챙길 항목 ${count}건</div>
    ${section("오늘 일정", d.schedule)}
    ${section("🎂 오늘 생일", d.birthdays)}
    ${section("🔒 CEO 투두 (당장실행·리마인드·고정)", d.ceoTodos)}
    ${section("⏰ 마감 임박", d.dueSoon)}
    ${section("📧 이메일함 (안 읽음)", d.emails)}
    ${section("🔔 새 알림", d.notifications)}
    ${note}
    <h2 style="font-size:12px;font-weight:700;letter-spacing:.08em;color:#111827;margin:26px 0 8px;text-transform:uppercase">업계 뉴스 바로가기</h2>
    <ul style="list-style:none;margin:0;padding:0">${newsRows}</ul>
    <p style="margin:26px 0 0;font-size:12px;color:#9ca3af">운호컴퍼니 운영 플랫폼 · CEO 아침 브리핑 자동 생성</p>
  </div>`;
}

// 오늘 브리핑 생성 + 저장(멱등: 같은 날짜면 갱신). 저장된 HTML 반환.
export async function generateTodayBrief(): Promise<{ ok: boolean; date: string; html: string; error?: string; tableMissing?: boolean }> {
  const svc = createSupabaseServiceClient();
  const d = await buildBriefData();
  const html = renderBriefHtml(d);
  const { error } = await svc.from("morning_briefs").upsert({ brief_date: d.today, html }, { onConflict: "brief_date" });
  const tableMissing = !!error && (error.code === "42P01" || /morning_briefs/.test(error.message ?? ""));
  return { ok: !error, date: d.today, html, error: error?.message, tableMissing };
}

// 크론: 생성·저장 후 CEO에게 이메일 발송.
export async function sendMorningBrief(): Promise<{ ok: boolean; sent: boolean; error?: string }> {
  const gen = await generateTodayBrief();
  const to = process.env.CEO_EMAIL || process.env.CEO_TODO_EMAIL || "seohoo628@gmail.com";
  const dateLabel = new Date(gen.date + "T00:00:00+09:00").toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" });
  const r = await sendEmail({ to, subject: `🌅 CEO 아침 브리핑 · ${dateLabel}`, html: gen.html });
  if (r.skipped) return { ok: false, sent: false, error: "RESEND_API_KEY 미설정" };
  if (!r.ok) return { ok: false, sent: false, error: r.error };
  return { ok: true, sent: true };
}
