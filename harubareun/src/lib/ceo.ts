// 대표(서현옥) 본인 계정 판별. 대표 전용 영역(브리핑·리마인드 등) 접근에 사용.
// 우선순위: 환경변수 CEO_EMAIL(또는 NEXT_PUBLIC_CEO_EMAIL) 일치 → 이름에 '서현옥' 포함.
export function isCeoUser(u: { name?: string | null; email?: string | null } | null | undefined): boolean {
  if (!u) return false;
  const email = (u.email ?? "").toLowerCase();
  const envEmail = (process.env.CEO_EMAIL || process.env.NEXT_PUBLIC_CEO_EMAIL || "").toLowerCase();
  if (envEmail && email === envEmail) return true;
  return (u.name ?? "").includes("서현옥");
}
