// 트랜잭션 메일 발송(외부 라이브러리 없이 Resend HTTP API 사용).
// RESEND_API_KEY가 없으면 조용히 건너뛴다(메일 미설정 상태에서도 앱은 정상 동작).
//
// 필요한 환경변수(Vercel → Settings → Environment Variables):
//   RESEND_API_KEY   : Resend API 키(https://resend.com 무료 가입 후 발급)
//   NOTIFY_EMAIL     : (선택) 수신 이메일. 미설정 시 대표 기본 이메일로.
//   EMAIL_FROM       : (선택) 발신 표기. 미설정 시 Resend 기본 발신주소.

const DEFAULT_TO = "seohoo628@gmail.com";
// 도메인 인증 전에도 바로 쓸 수 있는 Resend 공용 발신주소.
const DEFAULT_FROM = "운호컴퍼니 알림 <onboarding@resend.dev>";

export type SendEmailResult = { ok: boolean; skipped?: boolean; error?: string };

export async function sendEmail(opts: {
  subject: string;
  html: string;
  text?: string;
  to?: string;
}): Promise<SendEmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, skipped: true }; // 미설정 → 무시

  const to = opts.to || process.env.NOTIFY_EMAIL || DEFAULT_TO;
  const from = process.env.EMAIL_FROM || DEFAULT_FROM;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: opts.subject,
        html: opts.html,
        text: opts.text || stripHtml(opts.html),
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `메일 발송 실패(${res.status}) ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "메일 발송 오류" };
  } finally {
    clearTimeout(timer);
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>(?=)/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
