import { isCeoUser } from "@/lib/ceo";

// 재무(미수금·미지급금) 열람 권한: CEO(최운호) + psm 계정만.
// psm 판별: 환경변수 FINANCE_VIEWER_EMAILS(콤마 목록) 우선,
// 아니면 이메일 아이디(@ 앞)가 psm 이거나 이메일/이름/직책에 psm 이 들어간 계정.
// (정확한 이메일을 FINANCE_VIEWER_EMAILS 로 지정하면 가장 안전.)
export function canViewFinance(
  u: { name?: string | null; email?: string | null; job_title?: string | null } | null | undefined
): boolean {
  if (!u) return false;
  if (isCeoUser(u)) return true;
  const email = (u.email ?? "").toLowerCase();
  const name = (u.name ?? "").toLowerCase();
  const job = (u.job_title ?? "").toLowerCase();
  const allow = (process.env.FINANCE_VIEWER_EMAILS || "")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (email && allow.includes(email)) return true;
  const localPart = email.split("@")[0];
  if (localPart === "psm") return true;
  if (email.includes("psm") || name.includes("psm") || job.includes("psm")) return true;
  return false;
}
