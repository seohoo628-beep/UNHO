// 날짜는 Asia/Seoul 기준.
const dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });

/** 오늘(Seoul) YYYY-MM-DD */
export function seoulToday(): string {
  return dateFmt.format(new Date());
}
