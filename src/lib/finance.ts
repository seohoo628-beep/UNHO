import { isCeoUser } from "@/lib/ceo";

// 재무(미수금·미지급금) 열람 권한: CEO(최운호) + psm 계정만.
// psm 계정 이메일을 코드에 고정. 추가 계정이 필요하면 FINANCE_VIEWER_EMAILS(콤마 목록)로 지정.
const FINANCE_EMAILS = ["psm@unocompany.net", "psm@unhocompany.com"];
export function canViewFinance(
  u: { name?: string | null; email?: string | null; job_title?: string | null } | null | undefined
): boolean {
  if (!u) return false;
  if (isCeoUser(u)) return true;
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
