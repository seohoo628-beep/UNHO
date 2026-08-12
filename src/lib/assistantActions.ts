"use server";

import { requireAppUser } from "@/lib/auth";
import { getAnthropic, createMessageWithFallback } from "@/lib/anthropic";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FOLDER_GROUPS } from "@/lib/folders";

export type ChatMsg = { role: "user" | "assistant"; content: string };

function labelForPath(path: string): string {
  let best = "";
  let label = "";
  for (const g of FOLDER_GROUPS) {
    for (const it of g.items) {
      if ((path === it.href || path.startsWith(it.href + "/")) && it.href.length > best.length) {
        best = it.href; label = it.label;
      }
    }
  }
  return label || path;
}

// 현재 화면(path)에 해당하는 실제 데이터를 RLS 그대로 조회해 맥락 텍스트로 만든다.
// (CEO 전용 테이블은 정책상 대표 계정에서만 반환됨)
async function loadPageContext(path: string): Promise<string> {
  const p = path || "";
  const supabase = createSupabaseServerClient();
  const block = (title: string, rows: any[] | null | undefined, fmt: (r: any) => string, cap = 250): string => {
    const list = (rows ?? []).slice(0, cap);
    if (!list.length) return "";
    return `## ${title} (${(rows ?? []).length}건${(rows ?? []).length > cap ? `, 상위 ${cap}건 표시` : ""})\n` + list.map((r) => "- " + fmt(r)).join("\n");
  };
  let out = "";
  try {
    if (p.startsWith("/todos")) {
      const { data } = await supabase.from("todos").select("title,status,due_date").in("status", ["예정", "진행", "보류"]).limit(250);
      out = block("업무투두(진행 중)", data, (r) => `[${r.status}] ${r.title}${r.due_date ? ` (마감 ${r.due_date})` : ""}`);
    } else if (p.startsWith("/ceo-todos")) {
      const { data } = await supabase.from("ceo_todos").select("text,pri,done").eq("done", false).limit(300);
      out = block("CEO 투두(미완료)", data, (r) => `[${r.pri}] ${r.text}`);
    } else if (p.startsWith("/reminders")) {
      const { data } = await supabase.from("reminders").select("text,done").limit(300);
      out = block("리마인드", data, (r) => `${r.done ? "[완료] " : ""}${r.text}`);
    } else if (p.startsWith("/contacts")) {
      const { data } = await supabase.from("contacts").select("name,category,company,contact").limit(500);
      out = block("인적자산(인맥)", data, (r) => `${r.name}${r.category ? ` [${r.category}]` : ""}${r.company ? ` · ${r.company}` : ""}${r.contact ? ` · ${r.contact}` : ""}`, 400);
    } else if (p.startsWith("/tiktok-leads")) {
      const { data } = await supabase.from("tiktok_leads").select("handle,name,stage,followers").limit(300);
      out = block("틱톡 에이전트 리스트", data, (r) => `${r.handle || r.name || "-"} [${r.stage || "미접촉"}]${r.followers ? ` · 팔로워 ${r.followers}` : ""}`);
    } else if (p.startsWith("/business-cards")) {
      const { data } = await supabase.from("business_cards").select("name,company,mobile").limit(300);
      out = block("명함목록", data, (r) => `${r.name || ""}${r.company ? ` · ${r.company}` : ""}${r.mobile ? ` · ${r.mobile}` : ""}`);
    } else if (p.startsWith("/assets")) {
      const { data } = await supabase.from("product_assets").select("title,kind,folder").limit(300);
      out = block("각종 자료", data, (r) => `${r.title} [${r.kind}]${r.folder ? ` · ${r.folder}` : ""}`);
    } else if (p.startsWith("/meetings")) {
      const { data } = await supabase.from("meetings").select("title,meeting_date,meeting_type,ai_summary").order("meeting_date", { ascending: false }).limit(40);
      out = block("미팅·회의 일지(최근)", data, (r) => `${r.meeting_date || ""} [${r.meeting_type || ""}] ${r.title}${r.ai_summary ? ` — ${String(r.ai_summary).replace(/\s+/g, " ").slice(0, 140)}` : ""}`);
    } else if (p.startsWith("/e-approval")) {
      const { data } = await supabase.from("approval_requests").select("kind,title,amount,status").order("created_at", { ascending: false }).limit(100);
      out = block("전자결재", data, (r) => `[${r.status}] ${r.kind} · ${r.title}${r.amount != null ? ` · ${Number(r.amount).toLocaleString()}원` : ""}`);
    } else if (p.startsWith("/payables")) {
      const { data } = await supabase.from("payables").select("vendor,amount,due_date,status").limit(200);
      out = block("미지급금", data, (r) => `${r.vendor || "-"} · ${r.amount != null ? Number(r.amount).toLocaleString() + "원" : ""}${r.due_date ? ` (${r.due_date})` : ""}${r.status ? ` [${r.status}]` : ""}`);
    } else if (p.startsWith("/receivables")) {
      const { data } = await supabase.from("receivables").select("payer,amount,due_date,status").limit(200);
      out = block("미수금", data, (r) => `${r.payer || "-"} · ${r.amount != null ? Number(r.amount).toLocaleString() + "원" : ""}${r.due_date ? ` (${r.due_date})` : ""}${r.status ? ` [${r.status}]` : ""}`);
    }
  } catch {
    /* 데이터 로드 실패(컬럼·테이블 차이 등) 시 맥락 없이 진행 */
  }
  if (!out) return "";
  return out.length > 14000 ? out.slice(0, 14000) + "\n…(이하 생략)" : out;
}

// 전 페이지 공용 AI 어시스턴트. 현재 화면(path)의 실제 데이터를 읽어 한국어로 답한다.
export async function askAssistant(
  history: ChatMsg[],
  path?: string
): Promise<{ ok: boolean; text?: string; error?: string }> {
  let user;
  try {
    user = await requireAppUser();
  } catch {
    return { ok: false, error: "로그인이 필요합니다." };
  }
  try {
    const label = labelForPath(path || "");
    const context = await loadPageContext(path || "");
    const anthropic = await getAnthropic();
    const system = `당신은 운호컴퍼니 내부 운영 플랫폼의 AI 어시스턴트입니다.
사용자: ${user.name ?? "직원"} (${user.role}). 현재 보고 있는 화면: ${label}.
회사 사업: 화장품(리앤밤·뷰티밤), 건강기능식품·식품(주당의비결·슈퍼릴라), 외식(대운목장·신미집·청담 오리닭), 의료(엣지라인), 유통·커머스.
지침:
- 한국어로 간결하고 실용적으로 답합니다. 필요하면 표·목록·단계로 정리합니다.
- 업무 초안(문자·메일·기획·카피), 요약, 번역, 아이디어, 분석 등을 돕습니다.
- 표시광고 규제상 화장품·건기식의 과장·의학적 효능 단정(질병 치료·예방 등)은 피하고 표현을 순화합니다.
- 아래 [현재 화면 데이터]가 있으면 그것을 근거로 답하고, 없거나 부족하면 사용자에게 요청합니다. 데이터에 없는 사실을 지어내지 마세요.
${context ? `\n[현재 화면 데이터]\n${context}` : "\n[현재 화면 데이터] 없음(이 화면은 자동 조회를 지원하지 않거나 권한/데이터가 없습니다)."}`;

    const messages = (history || [])
      .filter((m) => m && m.content && m.content.trim())
      .slice(-16)
      .map((m) => ({ role: m.role, content: m.content }));
    if (!messages.length) return { ok: false, error: "메시지가 없습니다." };

    const { msg } = await createMessageWithFallback(anthropic, {
      max_tokens: 1800,
      system,
      messages: messages as any,
    });
    const text = msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
    return { ok: true, text: text || "(응답이 비어 있습니다)" };
  } catch (e: any) {
    const m = e?.message || String(e);
    if (/ANTHROPIC|api key|API 키/i.test(m)) return { ok: false, error: "AI 키가 설정되지 않았습니다. 설정 화면에서 ANTHROPIC 키를 등록해 주세요." };
    return { ok: false, error: `AI 오류: ${m}` };
  }
}
