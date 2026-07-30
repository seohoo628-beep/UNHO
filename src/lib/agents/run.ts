import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { runComplianceCheck } from "@/lib/compliance";
import { generateMarketerOutput, type MarketerContext } from "@/lib/agents/marketer";
import type { Brand } from "@/lib/types";

// ============================================================================
// 승인 파이프라인의 앞단:
//   AI 생성 → 규제 검수(자동) → (통과 시) 승인 큐로
// 모든 쓰기는 service_role 로 한다. AI는 로그인 세션이 없으므로 승인·발송·금액확정에
// 구조적으로 접근할 수 없다.
// ============================================================================

export type MarketerRunResult = {
  brand: string;
  status: "queued" | "blocked" | "skipped" | "error";
  aiOutputId?: string;
  compliance?: "pass" | "fail";
  findings?: number;
  reason?: string;
};

async function getAiUserId(
  svc: ReturnType<typeof createSupabaseServiceClient>
): Promise<string | null> {
  const { data } = await svc
    .from("users")
    .select("id")
    .eq("role", "ai")
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export async function runMarketerForBrand(
  brandId: string,
  ctx: MarketerContext = {}
): Promise<MarketerRunResult> {
  const svc = createSupabaseServiceClient();

  const { data: brand, error: bErr } = await svc
    .from("brands")
    .select("*")
    .eq("id", brandId)
    .maybeSingle();

  if (bErr || !brand) {
    return { brand: brandId, status: "error", reason: "브랜드를 찾을 수 없습니다." };
  }
  const b = brand as Brand;

  // 자동 생성 제외 브랜드(엣지라인의원 등)는 실행 대상에서 뺀다.
  if (!b.ai_enabled) {
    return { brand: b.name, status: "skipped", reason: "AI 자동 생성 제외 브랜드" };
  }

  let gen;
  try {
    gen = await generateMarketerOutput(b, ctx);
  } catch (e) {
    return {
      brand: b.name,
      status: "error",
      reason: e instanceof Error ? e.message : "생성 실패",
    };
  }

  const aiUserId = await getAiUserId(svc);

  // 산출물이 보드에 뜨도록 업무 1건 생성(담당 = AI)
  const { data: task } = await svc
    .from("tasks")
    .insert({
      brand_id: b.id,
      title: `${b.name} 마케팅 콘텐츠 생성`,
      category: "콘텐츠 제작",
      assignee_kind: "ai",
      ai_agent_type: "marketer",
      status: "진행",
      created_by: aiUserId,
    })
    .select("id")
    .maybeSingle();

  // 산출물 저장 (검수 전)
  const { data: output, error: oErr } = await svc
    .from("ai_outputs")
    .insert({
      task_id: task?.id ?? null,
      brand_id: b.id,
      agent_type: "marketer",
      title: gen.title,
      input_prompt: gen.inputPrompt,
      body: gen.body,
      compliance_status: "pending",
      approval_status: "pending",
      model: gen.model,
    })
    .select("id")
    .maybeSingle();

  if (oErr || !output) {
    return { brand: b.name, status: "error", reason: oErr?.message ?? "저장 실패" };
  }

  // 규제 검수 (자동)
  const check = runComplianceCheck(b, gen.body);

  await svc.from("compliance_checks").insert({
    ai_output_id: output.id,
    brand_id: b.id,
    regulation: b.regulation,
    verdict: check.verdict,
    findings: check.findings,
    checker: "rule-based",
  });

  await svc
    .from("ai_outputs")
    .update({ compliance_status: check.verdict })
    .eq("id", output.id);

  if (check.verdict === "fail") {
    // 검수 미통과 → 승인 큐에 올리지 않는다. AI 화면에서 지적·대체 제안을 보고 재생성.
    return {
      brand: b.name,
      status: "blocked",
      aiOutputId: output.id,
      compliance: "fail",
      findings: check.findings.length,
    };
  }

  return {
    brand: b.name,
    status: "queued",
    aiOutputId: output.id,
    compliance: "pass",
  };
}

/** ai_enabled=true 인 브랜드 전체에 대해 마케터 에이전트를 실행한다(정기 실행용). */
export async function runMarketerForAllEnabled(): Promise<MarketerRunResult[]> {
  const svc = createSupabaseServiceClient();
  const { data: brands } = await svc
    .from("brands")
    .select("id, name, ai_enabled")
    .eq("ai_enabled", true)
    .order("name");

  const results: MarketerRunResult[] = [];
  for (const row of brands ?? []) {
    results.push(await runMarketerForBrand((row as { id: string }).id));
  }
  return results;
}
