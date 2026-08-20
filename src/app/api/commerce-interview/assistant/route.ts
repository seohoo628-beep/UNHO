import { NextResponse } from "next/server";
import { getAppUserOrNull } from "@/lib/auth";
import { getAnthropic, createMessageWithFallback } from "@/lib/anthropic";
import { EDIT_TOOL, SYSTEM, sanitize, describe, type PlanState, type PlanTurn } from "@/lib/planAssistant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 플랜 화면의 채팅 어시스턴트.
 *
 * 어시스턴트는 값을 직접 쓰지 않는다. 바꿀 칸과 값을 목록으로 돌려주면
 * 화면이 "지금 값 → 바꿀 값"을 보여 주고, 대표가 고른 것만 반영한다.
 * (그래서 여기서 하는 일은 상태를 요약해 넘기고, 제안을 검증해 돌려주는 것뿐이다.)
 *
 * 화면 값을 그대로 받아 되돌려주므로 저장은 하지 않는다 — 저장은 기존 저장 버튼이 한다.
 */

type Body = { message?: string; history?: PlanTurn[]; state?: PlanState };

const err = (error: string, code = 400) => NextResponse.json({ ok: false, error }, { status: code });

export async function POST(request: Request) {
  const user = await getAppUserOrNull();
  if (!user) return err("로그인이 필요합니다", 401);
  if (!["owner", "staff"].includes(user.role)) return err("권한이 없습니다", 403);

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return err("본문을 읽을 수 없습니다");
  }

  const message = (body.message ?? "").trim();
  if (!message) return err("메시지가 비어 있습니다");
  if (message.length > 4000) return err("메시지가 너무 깁니다 (4,000자 이내)");

  // 직전 대화 몇 턴만 붙인다. 화면 상태는 매번 새로 넣으므로 오래된 턴은 필요 없다.
  const history = (body.history ?? [])
    .filter((t) => (t.role === "user" || t.role === "assistant") && (t.text ?? "").trim())
    .slice(-8)
    .map((t) => ({ role: t.role, content: (t.text as string).slice(0, 2000) }));

  const userMsg = `아래는 지금 화면의 상태다.\n\n${describe(body.state)}\n\n---\n[질문] ${message}`;

  try {
    const anthropic = await getAnthropic();
    const { msg, model } = await createMessageWithFallback(anthropic, {
      max_tokens: 2000,
      system: SYSTEM,
      messages: [...history, { role: "user", content: userMsg }],
      tools: [EDIT_TOOL],
      tool_choice: { type: "tool", name: "plan_edit" },
    } as never);

    const block = (msg.content ?? []).find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") {
      const text = (msg.content ?? []).filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
      return NextResponse.json({ ok: true, reply: text || "답을 만들지 못했습니다.", fields: [], rows: [], model });
    }
    const input = (block.input ?? {}) as Record<string, unknown>;
    const { fields, rows } = sanitize(input);
    const reply = String(input.reply ?? "").trim() || "답을 만들지 못했습니다.";
    return NextResponse.json({ ok: true, reply, fields, rows, model });
  } catch (e) {
    const m = e instanceof Error ? e.message : "요청 실패";
    return err(m, /API 키가 설정되지 않았습니다/.test(m) ? 412 : 502);
  }
}
