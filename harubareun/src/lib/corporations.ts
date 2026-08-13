import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Corporation } from "@/lib/types";

// 법인·당사자 조회 헬퍼.
//
// 발주서·계약서의 "당사자"는 자사 법인(entity_type='own')만 될 수 있다.
// SBJ컴퍼니·엣지라인의원 같은 파트너(entity_type='partner')는 당사자 선택 대상에서
// 제외한다. 발주·계약 당사자 선택 UI는 반드시 listContractingParties() 를 쓴다.

export async function listCorporations(): Promise<Corporation[]> {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.from("corporations").select("*").order("name");
  return (data ?? []) as Corporation[];
}

/** 발주·계약 당사자로 선택 가능한 법인(자사 own 만). */
export async function listContractingParties(): Promise<Corporation[]> {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from("corporations")
    .select("*")
    .eq("entity_type", "own")
    .order("name");
  return (data ?? []) as Corporation[];
}
