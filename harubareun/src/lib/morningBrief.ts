import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { escapeHtml, sendEmail } from "@/lib/email";
import { gmailConfigured, listMessages } from "@/lib/gmail";
import { personalGmailConfigured, listNeedReply } from "@/lib/gmailPersonal";
import { getTodayCalendarEvents } from "@/lib/calendar";
import { fetchEcommerceNews } from "@/lib/news";
import { seoulToday } from "@/lib/time";

// CEO 아침 브리핑 생성. 플랫폼 데이터(일정·투두·알림·생일) + Gmail 미확인 메일 +
// 이커머스 뉴스 소스 링크로 하루치 브리핑 HTML을 만든다.
// (구글 캘린더 개인일정·실시간 뉴스 기사는 별도 연동 필요 → 일정은 플랫폼 등록 기준)

type Item = { title: string; sub?: string; link?: string };

function addDays(ymd: string, n: number): string {
  // UTC 기준으로 날짜만 더한다(+09:00로 파싱하면 UTC상 전날이 되어 오프바이원 발생).
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
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
  suggestions: string[];
  schedule: Item[];
  birthdays: Item[];
  ceoTodos: Item[];
  dueSoon: Item[];
  emails: Item[];
  notifications: Item[];
  ecommerceNote: string;
  news: Item[];
  tomorrow: Item[];
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
  // 일정에는 구글 캘린더 이벤트만 넣는다(플랫폼 미팅·투두는 아래 별도 섹션에서 다룸).

  // 오늘 생일(인맥) — 인적자산 폴더 미사용 플랫폼에서는 비활성.
  const birthdays: Item[] = [];

  // CEO 투두 — 미사용 플랫폼에서는 비활성.
  const ceoTodos: Item[] = [];

  // 마감 임박(오늘~2일)
  const dueSoon: Item[] = [];
  await safe(async () => {
    const { data } = await svc.from("todos").select("title, due_date").in("status", ["예정", "진행"]).not("due_date", "is", null).lte("due_date", soon).order("due_date", { ascending: true }).limit(15);
    for (const t of (data ?? []) as { title: string; due_date: string | null }[]) {
      const overdue = (t.due_date ?? "") < today;
      const label = (t.due_date ?? "") === today ? "오늘 마감" : overdue ? `지연 · ${t.due_date}` : `마감 ${t.due_date}`;
      dueSoon.push({ title: t.title, sub: label, link: "/todos" });
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

  // 회신 필요 메일. 기본은 '기본(Primary) 안 읽은 메일'(회신 필요 성격),
  // 지메일에 '회신필요' 라벨을 쓰면 BRIEF_EMAIL_QUERY=label:회신필요 로 지정 가능.
  const emails: Item[] = [];
  const emailQuery = process.env.BRIEF_EMAIL_QUERY || "is:unread in:inbox category:primary";
  if (personalGmailConfigured()) {
    // 개인 지메일(OAuth) 우선 — seohoo628 등 개인 계정의 회신 필요 메일.
    await safe(async () => {
      const msgs = await listNeedReply(emailQuery, 6);
      for (const m of msgs) emails.push({ title: m.subject, sub: m.from, link: `https://mail.google.com/mail/u/0/#all/${m.id}` });
    }, undefined);
  } else if (gmailConfigured()) {
    await safe(async () => {
      const r = await listMessages({ q: emailQuery, max: 6 });
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
  // 오늘의 3줄 제안 기본값(AI 실패 시 데이터로 대체)
  let suggestions: string[] = [
    dueSoon.length ? `마감 임박 업무 ${dueSoon.length}건부터 처리하세요.` : "가장 중요한 한 건을 먼저 끝내세요.",
    emails.length ? `안 읽은 메일 ${emails.length}건을 확인하세요.` : "받은편지함을 비우고 하루를 시작하세요.",
    schedule.length ? `오늘 일정 ${schedule.length}건 사이 이동·준비 시간을 확보하세요.` : "일정이 없는 만큼 밀린 일을 당겨오세요.",
  ];
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
{"headline":"오늘 하루를 한 문장으로 요약(25자 내외, 마침표로 끝)","morning":"오전 시간대 코멘트 1~2문장","afternoon":"오후 시간대 코멘트 1~2문장","evening":"저녁 이후 코멘트 1~2문장","suggestions":["오늘 실행할 구체 제안 1(한 문장)","제안 2","제안 3"],"ecommerce":"오늘 새길 이커머스/유통 관점 2문장(링크·수치 금지)"}`;
    const { msg } = await createMessageWithFallback(anthropic, { max_tokens: 600, messages: [{ role: "user", content: prompt }] });
    const raw = msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
    const j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    if (j.headline) headline = String(j.headline).trim();
    acts = {
      morning: String(j.morning ?? acts.morning).trim(),
      afternoon: String(j.afternoon ?? acts.afternoon).trim(),
      evening: String(j.evening ?? acts.evening).trim(),
    };
    if (Array.isArray(j.suggestions) && j.suggestions.length) {
      suggestions = j.suggestions.slice(0, 3).map((s: unknown) => String(s).trim()).filter(Boolean);
    }
    ecommerceNote = String(j.ecommerce ?? "").trim();
  }, undefined);

  // 내일 일정 미리보기(구글 캘린더 이벤트만)
  const tomorrow: Item[] = [];
  await safe(async () => {
    const tmr = addDays(today, 1);
    const evs = await getTodayCalendarEvents(tmr, true); // 내일 시작 일정만
    for (const e of evs) tomorrow.push({ title: `🗓 ${e.title}`, sub: e.time });
  }, undefined);

  // 이커머스 뉴스 자동 수집(구글뉴스 RSS). 실패·빈 결과면 고정 소스 링크로 대체.
  let news: Item[] = [];
  await safe(async () => {
    const fetched = await fetchEcommerceNews(5);
    news = fetched.map((n) => ({ title: n.title, link: n.link, sub: n.source }));
  }, undefined);
  if (news.length === 0) news = NEWS_SOURCES;

  return { dateLabel, today, headline, acts, suggestions, schedule, birthdays, ceoTodos, dueSoon, emails, notifications, ecommerceNote, news, tomorrow };
}

// 카드 안 리스트(번호 + 굵은 제목 + 설명).
function listRows(items: Item[]): string {
  return items.map((it, i) => {
    const link = it.link && it.link.startsWith("http") ? it.link : it.link ? `https://unho.vercel.app${it.link}` : "";
    const t = link ? `<a href="${escapeHtml(link)}">${escapeHtml(it.title)}</a>` : escapeHtml(it.title);
    const sub = it.sub ? `<p>${escapeHtml(it.sub)}</p>` : "";
    return `<li><span class="num">${i + 1}</span><div class="item"><b>${t}</b>${sub}</div></li>`;
  }).join("");
}

// 섹션 카드(아이콘·제목·강조색 + 내용). 비어 있으면 안내문.
function card(icon: string, title: string, accent: string, items: Item[], emptyMsg: string): string {
  const inner = items.length
    ? `<ol class="mb-list">${listRows(items)}</ol>`
    : `<p class="mb-empty">${escapeHtml(emptyMsg)}</p>`;
  return `<div class="mb-card"><div class="mb-ch"><span class="mb-ic" style="background:${accent}1a;color:${accent}">${icon}</span><span class="mb-ct">${escapeHtml(title)}</span><span class="mb-cn">${items.length || ""}</span></div>${inner}</div>`;
}

export function renderBriefHtml(d: BriefData): string {
  const needNow: Item[] = [...d.ceoTodos, ...d.dueSoon, ...d.birthdays];
  const stats = [
    { n: d.schedule.length, label: "오늘 일정", c: "#2563eb" },
    { n: d.dueSoon.length, label: "마감 임박", c: "#dc2626" },
    { n: d.emails.length, label: "회신 필요", c: "#0d9488" },
    { n: d.birthdays.length, label: "오늘 생일", c: "#db2777" },
  ].map((s) => `<div class="mb-stat" style="border-top:3px solid ${s.c}"><div class="mb-sn" style="color:${s.c}">${s.n}</div><div class="mb-sl">${s.label}</div></div>`).join("");
  const suggestBlock = d.suggestions.length
    ? `<div class="mb-suggest"><div class="mb-sh">✨ 오늘의 3줄 제안</div><ol>${d.suggestions.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol></div>`
    : "";
  const noteBlock = d.ecommerceNote
    ? `<div class="mb-card"><div class="mb-ch"><span class="mb-ic" style="background:#7c3aed1a;color:#7c3aed">💡</span><span class="mb-ct">오늘의 이커머스 관점</span></div><p class="mb-note">${escapeHtml(d.ecommerceNote)}</p></div>`
    : "";

  return `<div class="mb"><style>
  .mb{ color:#1f2430; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Apple SD Gothic Neo","Malgun Gothic",sans-serif; word-break:keep-all; }
  .mb a{ color:inherit; }
  .mb .mb-date{ font-size:12.5px; letter-spacing:.05em; color:#8a8f9a; }
  .mb .mb-title{ font-size:23px; font-weight:800; margin:2px 0 16px; letter-spacing:-.02em; }
  .mb .mb-stats{ display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin:0 0 18px; }
  .mb .mb-stat{ background:#fff; border:1px solid #ececf0; border-radius:14px; padding:14px 12px; text-align:center; box-shadow:0 1px 2px rgba(20,20,40,.03); }
  .mb .mb-sn{ font-size:26px; font-weight:800; line-height:1.05; }
  .mb .mb-sl{ font-size:12px; color:#6b7280; margin-top:3px; }
  .mb .mb-suggest{ background:linear-gradient(135deg,#eef2ff,#e0e7ff); border:1px solid #c7d2fe; border-radius:16px; padding:16px 18px; margin:0 0 18px; }
  .mb .mb-sh{ font-size:12.5px; font-weight:800; letter-spacing:.04em; color:#4338ca; margin-bottom:8px; }
  .mb .mb-suggest ol{ margin:0; padding-left:20px; }
  .mb .mb-suggest li{ font-size:14.5px; line-height:1.8; color:#1e2233; font-weight:600; }
  .mb .mb-card{ background:#fff; border:1px solid #ececf0; border-radius:16px; padding:16px 18px; margin:0 0 12px; box-shadow:0 1px 2px rgba(20,20,40,.03); }
  .mb .mb-ch{ display:flex; align-items:center; gap:9px; margin-bottom:8px; }
  .mb .mb-ic{ width:26px; height:26px; border-radius:8px; display:inline-flex; align-items:center; justify-content:center; font-size:14px; }
  .mb .mb-ct{ font-size:14.5px; font-weight:800; }
  .mb .mb-cn{ margin-left:auto; font-size:12px; color:#9ca3af; font-weight:700; }
  .mb .mb-list{ list-style:none; margin:0; padding:0; }
  .mb .mb-list li{ display:flex; gap:12px; padding:9px 0; border-bottom:1px solid #f1f1f4; }
  .mb .mb-list li:last-child{ border-bottom:none; padding-bottom:0; }
  .mb .mb-list li:first-child{ padding-top:2px; }
  .mb .num{ color:#c3c5cc; font-size:12.5px; line-height:1.7; min-width:14px; font-weight:700; }
  .mb .item b{ font-size:14.5px; font-weight:700; display:block; margin-bottom:2px; }
  .mb .item b a{ text-decoration:none; }
  .mb .item p{ font-size:12.5px; line-height:1.6; color:#6b7280; margin:0; }
  .mb .mb-empty{ font-size:13px; color:#9ca3af; margin:2px 0 0; }
  .mb .mb-note{ font-size:14px; line-height:1.7; color:#374151; margin:2px 0 0; }
  @media (max-width:640px){ .mb .mb-title{ font-size:20px; } .mb .mb-stats{ grid-template-columns:repeat(2,1fr); } .mb .mb-sn{ font-size:23px; } }
  </style>
    <div class="mb-date">${escapeHtml(d.dateLabel)}</div>
    <div class="mb-title">🌅 CEO 아침 브리핑</div>
    <div class="mb-stats">${stats}</div>
    ${suggestBlock}
    ${card("🗓", "오늘 일정", "#2563eb", d.schedule, "오늘 캘린더에 잡힌 일정이 없습니다.")}
    ${card("📌", "지금 필요한 것", "#dc2626", needNow, "지금 챙길 항목이 없습니다.")}
    ${card("📧", "회신 필요 메일", "#0d9488", d.emails, "회신 필요한 새 메일이 없습니다.")}
    ${card("✅", "정리된 것", "#16a34a", d.notifications, "새로 정리된 항목이 없습니다.")}
    ${card("🌤", "내일 일정 미리보기", "#f59e0b", d.tomorrow, "내일 잡힌 일정이 없습니다.")}
    ${noteBlock}
    ${card("📰", "업계 뉴스", "#0ea5e9", d.news, "수집된 뉴스가 없습니다.")}
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
