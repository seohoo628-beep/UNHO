"use client";

import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function SiteLogout() {
  const router = useRouter();
  async function logout() {
    await createSupabaseBrowserClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }
  return (
    <button type="button" className="mdt-site-link" onClick={logout}>
      로그아웃
    </button>
  );
}
