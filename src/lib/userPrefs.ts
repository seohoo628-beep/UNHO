// 개인별 맞춤 설정(계정 단위). 서버·클라이언트 공용 순수 모듈("use client" 아님).
export type UserPrefs = {
  hiddenDailyKeys?: string[]; // 홈 일일 체크리스트에서 숨긴 고정 항목 key
  favFolders?: string[];      // 즐겨찾기 폴더 href
  hiddenFolders?: string[];   // 숨긴 폴더 href
  folderOrder?: string[];     // 폴더 표시 순서(href 배열)
  folderGroups?: Record<string, string>; // 폴더별 카테고리 이동(href → 그룹 제목)
};

export const EMPTY_PREFS: UserPrefs = {};

// DB row(jsonb)에서 안전하게 UserPrefs로 정규화.
export function normalizePrefs(raw: unknown): UserPrefs {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const arr = (v: unknown): string[] | undefined =>
    Array.isArray(v) ? v.filter((x) => typeof x === "string") : undefined;
  const rec = (v: unknown): Record<string, string> | undefined => {
    if (!v || typeof v !== "object") return undefined;
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) if (typeof val === "string") out[k] = val;
    return out;
  };
  return {
    hiddenDailyKeys: arr(p.hiddenDailyKeys),
    favFolders: arr(p.favFolders),
    hiddenFolders: arr(p.hiddenFolders),
    folderOrder: arr(p.folderOrder),
    folderGroups: rec(p.folderGroups),
  };
}
