"use server";

import { cookies } from "next/headers";
import { BRAND_SCOPE_COOKIE } from "@/lib/brandScope";

export async function setBrandScope(slug: string): Promise<{ ok: boolean }> {
  const v = /^[a-z0-9_-]{1,20}$/.test(slug) ? slug : "all";
  cookies().set(BRAND_SCOPE_COOKIE, v, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return { ok: true };
}
