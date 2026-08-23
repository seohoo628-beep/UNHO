// 지번 주소에서 동네(○○동/읍/면/가) 추출 — "서울 성동구 성수동2가 273-1" → "성수동2가".
// 도로명 주소처럼 동 정보가 없으면 빈 문자열.
export function regionFromAddress(addr: string): string {
  for (const t of (addr || "").split(/\s+/)) {
    if (/(시|도|구|군)$/.test(t)) continue;
    if (/^[가-힣]+\d*(동|읍|면|가)$/.test(t)) return t;
  }
  return "";
}
