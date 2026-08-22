"use server";

import { cookies } from "next/headers";
import { requireAppUser } from "@/lib/auth";
import { FOLDER_LOCK_PASSWORD, FOLDER_LOCK_COOKIE, FOLDER_LOCK_TOKEN, FOLDER_LOCK_DAYS } from "@/lib/folderLock";

export async function unlockFolder(password: string): Promise<{ ok: boolean; error?: string }> {
  await requireAppUser(); // 로그인 사용자만
  if (String(password ?? "").trim() !== FOLDER_LOCK_PASSWORD) {
    return { ok: false, error: "비밀번호가 올바르지 않습니다." };
  }
  cookies().set(FOLDER_LOCK_COOKIE, FOLDER_LOCK_TOKEN, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: FOLDER_LOCK_DAYS * 86400,
    path: "/",
  });
  return { ok: true };
}
