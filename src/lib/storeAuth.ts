"use server";

import { cookies } from "next/headers";
import { getAppUserOrNull } from "@/lib/auth";

// 매장 공개 페이지(/fnb·/dining·/sinmi·/daeun)의 쓰기 액션 보호.
// 이 페이지들은 로그인 없이 열리지만, 서버 액션이 service_role로 실데이터를 쓰므로
// 아무나(익명) 생성·삭제·업로드하지 못하도록 최소 인증을 요구한다.
//   허용 경로 ① 플랫폼에 로그인한 owner/staff
//            ② 매장 접근코드(STORE_ACCESS_CODE) 쿠키가 일치
const COOKIE = "store_ac";

export async function assertStoreAccess(): Promise<void> {
  // ① 로그인 세션(owner/staff)
  const user = await getAppUserOrNull().catch(() => null);
  if (user && (user.role === "owner" || user.role === "staff")) return;

  // ② 매장 접근코드 쿠키
  const code = process.env.STORE_ACCESS_CODE;
  if (code) {
    const val = cookies().get(COOKIE)?.value;
    if (val && val === code) return;
  }

  throw new Error("접근 권한이 없습니다. 플랫폼에 로그인하거나 매장 접근코드를 입력하세요.");
}

export async function hasStoreAccess(): Promise<boolean> {
  try {
    await assertStoreAccess();
    return true;
  } catch {
    return false;
  }
}

// 매장 접근코드 입력 → 쿠키 설정(30일). STORE_ACCESS_CODE가 설정돼 있어야 사용 가능.
export async function unlockStore(code: string): Promise<{ ok: boolean; error?: string }> {
  const expected = process.env.STORE_ACCESS_CODE;
  if (!expected) {
    return { ok: false, error: "매장 접근코드가 설정되지 않았습니다. 관리자(대표)에게 문의하세요." };
  }
  if (String(code ?? "").trim() !== expected) {
    return { ok: false, error: "접근코드가 올바르지 않습니다." };
  }
  cookies().set(COOKIE, expected, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    secure: process.env.NODE_ENV === "production",
  });
  return { ok: true };
}
