import { cookies } from "next/headers";

// 잠금 폴더(제품개발·각종자료) 공용 비밀번호 게이트.
// 검증은 서버에서만 하고, 통과 시 httpOnly 쿠키를 심는다(주소 직접 접근도 차단).
export const FOLDER_LOCK_PASSWORD = "00700";
export const FOLDER_LOCK_COOKIE = "folder_lock_ok";
export const FOLDER_LOCK_TOKEN = "ok-v1-00700";
export const FOLDER_LOCK_DAYS = 7; // 기기당 7일 유지

export function isFolderUnlocked(): boolean {
  try {
    return cookies().get(FOLDER_LOCK_COOKIE)?.value === FOLDER_LOCK_TOKEN;
  } catch {
    return false;
  }
}
