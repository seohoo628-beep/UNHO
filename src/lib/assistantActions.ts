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

// 어시스턴트는 속도·안정이 최우선 → 빠른 모델(haiku)을 먼저 시도하고, 추론(thinking)은 끈다.
const ASSISTANT_MODELS = [
  process.env.ANTHROPIC_ASSISTANT_MODEL,
  "claude-haiku-4-5-20251001",
  "claude-sonnet-5",
  "claude-opus-5",
  "claude-3-5-haiku-20241022",
  "claude-3-5-sonnet-latest",
].filter((m): m is string => !!m && m.trim().length > 0);

// 폴더별 편집 대상 테이블 + 쓰기 허용 컬럼(화이트리스트).
type WriteCfg = { entity: string; cols: string[]; label: string; ceo: boolean };
const WRITE_CONFIG: { prefix: string; cfg: WriteCfg }[] = [
  { prefix: "/ceo-todos", cfg: { entity: "ceo_todos", label: "CEO 투두", ceo: true, cols: ["text", "pri", "cat", "brand", "done", "due_date", "link", "pinned", "checklist"] } },
  { prefix: "/reminders", cfg: { entity: "reminders", label: "리마인드", ceo: true, cols: ["text", "cat", "brand", "done", "pinned"] } },
  { prefix: "/ideas", cfg: { entity: "ideas", label: "아이디어", ceo: true, cols: ["title", "body", "tags", "status", "pinned"] } },
  { prefix: "/contacts", cfg: { entity: "contacts", label: "인적자산", ceo: true, cols: ["name", "category", "job", "title", "company", "agency", "group_work", "contact", "contact2", "email", "birthday", "birth_year", "hometown", "education", "address", "where_met", "marital", "has_children", "children_names", "note"] } },
  { prefix: "/tiktok-leads", cfg: { entity: "tiktok_leads", label: "틱톡 에이전트", ceo: true, cols: ["handle", "name", "category", "stage", "followers", "product", "contact", "contact2", "email", "link", "agency", "source", "note"] } },
  { prefix: "/business-cards", cfg: { entity: "business_cards", label: "명함", ceo: true, cols: ["name", "company", "department", "position", "mobile", "office_phone", "email", "fax", "address", "website", "tags", "met_date", "location", "note"] } },
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
    } else if (p.startsWith("/ceo-todos")) {
      const { data } = await supabase.from("ceo_todos").select("id,text,pri,cat,brand,done").eq("done", false).limit(300);
      out = block("CEO 투두(미완료)", data, (r) => `[${r.pri}]${r.brand ? `(${r.brand})` : ""} ${r.text}`);
    } else if (p.startsWith("/reminders")) {
      const { data } = await supabase.from("reminders").select("id,text,cat,brand,done").limit(300);
      out = block("리마인드", data, (r) => `${r.done ? "[완료]" : ""}${r.brand ? `(${r.brand})` : ""} ${r.text}`);
    } else if (p.startsWith("/ideas")) {
      const { data } = await supabase.from("ideas").select("id,title,body,status,tags").limit(200);
      out = block("아이디어", data, (r) => `[${r.status}] ${r.title}${r.body ? ` — ${String(r.body).slice(0, 80)}` : ""}`);
    } else if (p.startsWith("/contacts")) {
      const { data } = await supabase.from("contacts").select("id,name,category,company,contact").limit(400);
      out = block("인적자산(인맥)", data, (r) => `${r.name}${r.category ? ` [${r.category}]` : ""}${r.company ? ` · ${r.company}` : ""}${r.contact ? ` · ${r.contact}` : ""}`);
    } else if (p.startsWith("/tiktok-leads")) {
      const { data } = await supabase.from("tiktok_leads").select("id,handle,name,stage,followers").limit(300);
      out = block("틱톡 에이전트", data, (r) => `${r.handle || r.name || "-"} [${r.stage || "미접촉"}]${r.followers ? ` · 팔로워 ${r.followers}` : ""}`);
    } else if (p.startsWith("/business-cards")) {
      const { data } = await supabase.from("business_cards").select("id,name,company,mobile").limit(300);
      out = block("명함목록", data, (r) => `${r.name || ""}${r.company ? ` · ${r.company}` : ""}${r.mobile ? ` · ${r.mobile}` : ""}`);
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
    // 대량 처리: 여러 항목을 한 번의 도구 호출로. (동시성 제한해 순차 배치)
    const runBatched = async (list: any[], fn: (x: any) => Promise<any>) => {
      const out: any[] = [];
      for (let i = 0; i < list.length; i += 8) out.push(...await Promise.all(list.slice(i, i + 8).map(fn)));
      return out;
    };
    if (name === "bulk_update_records") {
      const items = (Array.isArray(input?.items) ? input.items : []).slice(0, 400);
      const res = await runBatched(items, (it) => execTool(cfg, "update_record", it));
      const ok = res.filter((r) => r?.ok).length;
      return { ok: ok > 0, updated: ok, failed: res.length - ok };
    }
    if (name === "bulk_create_records") {
      const recs = (Array.isArray(input?.records) ? input.records : []).slice(0, 400);
      const res = await runBatched(recs, (f) => execTool(cfg, "create_record", { fields: f }));
      const ok = res.filter((r) => r?.ok).length;
      return { ok: ok > 0, created: ok, failed: res.length - ok };
    }
    if (name === "bulk_delete_records") {
      const ids = (Array.isArray(input?.ids) ? input.ids : []).slice(0, 400);
      const res = await runBatched(ids, (id) => execTool(cfg, "delete_record", { id }));
      const ok = res.filter((r) => r?.ok).length;
      return { ok: ok > 0, deleted: ok, failed: res.length - ok };
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

    const system = `당신은 운호컴퍼니 내부 운영 플랫폼의 AI 어시스턴트입니다.
사용자: ${user.name ?? "직원"} (${user.role}). 현재 화면: ${label}.
회사 사업: 화장품(리앤밤·뷰티밤), 건강기능식품·식품(주당의비결·슈퍼릴라), 외식(대운목장·신미집·청담 오리닭), 의료(엣지라인), 유통·커머스.
지침:
- 한국어로 간결·실용적으로. 필요하면 표·목록·단계로.
- 표시광고 규제상 화장품·건기식의 과장·의학적 효능 단정은 피하고 순화합니다.
- [현재 화면 데이터]를 근거로 답하고, 없는 사실은 지어내지 않습니다.
${canEdit ? `- 이 화면은 편집이 가능합니다(테이블: ${cfg!.label}). 사용자가 추가·수정·삭제를 요청하면 도구로 실제 반영하세요.
- 수정·삭제할 때는 [현재 화면 데이터]의 {id:...} 값을 그 id로 사용합니다. 쓰기 허용 컬럼: ${cfg!.cols.join(", ")}.
- ★중요: 2건 이상을 한 번에 바꿀 때는 반드시 대량 도구(bulk_update_records / bulk_create_records / bulk_delete_records)를 "한 번의 호출"로 사용하세요. 항목마다 update_record를 반복 호출하지 마세요(느리고 시간초과 납니다).
- 삭제·대량 변경은 사용자가 명확히 요청한 경우에만. 실행 후 무엇을 바꿨는지 1~2문장으로 요약하세요. (모든 편집은 자동 백업되어 복원 가능)` : "- 이 화면은 조회만 지원합니다(편집 도구 없음). 편집이 필요하면 화면에서 직접 수정하도록 안내하세요."}
${context ? `\n[현재 화면 데이터]\n${context}` : "\n[현재 화면 데이터] 없음."}`;

    const tools = canEdit ? [
      { name: "create_record", description: `현재 폴더(${cfg!.label})에 새 항목 추가`, input_schema: { type: "object", properties: { fields: { type: "object", description: "컬럼:값 객체. 허용 컬럼: " + cfg!.cols.join(", ") } }, required: ["fields"] } },
      { name: "update_record", description: "기존 항목 1건 수정(id 지정)", input_schema: { type: "object", properties: { id: { type: "string" }, fields: { type: "object", description: "바꿀 컬럼:값" } }, required: ["id", "fields"] } },
      { name: "delete_record", description: "항목 1건 삭제(id 지정)", input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
      { name: "bulk_update_records", description: "여러 항목을 한 번에 수정(권장). items 배열의 각 원소는 {id, fields}.", input_schema: { type: "object", properties: { items: { type: "array", items: { type: "object", properties: { id: { type: "string" }, fields: { type: "object" } }, required: ["id", "fields"] } } }, required: ["items"] } },
      { name: "bulk_create_records", description: "여러 항목을 한 번에 추가. records 배열의 각 원소는 컬럼:값 객체.", input_schema: { type: "object", properties: { records: { type: "array", items: { type: "object" } } }, required: ["records"] } },
      { name: "bulk_delete_records", description: "여러 항목을 한 번에 삭제. ids는 id 문자열 배열.", input_schema: { type: "object", properties: { ids: { type: "array", items: { type: "string" } } }, required: ["ids"] } },
    ] : undefined;

    const messages: any[] = (history || []).filter((m) => m?.content?.trim()).slice(-14).map((m) => ({ role: m.role, content: m.content }));
    if (!messages.length) return { ok: false, error: "메시지가 없습니다." };

    let edited = false;
    const collectedText: string[] = [];
    // 전체 실행 상한(서버 maxDuration 60초 이내에 반드시 응답 반환). 도구 반복이
    // 느린 추론 모델로 여러 번 돌면 플랫폼이 함수를 강제 종료해 '생각 중…'에서 멈추므로,
    // 남은 시간이 부족하면 도구 반복을 멈추고 지금까지 결과로 마무리한다.
    const startedAt = Date.now();
    const DEADLINE_MS = 50000;
    for (let step = 0; step < 5; step++) {
      if (step > 0 && Date.now() - startedAt > DEADLINE_MS) {
        if (edited && path) revalidatePath(path);
        const partial = collectedText.join("\n\n").trim();
        return { ok: true, text: partial || "요청을 처리했지만 시간이 부족해 일부만 반영됐을 수 있어요. 결과를 확인하고 필요하면 다시 요청해 주세요.", edited };
      }
      // 빠른 모델 우선 + thinking 끔(속도·안정). 실패 시 기본 후보로 재시도.
      let res;
      try {
        res = await createMessageWithFallback(anthropic, { max_tokens: 4096, system, messages, ...(tools ? { tools } : {}) } as any, ASSISTANT_MODELS);
      } catch {
        res = await createMessageWithFallback(anthropic, { max_tokens: 4096, system, messages, ...(tools ? { tools } : {}) } as any);
      }
      let { msg } = res;
      const { model } = res;
      let content = (msg.content ?? []) as any[];
      let txt = content.filter((b) => b.type === "text").map((b) => b.text || "").join("\n").trim();
      let toolUses = content.filter((b) => b.type === "tool_use");
      // 텍스트도 도구호출도 없이 비어 나오면(추론 모델이 한도 소진 등) thinking 없이 1회 재시도.
      if (!txt && !toolUses.length) {
        try {
          const retry = await createMessageWithFallback(anthropic, { max_tokens: 4096, system, messages, ...(tools ? { tools } : {}) } as any, ASSISTANT_MODELS);
          msg = retry.msg;
          content = (msg.content ?? []) as any[];
          txt = content.filter((b) => b.type === "text").map((b) => b.text || "").join("\n").trim();
          toolUses = content.filter((b) => b.type === "tool_use");
        } catch { /* keep original empty */ }
      }
      if (txt) collectedText.push(txt);
      if (!toolUses.length) {
        if (edited && path) revalidatePath(path);
        const finalText = collectedText.join("\n\n").trim();
        if (finalText) return { ok: true, text: finalText, edited };
        return { ok: true, text: `(응답이 비어 있습니다 · 사유 ${(msg as any)?.stop_reason ?? "?"} · ${model}) 잠시 후 다시 시도해 주세요.`, edited };
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
