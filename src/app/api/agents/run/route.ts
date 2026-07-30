import { NextResponse } from "next/server";
import { getAppUserOrNull } from "@/lib/auth";
import {
  runAgentForBrand,
  runAgentForAllEnabled,
  type AgentType,
} from "@/lib/agents/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGENTS: AgentType[] = ["marketer", "md", "designer"];

// 수동 실행. 대표·직원만. AI 세션은 존재하지 않는다.
export async function POST(req: Request) {
  const user = await getAppUserOrNull();
  if (!user || (user.role !== "owner" && user.role !== "staff")) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  let payload: {
    agentType?: AgentType;
    brandId?: string;
    all?: boolean;
    promo?: string;
    deliverable?: "detail" | "banner" | "deck";
  } = {};
  try {
    payload = await req.json();
  } catch {
    /* 빈 바디 허용 */
  }

  const agent = payload.agentType ?? "marketer";
  if (!AGENTS.includes(agent)) {
    return NextResponse.json({ error: "알 수 없는 에이전트" }, { status: 400 });
  }

  try {
    if (payload.all) {
      const results = await runAgentForAllEnabled(agent);
      return NextResponse.json({ results });
    }
    if (!payload.brandId) {
      return NextResponse.json({ error: "brandId 가 필요합니다." }, { status: 400 });
    }
    const result = await runAgentForBrand(agent, payload.brandId, {
      promo: payload.promo ?? null,
      deliverable: payload.deliverable,
    });
    return NextResponse.json({ result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "실행 실패" },
      { status: 500 }
    );
  }
}
