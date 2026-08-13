"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";

type Result = { ok: boolean; error?: string };

export async function updateBrand(formData: FormData): Promise<Result> {
  const user = await requireAppUser();
  if (user.role !== "owner" && user.role !== "staff") {
    return { ok: false, error: "권한이 없습니다." };
  }
  const supabase = createSupabaseServerClient();

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "브랜드 id 누락" };

  const patch = {
    category: String(formData.get("category") ?? "").trim() || null,
    flagship: String(formData.get("flagship") ?? "").trim() || null,
    channel: String(formData.get("channel") ?? "").trim() || null,
    regulation: String(formData.get("regulation") ?? "").trim() || null,
    tone: String(formData.get("tone") ?? "").trim() || null,
    vi_primary: String(formData.get("vi_primary") ?? "").trim() || null,
    vi_secondary: String(formData.get("vi_secondary") ?? "").trim() || null,
    vi_accent: String(formData.get("vi_accent") ?? "").trim() || null,
    vi_bg: String(formData.get("vi_bg") ?? "").trim() || null,
    vi_confirmed: formData.get("vi_confirmed") === "확정" ? "확정" : "제안",
    ai_enabled: formData.get("ai_enabled") === "on",
    note: String(formData.get("note") ?? "").trim() || null,
  };

  const { error } = await supabase.from("brands").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/brands");
  revalidatePath("/ai");
  return { ok: true };
}
