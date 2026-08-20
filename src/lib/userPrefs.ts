// 개인별 맞춤 설정(계정 단위). 서버·클라이언트 공용 순수 모듈("use client" 아님).
export type UserPrefs = {
  hiddenDailyKeys?: string[]; // 홈 일일 체크리스트에서 숨긴 고정 항목 key
  favFolders?: string[];      // 즐겨찾기 폴더 href
  hiddenFolders?: string[];   // 숨긴 폴더 href
  folderOrder?: string[];     // 폴더 표시 순서(href 배열)
};

export const EMPTY_PREFS: UserPrefs = {};

// DB row(jsonb)에서 안전하게 UserPrefs로 정규화.
export function normalizePrefs(raw: unknown): UserPrefs {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const arr = (v: unknown): string[] | undefined =>
    Array.isArray(v) ? v.filter((x) => typeof x === "string") : undefined;
  return {
    hiddenDailyKeys: arr(p.hiddenDailyKeys),
    favFolders: arr(p.favFolders),
    hiddenFolders: arr(p.hiddenFolders),
    folderOrder: arr(p.folderOrder),
  };
}
