import { isCeoUser } from "@/lib/ceo";

// 재무(미수금·미지급금) 열람 권한: CEO + users.can_finance=true 계정.
// 부여/회수는 SQL 한 줄: update public.users set can_finance = true where email = '...';
// (0086 마이그레이션 전 호환을 위해 기존 이메일 하드코딩·환경변수 폴백 유지)
const FINANCE_EMAILS = ["psm@unocompany.net", "psm@unhocompany.com"];
export function canViewFinance(
  u: { name?: string | null; email?: string | null; job_title?: string | null; can_finance?: boolean | null } | null | undefined
): boolean {
  if (!u) return false;
  if (isCeoUser(u)) return true;
  if (u.can_finance === true) return true; // DB 권한(우선)
  const email = (u.email ?? "").toLowerCase().trim();
  if (!email) return false;
  if (FINANCE_EMAILS.includes(email)) return true;
  const allow = (process.env.FINANCE_VIEWER_EMAILS || "")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allow.includes(email)) return true;
  return false;
}
