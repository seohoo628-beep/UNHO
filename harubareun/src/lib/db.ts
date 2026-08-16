// DB 관련 공용 헬퍼.

// Supabase 오류가 "테이블 없음(마이그레이션 미적용)"인지 판별.
// 42P01 = undefined_table. table 이름을 주면 메시지 매칭도 함께 본다.
export function tableMissing(
  err: { code?: string; message?: string } | null | undefined,
  table?: string
): boolean {
  if (!err) return false;
  if (err.code === "42P01") return true;
  const msg = err.message ?? "";
  if (/does not exist|relation .* does not exist|schema cache/i.test(msg)) return true;
  return table ? new RegExp(table).test(msg) : false;
}
