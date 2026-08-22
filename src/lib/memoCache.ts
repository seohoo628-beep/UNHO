// 서버 인스턴스 내 간단 TTL 캐시. 외부 API(구글시트 등)처럼
// "몇 분쯤 묵어도 되는" 값을 매 요청마다 다시 부르지 않게 한다.
// (서버리스 특성상 인스턴스별 캐시 — 완벽한 공유는 아니지만 워밍된 인스턴스에선 즉효)
const store = new Map<string, { at: number; value: unknown }>();

export async function memoCache<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  const now = Date.now();
  if (hit && now - hit.at < ttlMs) return hit.value as T;
  const value = await fn();
  store.set(key, { at: now, value });
  return value;
}

export function memoCacheInvalidate(key: string) {
  store.delete(key);
}
