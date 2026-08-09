"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";
import { isCeoUser } from "@/lib/ceo";

type Result = { ok: boolean; error?: string; tableMissing?: boolean };

function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42P01" || /ceo_mandalart/.test(err.message ?? "");
}

// 81칸 문자열 배열 정규화.
function normCells(input: unknown): string[] {
  const arr = Array.isArray(input) ? input : [];
  const out: string[] = [];
  for (let i = 0; i < 81; i++) {
    const v = arr[i];
    out.push(typeof v === "string" ? v.slice(0, 200) : "");
  }
  return out;
}

export async function loadMandalart(): Promise<{ cells: string[]; dbReady: boolean }> {
  const user = await requireAppUser();
  if (!isCeoUser(user)) return { cells: normCells([]), dbReady: true };
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("ceo_mandalart").select("cells").eq("id", "main").maybeSingle();
  if (error && isMissingTable(error)) return { cells: normCells([]), dbReady: false };
  return { cells: normCells((data as { cells?: unknown } | null)?.cells), dbReady: true };
}

export async function saveMandalart(cells: string[]): Promise<Result> {
  const user = await requireAppUser();
  if (!isCeoUser(user)) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("ceo_mandalart")
    .upsert({ id: "main", cells: normCells(cells), updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: error.message, tableMissing: isMissingTable(error) };
  return { ok: true };
}
