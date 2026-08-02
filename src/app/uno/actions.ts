"use server";

import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { UnoState } from "./types";

// /uno 는 공개(비로그인) 개인 도구. 상태 전체를 단일 행(jsonb)에 저장해
// 모든 기기가 같은 데이터를 공유한다. service_role 키는 서버에만 존재한다.
const KEY = "default";

export type LoadResult = { data: UnoState | null; dbReady: boolean; updatedAt?: string; exists: boolean };
export type SaveResult = { ok: boolean; dbReady: boolean; updatedAt?: string; error?: string };

export async function loadUnoState(): Promise<LoadResult> {
  try {
    const s = createSupabaseServiceClient();
    const { data, error } = await s
      .from("uno_state")
      .select("data,updated_at")
      .eq("id", KEY)
      .maybeSingle();
    if (error) return { data: null, dbReady: false, exists: false };
    if (!data) return { data: null, dbReady: true, exists: false };
    return { data: (data.data as UnoState) ?? null, dbReady: true, updatedAt: data.updated_at as string, exists: true };
  } catch {
    // 테이블 미생성 / 서비스 키 없음 → 서버 동기화 불가(오프라인 모드로 폴백)
    return { data: null, dbReady: false, exists: false };
  }
}

export async function saveUnoState(state: UnoState): Promise<SaveResult> {
  try {
    const s = createSupabaseServiceClient();
    const updatedAt = new Date().toISOString();
    const { error } = await s
      .from("uno_state")
      .upsert({ id: KEY, data: state, updated_at: updatedAt }, { onConflict: "id" });
    if (error) return { ok: false, dbReady: false, error: error.message };
    return { ok: true, dbReady: true, updatedAt };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "오류";
    return { ok: false, dbReady: false, error: msg };
  }
}
