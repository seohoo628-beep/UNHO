/**
 * 경쟁 제품 리뷰 스냅샷 (review_snapshots) · 검색어 기록 (shop_search_log).
 *
 * 판매건수는 어느 공개 API 에도 없어 리뷰 증분으로 추정한다. 스냅샷은 두 경로로
 * 쌓인다 — 화면 검색(market 라우트, 사용자 클라이언트)과 정기 재검색(cron,
 * service_role). 두 경로가 같은 규칙으로 쓰도록 여기에 모아 둔다.
 *
 * db 는 최소 계약만 요구한다(from → 체인). supabase-js 와 테스트 가짜가
 * 함께 만족하는 모양이라 이 파일의 규칙을 단위 테스트로 잠글 수 있다.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Db = { from(table: string): any };

export type SnapshotItem = { link: string; title: string; reviews: number; price: number };
export type PrevSnapshot = { d: string; r: number };

export const todayUtc = () => new Date().toISOString().slice(0, 10);

/** 링크별 가장 최근(오늘 이전) 스냅샷. 증분 계산의 기준선이다. */
export async function readPrevSnapshots(db: Db, links: string[], today = todayUtc()): Promise<Map<string, PrevSnapshot>> {
  const prev = new Map<string, PrevSnapshot>();
  const uniq = [...new Set(links.filter(Boolean))];
  if (!uniq.length) return prev;
  const { data, error } = await db
    .from("review_snapshots")
    .select("link, captured_on, reviews")
    .in("link", uniq)
    .lt("captured_on", today)
    .order("captured_on", { ascending: false });
  if (error) throw error;
  for (const row of (data ?? []) as { link: string; captured_on: string; reviews: number }[])
    if (!prev.has(row.link)) prev.set(row.link, { d: row.captured_on, r: row.reviews });
  return prev;
}

/** 오늘 값 upsert — 링크당 하루 한 줄. 같은 링크가 응답에 두 번 오면 한 번만 쓴다
 *  (한 배치에 중복 키가 있으면 upsert 자체가 실패한다). */
export async function storeSnapshots(db: Db, items: SnapshotItem[], today = todayUtc()): Promise<number> {
  const seen = new Set<string>();
  const rows = items
    .filter((it) => it.link && !seen.has(it.link) && seen.add(it.link))
    .map((it) => ({ link: it.link, captured_on: today, title: it.title, reviews: it.reviews, price: it.price }));
  if (!rows.length) return 0;
  const { error } = await db.from("review_snapshots").upsert(rows, { onConflict: "link,captured_on" });
  if (error) throw error;
  return rows.length;
}

/** 검색어 기록 — 정기 재검색이 무엇을 다시 돌릴지 여기서 안다. */
export async function logShopQuery(db: Db, query: string): Promise<void> {
  const q = query.trim();
  if (!q) return;
  const { error } = await db
    .from("shop_search_log")
    .upsert({ query: q, last_used: new Date().toISOString() }, { onConflict: "query" });
  if (error) throw error;
}

/** 최근에 실제로 쓰인 검색어. 오래 안 쓴 검색어는 재검색하지 않는다 —
 *  끝난 프로젝트의 스냅샷을 무한정 쌓을 이유가 없다. */
export async function recentShopQueries(db: Db, { days = 60, limit = 40 } = {}): Promise<string[]> {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data, error } = await db
    .from("shop_search_log")
    .select("query")
    .gte("last_used", since)
    .order("last_used", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as { query: string }[]).map((r) => r.query);
}
