// 재무(공급가·이익) 열람 권한. 운호 플랫폼 src/lib/finance.ts 와 같은 규칙.
const FINANCE_EMAILS = ["psm@unocompany.net", "psm@unhocompany.com"];

function isCeoUser(u: { name?: string | null; email?: string | null }): boolean {
  const email = (u.email ?? "").toLowerCase();
  const envEmail = (process.env.CEO_EMAIL || process.env.NEXT_PUBLIC_CEO_EMAIL || "").toLowerCase();
  if (envEmail && email === envEmail) return true;
  return (u.name ?? "").includes("최운호");
}

export function canViewFinance(
  u: { name?: string | null; email?: string | null; can_finance?: boolean | null } | null | undefined
): boolean {
  if (!u) return false;
  if (isCeoUser(u)) return true;
  if (u.can_finance === true) return true;
  const email = (u.email ?? "").toLowerCase().trim();
  if (!email) return false;
  if (FINANCE_EMAILS.includes(email)) return true;
  const allow = (process.env.FINANCE_VIEWER_EMAILS || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  return allow.includes(email);
}
