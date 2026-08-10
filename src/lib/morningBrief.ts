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
  headline: string;
  acts: { morning: string; afternoon: string; evening: string };
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

  // 에디토리얼 내레이션(헤드라인 + 오전/오후/저녁 코멘트) + 이커머스 관점.
  // AI가 오늘 데이터로 작성. 실패하면 담백한 기본 문구로 대체.
  const schedLines = schedule.map((s) => `- ${s.title}${s.sub ? ` (${s.sub})` : ""}`).join("\n") || "(등록된 일정 없음)";
  let headline = schedule.length
    ? "오늘 처리할 일정과 확인할 항목을 정리했습니다."
    : "오늘은 잡힌 일정이 없습니다. 밀린 것을 당겨올 여유가 있는 하루입니다.";
  let acts = {
    morning: "오전에는 책상 앞에서 집중할 시간을 확보하기 좋습니다.",
    afternoon: `오후에는 ${dueSoon.length ? "마감이 가까운 업무" : "진행 중인 업무"}를 챙기세요.`,
    evening: "저녁에는 오늘 남은 항목을 마무리하고 내일을 준비합니다.",
  };
  let ecommerceNote = "";
  await safe(async () => {
    const { getAnthropic, createMessageWithFallback } = await import("@/lib/anthropic");
    const anthropic = await getAnthropic();
    const prompt = `당신은 이커머스 SME(자사몰·공동구매·뷰티/식품/외식 브랜드 운영) 대표의 참모입니다.
아래는 오늘(${dateLabel})의 일정·할 일 데이터입니다.

[오늘 일정]
${schedLines}
[대기 항목] CEO투두 ${ceoTodos.length}건 · 마감임박 ${dueSoon.length}건 · 안읽은메일 ${emails.length}건 · 오늘생일 ${birthdays.length}건

다음 JSON만 출력하세요(코드블록 없이). 담백하고 절제된 에디토리얼 톤, 데이터에 없는 시간·고유명사는 지어내지 말 것:
{"headline":"오늘 하루를 한 문장으로 요약(25자 내외, 마침표로 끝)","morning":"오전 시간대 코멘트 1~2문장","afternoon":"오후 시간대 코멘트 1~2문장","evening":"저녁 이후 코멘트 1~2문장","ecommerce":"오늘 새길 이커머스/유통 관점 2문장(링크·수치 금지)"}`;
    const { msg } = await createMessageWithFallback(anthropic, { max_tokens: 600, messages: [{ role: "user", content: prompt }] });
    const raw = msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
    const j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    if (j.headline) headline = String(j.headline).trim();
    acts = {
      morning: String(j.morning ?? acts.morning).trim(),
      afternoon: String(j.afternoon ?? acts.afternoon).trim(),
      evening: String(j.evening ?? acts.evening).trim(),
    };
    ecommerceNote = String(j.ecommerce ?? "").trim();
  }, undefined);

  // 이커머스 뉴스 자동 수집(구글뉴스 RSS). 실패·빈 결과면 고정 소스 링크로 대체.
  let news: Item[] = [];
  await safe(async () => {
    const fetched = await fetchEcommerceNews(5);
    news = fetched.map((n) => ({ title: n.title, link: n.link, sub: n.source }));
  }, undefined);
  if (news.length === 0) news = NEWS_SOURCES;

  return { dateLabel, today, headline, acts, schedule, birthdays, ceoTodos, dueSoon, emails, notifications, ecommerceNote, news };
}

// 에디토리얼 섹션(번호 매긴 리스트: 굵은 제목 + 설명).
function numberedSection(title: string, items: Item[]): string {
  if (items.length === 0) return "";
  const rows = items.map((it, i) => {
    const link = it.link && it.link.startsWith("http") ? it.link : it.link ? `https://unho.vercel.app${it.link}` : "";
    const t = link
      ? `<a href="${escapeHtml(link)}">${escapeHtml(it.title)}</a>`
      : escapeHtml(it.title);
    const sub = it.sub ? `<p>${escapeHtml(it.sub)}</p>` : "";
    return `<li><span class="num">${i + 1}</span><div class="item"><b>${t}</b>${sub}</div></li>`;
  }).join("");
  return `<h2 class="sec">${escapeHtml(title)}</h2><ol class="list">${rows}</ol>`;
}

const TERRAIN = `<svg class="terrain" viewBox="0 0 840 150" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <circle cx="95" cy="46" r="10" fill="none" stroke="#C6613F" stroke-width="2"/>
  <line x1="95" y1="26" x2="95" y2="31" stroke="#C6613F" stroke-width="2" stroke-linecap="round"/>
  <line x1="95" y1="61" x2="95" y2="66" stroke="#C6613F" stroke-width="2" stroke-linecap="round"/>
  <line x1="75" y1="46" x2="80" y2="46" stroke="#C6613F" stroke-width="2" stroke-linecap="round"/>
  <line x1="110" y1="46" x2="115" y2="46" stroke="#C6613F" stroke-width="2" stroke-linecap="round"/>
  <path d="M 762 34 a 9 9 0 1 0 7 14 a 7.4 7.4 0 0 1 -7 -14 z" fill="#2E2C27" opacity="0.85"/>
  <path d="M0,116 C90,116 150,112 210,104 C255,98 270,80 300,80 C330,80 345,100 380,100 C420,100 440,66 470,64 C505,62 540,104 600,114 C660,120 720,118 840,118" fill="none" stroke="#2E2C27" stroke-width="2.5" stroke-linecap="round"/>
  <circle cx="300" cy="80" r="7" fill="#2E2C27"/>
  <circle cx="380" cy="100" r="6" fill="#B4B3A8"/>
  <circle cx="470" cy="64" r="9" fill="#2E2C27"/>
</svg>`;

export function renderBriefHtml(d: BriefData): string {
  // "지금 필요한 것" = 오늘 액션 필요한 것(일정·CEO투두·마감임박·이메일·생일)
  const needNow: Item[] = [...d.schedule, ...d.ceoTodos, ...d.dueSoon, ...d.emails, ...d.birthdays];
  const newsRows = d.news.map((n, i) =>
    `<li><span class="num">${i + 1}</span><div class="item"><b><a href="${escapeHtml(n.link ?? "#")}">${escapeHtml(n.title)}</a></b>${n.sub ? `<p>${escapeHtml(n.sub)}</p>` : ""}</div></li>`
  ).join("");
  const noteBlock = d.ecommerceNote
    ? `<h2 class="sec">오늘의 이커머스 관점</h2><p style="font-size:14px;line-height:1.7;color:#4b4a44;margin:0 0 40px">${escapeHtml(d.ecommerceNote)}</p>`
    : "";

  return `<div class="mbrief"><style>
  .mbrief{ background:#FCFCFB; color:#2E2C27; font-family:-apple-system,"Segoe UI","Apple SD Gothic Neo","Malgun Gothic",sans-serif; word-break:keep-all; margin:-20px; }
  .mbrief a{ color:inherit; }
  .mbrief .band-top{ background:#F9F9F7; border-bottom:1px solid #E1E1DF; }
  .mbrief .inner{ max-width:820px; margin:0 auto; padding:40px 34px; }
  .mbrief .inner-b{ max-width:820px; margin:0 auto; padding:40px 34px 48px; }
  .mbrief .daydate{ font-size:12.5px; letter-spacing:.06em; color:#6B6A63; margin-bottom:12px; }
  .mbrief h1.headline{ font-family:"Noto Serif KR","Nanum Myeongjo",AppleMyungjo,Batang,serif; font-weight:600; font-size:32px; line-height:1.34; letter-spacing:-.01em; margin:0 0 4px; }
  .mbrief .terrain{ width:100%; height:auto; display:block; margin:14px 0 4px; }
  .mbrief .acts{ display:grid; grid-template-columns:1fr 1fr 1fr; }
  .mbrief .act{ padding:8px 18px 2px 0; }
  .mbrief .act + .act{ border-left:1px solid #E4E3DC; padding-left:18px; }
  .mbrief .act .range{ font-weight:700; font-size:13px; margin-bottom:6px; }
  .mbrief .act p{ font-size:13px; line-height:1.6; color:#6B6A63; margin:0; }
  .mbrief h2.sec{ font-size:12px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:#2E2C27; margin:0 0 16px; }
  .mbrief .list{ list-style:none; margin:0 0 40px; padding:0; }
  .mbrief .list li{ display:flex; gap:14px; padding:12px 0; border-bottom:1px solid #E4E3DC; }
  .mbrief .list li:last-child{ border-bottom:none; }
  .mbrief .num{ color:#B4B3A8; font-size:13px; line-height:1.7; min-width:15px; }
  .mbrief .item b{ font-size:15px; font-weight:700; display:block; margin-bottom:3px; }
  .mbrief .item b a{ text-decoration:none; }
  .mbrief .item p{ font-size:13px; line-height:1.65; color:#6B6A63; margin:0; }
  @media (max-width:640px){ .mbrief .inner,.mbrief .inner-b{ padding-left:20px; padding-right:20px; } .mbrief h1.headline{ font-size:25px; } .mbrief .acts{ grid-template-columns:1fr; } .mbrief .act + .act{ border-left:none; border-top:1px solid #E4E3DC; padding-left:0; padding-top:14px; margin-top:10px; } }
  </style>
  <div class="band-top"><div class="inner">
    <div class="daydate">${escapeHtml(d.dateLabel)}</div>
    <h1 class="headline">${escapeHtml(d.headline)}</h1>
    ${TERRAIN}
    <div class="acts">
      <div class="act"><div class="range">오전 – 정오</div><p>${escapeHtml(d.acts.morning)}</p></div>
      <div class="act"><div class="range">정오 – 오후 5시</div><p>${escapeHtml(d.acts.afternoon)}</p></div>
      <div class="act"><div class="range">오후 5시 이후</div><p>${escapeHtml(d.acts.evening)}</p></div>
    </div>
  </div></div>
  <div class="inner-b">
    ${numberedSection("지금 필요한 것", needNow)}
    ${numberedSection("정리된 것", d.notifications)}
    ${noteBlock}
    <h2 class="sec">업계 뉴스</h2>
    <ol class="list" style="margin-bottom:0">${newsRows}</ol>
  </div></div>`;
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
