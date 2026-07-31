import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { runComplianceCheck } from "@/lib/compliance";
import { runComplianceLLM } from "@/lib/agents/compliance-llm";
import { generateMarketerOutput, type MarketerContext } from "@/lib/agents/marketer";
import { generateMdOutput, type MdContext } from "@/lib/agents/md";
import { generateDesignerOutput, type DesignerContext } from "@/lib/agents/designer";
import { fetchSellerSheet, summarizeSheet } from "@/lib/sheets";
import type { Brand } from "@/lib/types";

// ============================================================================
// 승인 파이프라인 앞단: AI 생성 → 규제 검수(자동) → (통과 시) 승인 큐로
// 모든 쓰기는 service_role. AI는 로그인 세션이 없어 승인·발송·금액확정 불가.
// ============================================================================

export type AgentType = "marketer" | "md" | "designer";

export type AgentRunResult = {
  brand: string;
  agent: AgentType;
  status: "queued" | "blocked" | "skipped" | "error";
  aiOutputId?: string;
  compliance?: "pass" | "fail";
  findings?: number;
  reason?: string;
};

const TASK_TITLE: Record<AgentType, string> = {
  marketer: "마케팅 콘텐츠 생성",
  md: "셀러 매칭·제안 생성",
  designer: "디자인 지시서 생성",
};

const CATEGORY: Record<AgentType, string> = {
  marketer: "콘텐츠 제작",
  md: "셀러 아웃리치",
  designer: "문서 작성",
};

type AgentCtx = MarketerContext & MdContext & DesignerContext;

async function generate(agent: AgentType, brand: Brand, ctx: AgentCtx) {
  if (agent === "md") return generateMdOutput(brand, ctx);
  if (agent === "designer") return generateDesignerOutput(brand, ctx);
  return generateMarketerOutput(brand, ctx);
}

// 콘텐츠 성과 피드백 루프: 브랜드의 최근 성과 상위 항목을 요약해 마케터 입력으로 준다.
async function topPerformanceSummary(
  svc: ReturnType<typeof createSupabaseServiceClient>,
  brandId: string
): Promise<string | null> {
  const { data } = await svc
    .from("performance")
    .select("channel, reach, conversions, revenue")
    .eq("brand_id", brandId)
    .order("revenue", { ascending: false, nullsFirst: false })
    .limit(3);
  if (!data || data.length === 0) return null;
  return data
    .map(
      (p) =>
        `${p.channel ?? "채널?"}: 도달 ${p.reach ?? "-"}, 전환 ${p.conversions ?? "-"}, 매출 ${p.revenue ?? "-"}`
    )
    .join(" / ");
}

async function getAiUserId(svc: ReturnType<typeof createSupabaseServiceClient>) {
  const { data } = await svc
    .from("users")
    .select("id")
    .eq("role", "ai")
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export async function runAgentForBrand(
  agent: AgentType,
  brandId: string,
  ctx: AgentCtx = {}
): Promise<AgentRunResult> {
  const svc = createSupabaseServiceClient();

  const { data: brand, error: bErr } = await svc
    .from("brands")
    .select("*")
    .eq("id", brandId)
    .maybeSingle();
  if (bErr || !brand) {
    return { brand: brandId, agent, status: "error", reason: "브랜드를 찾을 수 없습니다." };
  }
  const b = brand as Brand;

  if (!b.ai_enabled) {
    return { brand: b.name, agent, status: "skipped", reason: "AI 자동 생성 제외 브랜드" };
  }

  // 마케터는 최근 30일 성과 상위 콘텐츠를 입력에 반영(피드백 루프)
  if (agent === "marketer" && !ctx.topContent) {
    ctx = { ...ctx, topContent: await topPerformanceSummary(svc, b.id) };
  }

  // 디자이너는 브랜드의 실제 제품컷 목록을 배치 지시서 입력으로 받는다
  if (agent === "designer" && !ctx.productShots) {
    const { data: shots } = await svc
      .from("product_shots")
      .select("label, file_name")
      .eq("brand_id", b.id)
      .limit(50);
    if (shots && shots.length > 0) {
      ctx = {
        ...ctx,
        productShots: shots
          .map((s) => (s as { label: string | null; file_name: string | null }).label || (s as { file_name: string | null }).file_name)
          .filter(Boolean)
          .join(", "),
      };
    }
  }

  // MD는 셀러 관리 구글시트를 읽어 후보 검증 입력으로 준다(읽기 전용)
  if (agent === "md" && !ctx.sellerData) {
    try {
      const sheet = await fetchSellerSheet();
      if (sheet.ok && sheet.rows) {
        ctx = { ...ctx, sellerData: summarizeSheet(sheet.rows) };
      }
    } catch {
      /* 시트 읽기 실패 시 그냥 진행 */
    }
  }

  let gen;
  try {
    gen = await generate(agent, b, ctx);
  } catch (e) {
    return {
      brand: b.name,
      agent,
      status: "error",
      reason: e instanceof Error ? e.message : "생성 실패",
    };
  }

  const aiUserId = await getAiUserId(svc);
  const { data: task } = await svc
    .from("tasks")
    .insert({
      brand_id: b.id,
      title: `${b.name} ${TASK_TITLE[agent]}`,
      category: CATEGORY[agent],
      assignee_kind: "ai",
      ai_agent_type: agent,
      status: "진행",
      created_by: aiUserId,
    })
    .select("id")
    .maybeSingle();

  const { data: output, error: oErr } = await svc
    .from("ai_outputs")
    .insert({
      task_id: task?.id ?? null,
      brand_id: b.id,
      agent_type: agent,
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
    return { brand: b.name, agent, status: "error", reason: oErr?.message ?? "저장 실패" };
  }

  // 1차 규칙 기반(금지어) + 2차 LLM 맥락 판단 결합
  const ruleCheck = runComplianceCheck(b, gen.body);
  const llmCheck = await runComplianceLLM(b, gen.body);
  const check = {
    verdict: (ruleCheck.verdict === "fail" || llmCheck.verdict === "fail"
      ? "fail"
      : "pass") as "pass" | "fail",
    findings: [...ruleCheck.findings, ...llmCheck.findings],
  };
  await svc.from("compliance_checks").insert({
    ai_output_id: output.id,
    brand_id: b.id,
    regulation: b.regulation,
    verdict: check.verdict,
    findings: check.findings,
    checker: "rule+llm",
  });
  await svc
    .from("ai_outputs")
    .update({ compliance_status: check.verdict })
    .eq("id", output.id);

  if (check.verdict === "fail") {
    return {
      brand: b.name,
      agent,
      status: "blocked",
      aiOutputId: output.id,
      compliance: "fail",
      findings: check.findings.length,
    };
  }
  return { brand: b.name, agent, status: "queued", aiOutputId: output.id, compliance: "pass" };
}

/** ai_enabled=true 브랜드 전체에 대해 에이전트 실행(정기 실행용). */
export async function runAgentForAllEnabled(agent: AgentType): Promise<AgentRunResult[]> {
  const svc = createSupabaseServiceClient();
  const { data: brands } = await svc
    .from("brands")
    .select("id")
    .eq("ai_enabled", true)
    .order("name");
  const results: AgentRunResult[] = [];
  for (const row of brands ?? []) {
    results.push(await runAgentForBrand(agent, (row as { id: string }).id));
  }
  return results;
}

// 하위 호환 별칭
export const runMarketerForBrand = (brandId: string, ctx?: MarketerContext) =>
  runAgentForBrand("marketer", brandId, ctx ?? {});
export const runMarketerForAllEnabled = () => runAgentForAllEnabled("marketer");
