// 계정별 개인 환경설정 타입/기본값(서버·클라이언트 공용, 순수).

export type UserPrefs = {
  checklistRole?: string;        // '' = 전체, 그 외 역할 코드
  checklistCollapsed?: boolean;  // 오늘의 체크리스트 접힘
  pinnedFolders?: string[];      // 즐겨찾기 폴더 href
  hiddenFolders?: string[];      // 홈에서 숨긴 폴더 href
};

export const DEFAULT_PREFS: UserPrefs = {};

// 안전 병합(알 수 없는 키 무시, 배열 정규화).
export function normalizePrefs(raw: unknown): UserPrefs {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const arr = (v: unknown): string[] | undefined =>
    Array.isArray(v) ? Array.from(new Set(v.filter((x) => typeof x === "string"))) as string[] : undefined;
  const out: UserPrefs = {};
  if (typeof p.checklistRole === "string") out.checklistRole = p.checklistRole;
  if (typeof p.checklistCollapsed === "boolean") out.checklistCollapsed = p.checklistCollapsed;
  const pinned = arr(p.pinnedFolders); if (pinned) out.pinnedFolders = pinned;
  const hidden = arr(p.hiddenFolders); if (hidden) out.hiddenFolders = hidden;
  return out;
}
