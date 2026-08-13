"use server";

import { revalidatePath } from "next/cache";
import { requireAppUser } from "@/lib/auth";
import { getAnthropic, createMessageWithFallback } from "@/lib/anthropic";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isCeoUser } from "@/lib/ceo";
import { FOLDER_GROUPS } from "@/lib/folders";
import { snapshotCeoRecord } from "@/lib/ceoRevisions";
import { snapshotStaffRecord } from "@/lib/staffRevisions";

export type ChatMsg = { role: "user" | "assistant"; content: string };

// 폴더별 편집 대상 테이블 + 쓰기 허용 컬럼(화이트리스트).
type WriteCfg = { entity: string; cols: string[]; label: string; ceo: boolean };
const WRITE_CONFIG: { prefix: string; cfg: WriteCfg }[] = [
  { prefix: "/reminders", cfg: { entity: "reminders", label: "리마인드", ceo: true, cols: ["text", "cat", "brand", "done", "pinned"] } },
  { prefix: "/ideas", cfg: { entity: "ideas", label: "아이디어", ceo: true, cols: ["title", "body", "tags", "status", "pinned"] } },
  { prefix: "/tiktok-leads", cfg: { entity: "tiktok_leads", label: "틱톡 에이전트", ceo: true, cols: ["handle", "name", "category", "stage", "followers", "product", "contact", "contact2", "email", "link", "agency", "source", "note"] } },
  { prefix: "/assets", cfg: { entity: "product_assets", label: "각종 자료", ceo: false, cols: ["title", "kind", "brand", "folder", "note"] } },
  { prefix: "/meetings", cfg: { entity: "meetings", label: "미팅·회의", ceo: false, cols: ["title", "meeting_type", "meeting_date", "attendees", "location", "body"] } },
];
function writeCfgFor(path: string): WriteCfg | null {
  let best: WriteCfg | null = null; let len = 0;
  for (const w of WRITE_CONFIG) if ((path === w.prefix || path.startsWith(w.prefix + "/")) && w.prefix.length > len) { best = w.cfg; len = w.prefix.length; }
  return best;
}

function labelForPath(path: string): string {
  let best = ""; let label = "";
  for (const g of FOLDER_GROUPS) for (const it of g.items) {
    if ((path === it.href || path.startsWith(it.href + "/")) && it.href.length > best.length) { best = it.href; label = it.label; }
  }
  return label || path;
}

// 현재 화면 데이터(수정·삭제에 쓸 수 있게 id 포함)를 RLS 그대로 조회.
async function loadPageContext(path: string): Promise<string> {
  const p = path || "";
  const supabase = createSupabaseServerClient();
  const block = (title: string, rows: any[] | null | undefined, fmt: (r: any) => string, cap = 200): string => {
    const list = (rows ?? []).slice(0, cap);
    if (!list.length) return "";
    return `## ${title} (${(rows ?? []).length}건)\n` + list.map((r) => `- {id:${r.id}} ${fmt(r)}`).join("\n");
  };
  let out = "";
  try {
    if (p.startsWith("/todos")) {
      const { data } = await supabase.from("todos").select("id,title,status,due_date").in("status", ["예정", "진행", "보류"]).limit(200);
      out = block("업무투두(진행 중)", data, (r) => `[${r.status}] ${r.title}${r.due_date ? ` (마감 ${r.due_date})` : ""}`);
    } else if (p.startsWith("/reminders")) {
      const { data } = await supabase.from("reminders").select("id,text,cat,brand,done").limit(300);
      out = block("리마인드", data, (r) => `${r.done ? "[완료]" : ""}${r.brand ? `(${r.brand})` : ""} ${r.text}`);
    } else if (p.startsWith("/ideas")) {
      const { data } = await supabase.from("ideas").select("id,title,body,status,tags").limit(200);
      out = block("아이디어", data, (r) => `[${r.status}] ${r.title}${r.body ? ` — ${String(r.body).slice(0, 80)}` : ""}`);
    } else if (p.startsWith("/tiktok-leads")) {
      const { data } = await supabase.from("tiktok_leads").select("id,handle,name,stage,followers").limit(300);
      out = block("틱톡 에이전트", data, (r) => `${r.handle || r.name || "-"} [${r.stage || "미접촉"}]${r.followers ? ` · 팔로워 ${r.followers}` : ""}`);
    } else if (p.startsWith("/assets")) {
      const { data } = await supabase.from("product_assets").select("id,title,kind,folder").limit(300);
      out = block("각종 자료", data, (r) => `${r.title} [${r.kind}]${r.folder ? ` · ${r.folder}` : ""}`);
    } else if (p.startsWith("/meetings")) {
      const { data } = await supabase.from("meetings").select("id,title,meeting_date,meeting_type,ai_summary").order("meeting_date", { ascending: false }).limit(40);
      out = block("미팅·회의(최근)", data, (r) => `${r.meeting_date || ""} [${r.meeting_type || ""}] ${r.title}${r.ai_summary ? ` — ${String(r.ai_summary).replace(/\s+/g, " ").slice(0, 100)}` : ""}`);
    } else if (p.startsWith("/e-approval")) {
      const { data } = await supabase.from("approval_requests").select("id,kind,title,amount,status").order("created_at", { ascending: false }).limit(100);
      out = block("전자결재", data, (r) => `[${r.status}] ${r.kind} · ${r.title}${r.amount != null ? ` · ${Number(r.amount).toLocaleString()}원` : ""}`);
    }
  } catch { /* 조회 실패 시 맥락 없이 */ }
  if (!out) return "";
  return out.length > 9000 ? out.slice(0, 9000) + "\n…(이하 생략)" : out;
}

// 도구 실행: 현재 폴더 테이블에 추가/수정/삭제. RLS(사용자 권한) + 컬럼 화이트리스트.
async function execTool(cfg: WriteCfg, name: string, input: any): Promise<any> {
  const supabase = createSupabaseServerClient();
  const pick = (fields: any) => { const o: Record<string, any> = {}; for (const k of Object.keys(fields || {})) if (cfg.cols.includes(k)) o[k] = fields[k]; return o; };
  const snapshot = async (id: string, note: string) => {
    const { data: cur } = await supabase.from(cfg.entity).select("*").eq("id", id).single();
    if (cur) { if (cfg.ceo) await snapshotCeoRecord(cfg.entity, id, cur, note); else await snapshotStaffRecord(cfg.entity, id, cur, note); }
  };
  try {
    if (name === "create_record") {
      const row = pick(input?.fields);
      if (!Object.keys(row).length) return { error: "허용된 필드가 없습니다. 허용 컬럼: " + cfg.cols.join(", ") };
      const { data, error } = await supabase.from(cfg.entity).insert(row).select("id").single();
      if (error) return { error: error.message };
      return { ok: true, id: data?.id, created: row };
    }
    if (name === "update_record") {
      if (!input?.id) return { error: "id가 필요합니다." };
      const row = pick(input?.fields);
      if (!Object.keys(row).length) return { error: "허용된 필드가 없습니다." };
      await snapshot(input.id, "AI 편집 전");
      (row as any).updated_at = new Date().toISOString();
      const { error } = await supabase.from(cfg.entity).update(row).eq("id", input.id);
      if (error) return { error: error.message };
      return { ok: true, id: input.id, updated: pick(input.fields) };
    }
    if (name === "delete_record") {
      if (!input?.id) return { error: "id가 필요합니다." };
      await snapshot(input.id, "AI 삭제 전");
      const { error } = await supabase.from(cfg.entity).delete().eq("id", input.id);
      if (error) return { error: error.message };
      return { ok: true, deleted: input.id };
    }
  } catch (e: any) { return { error: e?.message || String(e) }; }
  return { error: "알 수 없는 도구입니다." };
}

// 전 페이지 공용 AI 어시스턴트(읽기 + 편집). 현재 화면 데이터·편집도구 제공.
export async function askAssistant(
  history: ChatMsg[],
  path?: string
): Promise<{ ok: boolean; text?: string; error?: string; edited?: boolean }> {
  let user;
  try { user = await requireAppUser(); } catch { return { ok: false, error: "로그인이 필요합니다." }; }
  try {
    const label = labelForPath(path || "");
    const cfg = writeCfgFor(path || "");
    const canEdit = !!cfg && (cfg.ceo ? isCeoUser(user) : (user.role === "owner" || user.role === "staff"));
    const context = await loadPageContext(path || "");
    const anthropic = await getAnthropic();

    const system = `당신은 하루바른·나아 내부 운영 플랫폼의 AI 어시스턴트입니다.
사용자: ${user.name ?? "직원"} (${user.role}). 현재 화면: ${label}.
회사 사업: 하루바른·나아 두 브랜드의 건강기능식품·식품·화장품·유통·커머스. (브랜드 상세는 /brands 데이터 기준)
지침:
- 한국어로 간결·실용적으로. 필요하면 표·목록·단계로.
- 표시광고 규제상 화장품·건기식의 과장·의학적 효능 단정은 피하고 순화합니다.
- [현재 화면 데이터]를 근거로 답하고, 없는 사실은 지어내지 않습니다.
${canEdit ? `- 이 화면은 편집이 가능합니다(테이블: ${cfg!.label}). 사용자가 추가·수정·삭제를 요청하면 제공된 도구(create_record/update_record/delete_record)를 사용해 실제로 반영하세요.
- 수정·삭제할 때는 [현재 화면 데이터]의 {id:...} 값을 그 id로 사용합니다. 쓰기 허용 컬럼: ${cfg!.cols.join(", ")}.
- 삭제·대량 변경은 사용자가 명확히 요청한 경우에만. 실행 후 무엇을 바꿨는지 한국어로 요약해 알려주세요. (모든 편집은 자동 백업되어 복원 가능)` : "- 이 화면은 조회만 지원합니다(편집 도구 없음). 편집이 필요하면 화면에서 직접 수정하도록 안내하세요."}
${context ? `\n[현재 화면 데이터]\n${context}` : "\n[현재 화면 데이터] 없음."}`;

    const tools = canEdit ? [
      { name: "create_record", description: `현재 폴더(${cfg!.label})에 새 항목 추가`, input_schema: { type: "object", properties: { fields: { type: "object", description: "컬럼:값 객체. 허용 컬럼: " + cfg!.cols.join(", ") } }, required: ["fields"] } },
      { name: "update_record", description: "기존 항목 수정(id 지정)", input_schema: { type: "object", properties: { id: { type: "string" }, fields: { type: "object", description: "바꿀 컬럼:값" } }, required: ["id", "fields"] } },
      { name: "delete_record", description: "항목 삭제(id 지정)", input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
    ] : undefined;

    const messages: any[] = (history || []).filter((m) => m?.content?.trim()).slice(-14).map((m) => ({ role: m.role, content: m.content }));
    if (!messages.length) return { ok: false, error: "메시지가 없습니다." };

    let edited = false;
    const collectedText: string[] = [];
    for (let step = 0; step < 6; step++) {
      // sonnet-5 등 추론 모델이 thinking에 토큰을 다 쓰는 문제 방지: 추론 예산을 최소로 제한.
      let res;
      try {
        res = await createMessageWithFallback(anthropic, { max_tokens: 8192, thinking: { type: "enabled", budget_tokens: 1024 }, system, messages, ...(tools ? { tools } : {}) } as any);
      } catch {
        // thinking 파라미터 미지원 모델 등 → 큰 토큰으로 재시도.
        res = await createMessageWithFallback(anthropic, { max_tokens: 12000, system, messages, ...(tools ? { tools } : {}) } as any);
      }
      const { msg, model } = res;
      const content = (msg.content ?? []) as any[];
      const txt = content.filter((b) => b.type === "text").map((b) => b.text || "").join("\n").trim();
      if (txt) collectedText.push(txt);
      const toolUses = content.filter((b) => b.type === "tool_use");
      if (!toolUses.length) {
        if (edited && path) revalidatePath(path);
        const finalText = collectedText.join("\n\n").trim();
        if (finalText) return { ok: true, text: finalText, edited };
        return { ok: true, text: `(응답이 비어 있습니다 · 사유 ${(msg as any)?.stop_reason ?? "?"} · ${model})`, edited };
      }
      messages.push({ role: "assistant", content });
      const results: any[] = [];
      for (const tu of toolUses) {
        const r = cfg ? await execTool(cfg, tu.name, tu.input) : { error: "편집 불가" };
        if (r?.ok) edited = true;
        results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(r) });
      }
      messages.push({ role: "user", content: results });
    }
    if (edited && path) revalidatePath(path);
    return { ok: true, text: (collectedText.join("\n\n").trim() || "완료했습니다."), edited };
  } catch (e: any) {
    const m = e?.message || String(e);
    if (/ANTHROPIC|api key|API 키/i.test(m)) return { ok: false, error: "AI 키가 설정되지 않았습니다. 설정 화면에서 ANTHROPIC 키를 등록해 주세요." };
    return { ok: false, error: `AI 오류: ${m}` };
  }
}
