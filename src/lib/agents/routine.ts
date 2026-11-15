import { getAnthropic, createMessageWithFallback, friendlyAiError } from "@/lib/anthropic";
import { HARD_RULES, extractText } from "@/lib/agents/common";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { seoulToday } from "@/lib/time";
import { addDays, weekStart, ROUTINE_SELECT, type RoutineRow } from "@/lib/agentRoutines";

// ============================================================================
// AI 에이전트 정기 업무 실행기
// 루틴 투두 1건 → 지정 데이터 읽기 → LLM 작성 → 업무 본문(note)·체크리스트에 결과 작성 → 상태 갱신.
// AI는 승인·발송·금액 확정을 하지 않는다(HARD_RULES). 결과는 사내 검토용 초안이다.
// ============================================================================

type Svc = ReturnType<typeof createSupabaseServiceClient>;

export const AGENT_PERSONA: Record<string, string> = {
  "brand-manager": "운호컴퍼니 브랜드 매니저. 브랜드 포지셔닝·톤앤매너·KPI·런칭 일정을 관리한다.",
  marketer: "운호컴퍼니 마케터. 콘텐츠·프로모션·공동구매 기획과 성과 리포트, 표시광고 사전 검수를 맡는다.",
  merchandiser: "운호컴퍼니 MD. 상품 소싱·재고·입고·발주와 판매채널 입점, 공구 파이프라인을 관리한다.",
  designer: "운호컴퍼니 디자이너. 상세페이지·배너·카드뉴스·패키지·PPT 제작 큐와 VI 적용을 관리한다.",
  "finance-manager": "운호컴퍼니 재무 담당. 손익·자금수지·현금흐름과 예산을 관리한다.",
  "accounting-clerk": "운호컴퍼니 경리 담당. 세금계산서 발행·수취 대조, 미수금·미지급금, 증빙을 관리한다.",
  "hr-manager": "운호컴퍼니 인사 담당. 연차·근태, 입퇴사, 채용 진행을 관리한다.",
  "cs-manager": "운호컴퍼니 CS 담당. 고객 문의·클레임·교환·환불과 리뷰 동향을 관리한다.",
  "logistics-manager": "운호컴퍼니 물류 담당. 입고·출고·재고 이동과 택배·3PL 일정을 관리한다.",
  "marketer-judang": "주당의비결 전담 마케터. 주당의비결의 프로모션·콘텐츠·채널 액션을 기획한다.",
  "marketer-daeun": "대운목장 전담 마케터. 대운목장 매장의 SNS·예약·프로모션 액션을 기획한다.",
  "marketer-mudangtea": "무당티 전담 마케터. 무당티(혈당 스파이크 타겟 필름·젤리)의 판매처 확산과 콘텐츠를 기획한다.",
  "management-support": "운호컴퍼니 경영지원 담당. 전 부서 AI 에이전트의 결과를 모아 대표 일일 보고서를 만든다.",
  "video-editor": "운호컴퍼니 영상 PD. 숏폼·릴스 편집 큐와 촬영 요청을 관리한다.",
  "groupbuy-manager": "운호컴퍼니 공동구매 담당. 공구 셀러·바이어 발굴, 제안, 팔로업을 관리한다.",
  "sns-manager": "운호컴퍼니 SNS 관리자. 카드뉴스·릴스·숏츠·스레드 콘텐츠를 매일 기획하고 승인 대기 목록을 만든다.",
  "md-judang": "주당의비결 전담 MD. 주당의비결 재고·발주·입점·신제품 진행을 관리한다.",
  "md-daeun": "대운목장 전담 MD. 대운목장 식자재·발주·거래처를 관리한다.",
  "md-mudangtea": "무당티 전담 MD. 무당티 로트·유통기한·판매처 팔로업을 관리한다.",
  "community-marketer": "운호컴퍼니 블로그·커뮤니티 담당. 공식 블로그, 광고 표시 체험단, 공식 계정 커뮤니티 활동을 관리한다.",
  "fnb-manager": "운호컴퍼니 F&B 관리자. 매장 운영(인력·위생·설비·매출) 이슈를 관리한다.",
  "fnb-supervisor": "운호컴퍼니 F&B 슈퍼바이저. 매장별 오픈·마감·위생·재고 체크리스트를 점검한다.",
};

const won = (n: unknown) => (n == null || n === "" ? "-" : `${Number(n).toLocaleString("ko-KR")}원`);
const rowsOrEmpty = (label: string, lines: string[]) =>
  `[${label}]\n${lines.length ? lines.join("\n") : "데이터 없음"}`;

// ── 참고 데이터 ────────────────────────────────────────────────────────────
// 각 빌더는 실패해도 "읽기 실패"만 남기고 실행을 막지 않는다. 행 수는 제한한다.
const CONTEXT_BUILDERS: Record<string, (svc: Svc, today: string) => Promise<string>> = {
  async receivables(svc, today) {
    const { data, error } = await svc
      .from("receivables")
      .select("counterparty, item, billed, received, bill_date, due_date")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(80);
    if (error) return "[미수금] 읽기 실패";
    const open = (data ?? []).filter((r: any) => Number(r.billed) - Number(r.received) > 0);
    return rowsOrEmpty(
      `미수금(잔액 있는 건, 오늘 ${today})`,
      open.map((r: any) => `- ${r.counterparty} | ${r.item ?? "-"} | 청구 ${won(r.billed)} 입금 ${won(r.received)} 잔액 ${won(Number(r.billed) - Number(r.received))} | 청구일 ${r.bill_date ?? "-"} | 입금예정 ${r.due_date ?? "-"}`)
    );
  },
  async payables(svc, today) {
    const { data, error } = await svc
      .from("payables")
      .select("counterparty, item, amount, paid, bill_date, due_date")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(80);
    if (error) return "[미지급금] 읽기 실패";
    const open = (data ?? []).filter((r: any) => Number(r.amount) - Number(r.paid) > 0);
    return rowsOrEmpty(
      `미지급금(잔액 있는 건, 오늘 ${today})`,
      open.map((r: any) => `- ${r.counterparty} | ${r.item ?? "-"} | 청구 ${won(r.amount)} 지급 ${won(r.paid)} 잔액 ${won(Number(r.amount) - Number(r.paid))} | 청구일 ${r.bill_date ?? "-"} | 지급예정 ${r.due_date ?? "-"}`)
    );
  },
  async purchase_orders(svc) {
    const { data, error } = await svc
      .from("purchase_orders")
      .select("po_number, po_date, item, order_qty, receipt_date, receipt_qty, tax_invoice, status")
      .not("status", "in", "(지급완료)")
      .order("po_date", { ascending: false })
      .limit(40);
    if (error) return "[발주] 읽기 실패";
    return rowsOrEmpty(
      "진행 중 발주",
      (data ?? []).map((r: any) => `- ${r.po_number ?? "-"} | ${r.po_date ?? "-"} | ${r.item ?? "-"} | 발주 ${r.order_qty ?? "-"} 입고 ${r.receipt_qty ?? "-"}(${r.receipt_date ?? "-"}) | 계산서 ${r.tax_invoice ?? "-"} | ${r.status}`)
    );
  },
  async pnl(svc) {
    const { data, error } = await svc
      .from("pnl_snapshots")
      .select("snapshot_date, revenue, net_revenue, op_profit, margin_pct, ad_cost, roas, refund_pct, orders, aov")
      .order("snapshot_date", { ascending: false })
      .limit(14);
    if (error) return "[P&L] 읽기 실패";
    return rowsOrEmpty(
      "P&L 스냅샷(최근 14개, 최신순)",
      (data ?? []).map((r: any) => `- ${r.snapshot_date} | 매출 ${won(r.revenue)} 순매출 ${won(r.net_revenue)} 영업이익 ${won(r.op_profit)} 이익률 ${r.margin_pct ?? "-"}% | 광고비 ${won(r.ad_cost)} ROAS ${r.roas ?? "-"} | 환불률 ${r.refund_pct ?? "-"}% | 주문 ${r.orders ?? "-"} 객단가 ${won(r.aov)}`)
    );
  },
  async mdt(svc, today) {
    const [lots, accounts] = await Promise.all([
      svc.from("mdt_lots").select("lot_no, received_date, expiry, qty_in").order("expiry", { ascending: true }).limit(30),
      svc.from("mdt_accounts").select("name, channel, stage, deal_type, next_action, next_date").not("stage", "in", "(종료)").order("next_date", { ascending: true, nullsFirst: false }).limit(60),
    ]);
    const parts: string[] = [];
    parts.push(
      lots.error
        ? "[무당티 로트] 읽기 실패"
        : rowsOrEmpty(`무당티 로트(오늘 ${today})`, (lots.data ?? []).map((r: any) => `- ${r.lot_no} | 입고 ${r.received_date ?? "-"} | 유통기한 ${r.expiry} | 입고수량 ${r.qty_in}`))
    );
    parts.push(
      accounts.error
        ? "[무당티 판매처] 읽기 실패"
        : rowsOrEmpty("무당티 판매처·제안", (accounts.data ?? []).map((r: any) => `- ${r.name} | ${r.channel ?? "-"} | ${r.stage} | ${r.deal_type ?? "-"} | 다음 할 일 ${r.next_action ?? "-"} (${r.next_date ?? "-"})`))
    );
    return parts.join("\n\n");
  },
  async inventory(svc) {
    const { data, error } = await svc
      .from("inventory_items")
      .select("item, current_stock, out_30d, safety_days, lead_time_days, brands(name)")
      .limit(80);
    if (error) return "[재고] 읽기 실패";
    return rowsOrEmpty(
      "재고 품목",
      (data ?? []).map((r: any) => `- ${r.brands?.name ?? "-"} | ${r.item} | 현재고 ${r.current_stock ?? "-"} | 30일 출고 ${r.out_30d ?? "-"} | 안전여유 ${r.safety_days}일 | 리드타임 ${r.lead_time_days ?? "-"}일`)
    );
  },
  async promotions(svc, today) {
    const { data, error } = await svc
      .from("promotions")
      .select("title, channel, period_label, status, start_date, end_date, result, outcome")
      .gte("end_date", addDays(today, -21))
      .order("start_date", { ascending: true })
      .limit(40);
    if (error) return "[프로모션] 읽기 실패";
    return rowsOrEmpty(
      "프로모션(최근 3주 이후 종료분 포함)",
      (data ?? []).map((r: any) => `- ${r.title} | ${r.channel ?? "-"} | ${r.period_label ?? "-"} | ${r.status} | ${r.start_date ?? "-"}~${r.end_date ?? "-"} | 결과 ${r.result ?? "미입력"} | 성과 ${r.outcome ?? "미입력"}`)
    );
  },
  async brands(svc) {
    const { data, error } = await svc
      .from("brands")
      .select("name, category, flagship, channel, regulation, op_status, tone")
      .order("name")
      .limit(30);
    if (error) return "[브랜드] 읽기 실패";
    return rowsOrEmpty(
      "브랜드",
      (data ?? []).map((r: any) => `- ${r.name} | ${r.category ?? "-"} | 대표제품 ${r.flagship ?? "-"} | 채널 ${r.channel ?? "-"} | 규제 ${r.regulation ?? "-"} | ${r.op_status ?? "-"} | 톤 ${String(r.tone ?? "-").slice(0, 80)}`)
    );
  },
  async todos(svc, today) {
    const [{ data, error }, { data: users }] = await Promise.all([
      svc
        .from("todos")
        .select("title, status, priority, due_date, assignee_user_ids, assignee_user_id, brands(name)")
        .in("status", ["예정", "진행", "보류"])
        .is("routine_id", null)
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(120),
      svc.from("users").select("id, name"),
    ]);
    if (error) return "[진행 중 업무] 읽기 실패";
    const name = new Map(((users ?? []) as { id: string; name: string }[]).map((u) => [u.id, u.name] as const));
    return rowsOrEmpty(
      `진행 중 업무(정기업무 제외, 오늘 ${today})`,
      (data ?? []).map((r: any) => {
        const ids: string[] = r.assignee_user_ids?.length ? r.assignee_user_ids : r.assignee_user_id ? [r.assignee_user_id] : [];
        return `- ${r.title} | ${r.brands?.name ?? "-"} | ${ids.map((i) => name.get(i) ?? "?").join(",") || "미지정"} | ${r.priority} | ${r.status} | 마감 ${r.due_date ?? "-"}`;
      })
    );
  },
  async leave(svc, today) {
    const { data, error } = await svc
      .from("leave_requests")
      .select("name, type, start_date, end_date, days, status")
      .or(`status.eq.신청,start_date.gte.${today}`)
      .lte("start_date", addDays(today, 14))
      .order("start_date", { ascending: true })
      .limit(60);
    if (error) return "[휴가] 읽기 실패";
    return rowsOrEmpty(
      "휴가(승인 대기 + 향후 14일)",
      (data ?? []).map((r: any) => `- ${r.name} | ${r.type} | ${r.start_date}~${r.end_date ?? r.start_date} | ${r.days}일 | ${r.status}`)
    );
  },
};

// ── 추가 참고 데이터 (0101) ────────────────────────────────────────────────
Object.assign(CONTEXT_BUILDERS, {
  async reviews(svc: Svc) {
    const { data, error } = await svc
      .from("review_snapshots")
      .select("title, captured_on, reviews, price")
      .order("captured_on", { ascending: false })
      .limit(40);
    if (error) return "[리뷰 스냅샷] 읽기 실패";
    return rowsOrEmpty(
      "리뷰 스냅샷(최신순)",
      (data ?? []).map((r: any) => `- ${r.captured_on} | ${r.title ?? "-"} | 리뷰 ${r.reviews}건 | 가격 ${won(r.price)}`)
    );
  },
  async crm_leads(svc: Svc, today: string) {
    const { data, error } = await svc
      .from("crm_leads")
      .select("kind, name, product, stage, proposed_at, replied_at, next_follow_up, note, brands(name)")
      .not("stage", "in", "(성사,실패)")
      .order("next_follow_up", { ascending: true, nullsFirst: false })
      .limit(60);
    if (error) return "[공구·입점 리드] 읽기 실패(crm_leads 테이블 미적용 가능)";
    return rowsOrEmpty(
      `공구·입점 리드(진행 중, 오늘 ${today})`,
      (data ?? []).map((r: any) => `- ${r.kind === "buyer" ? "바이어" : "셀러"} | ${r.name} | ${r.brands?.name ?? "-"} | ${r.product ?? "-"} | ${r.stage} | 제안 ${r.proposed_at ?? "-"} 회신 ${r.replied_at ?? "-"} | 팔로업 ${r.next_follow_up ?? "-"} | ${String(r.note ?? "").slice(0, 60)}`)
    );
  },
  async product_dev(svc: Svc) {
    const { data, error } = await svc
      .from("product_developments")
      .select("name, category, stage, target_date, note, brands(name)")
      .not("stage", "in", "(출시,보류)")
      .order("target_date", { ascending: true, nullsFirst: false })
      .limit(30);
    if (error) return "[제품 개발] 읽기 실패";
    return rowsOrEmpty(
      "제품 개발(진행 중)",
      (data ?? []).map((r: any) => `- ${r.brands?.name ?? "-"} | ${r.name} | ${r.stage} | 목표 ${r.target_date ?? "-"} | ${String(r.note ?? "").slice(0, 80)}`)
    );
  },
  async store_meetings(svc: Svc, today: string) {
    const { data, error } = await svc
      .from("store_meetings")
      .select("platform, store, title, meeting_type, meeting_date, ai_summary, body")
      .gte("meeting_date", addDays(today, -14))
      .order("meeting_date", { ascending: false })
      .limit(15);
    if (error) return "[매장 회의] 읽기 실패";
    return rowsOrEmpty(
      "매장 회의(최근 14일)",
      (data ?? []).map((r: any) => `- ${r.meeting_date ?? "-"} | ${r.platform}/${r.store} | ${r.title} | ${String(r.ai_summary || r.body || "").replace(/\s+/g, " ").slice(0, 300)}`)
    );
  },
  async agent_reports(svc: Svc, today: string) {
    // 오늘 실행된 정기업무 결과(업무 본문 note)를 부서별로 모은다. 대표 일일 보고용.
    const { data: todos, error } = await svc
      .from("todos")
      .select("id, title, note, agent_status, agent_error, agent_run_at, assignee_user_id")
      .not("routine_id", "is", null)
      .in("routine_period", [`D:${today}`, `W:${weekStart(today)}`]);
    if (error) return "[오늘 정기업무 결과] 읽기 실패";
    type T = { id: string; title: string; note: string | null; agent_status: string | null; agent_error: string | null; agent_run_at: string | null; assignee_user_id: string | null };
    const list = (todos ?? []) as T[];
    if (list.length === 0) return "[오늘 정기업무 결과]\n데이터 없음";
    const { data: users } = await svc.from("users").select("id, name").eq("role", "ai");
    const name = new Map(((users ?? []) as { id: string; name: string }[]).map((u) => [u.id, u.name] as const));
    const startOfToday = Date.parse(`${today}T00:00:00+09:00`);
    const latest = new Map<string, string>();
    for (const t of list) {
      const ranToday = t.agent_run_at && Date.parse(t.agent_run_at) >= startOfToday;
      if (t.agent_status === "완료" && ranToday && t.note?.startsWith(RESULT_MARK)) latest.set(t.id, t.note);
    }
    const blocks = list
      .filter((t) => !/대표 일일 보고/.test(t.title))
      .map((t) => {
        const who = name.get(t.assignee_user_id ?? "") ?? "미지정";
        const body = latest.get(t.id);
        if (body) return `■ ${who} · ${t.title}\n${body.replace(/^\[AI 정기업무 결과[^\n]*\n[^\n]*\n\n/, "").split("\n\n[업무 지시]")[0].slice(0, 1400)}`;
        if (t.agent_status === "실패") return `■ ${who} · ${t.title}\n실행 실패: ${t.agent_error ?? "-"}`;
        return `■ ${who} · ${t.title}\n오늘 결과 없음(상태: ${t.agent_status ?? "수동"})`;
      });
    return `[오늘 정기업무 결과 · ${blocks.length}건]\n${blocks.join("\n\n")}`;
  },
});

export const CONTEXT_KEYS = Object.keys(CONTEXT_BUILDERS);

export function buildRoutinePrompt(r: Pick<RoutineRow, "agent_key" | "title" | "instructions">, today: string, context: string) {
  const persona = AGENT_PERSONA[r.agent_key] ?? "운호컴퍼니 AI 직원.";
  const system = `너는 ${persona}
매일·매주 정해진 정기 업무를 처리해 대표에게 보고한다.
${HARD_RULES}
추가 규칙:
- 아래 [참고 데이터]에 있는 사실만 쓴다. 데이터에 없는 수치·거래처·일정을 만들지 않는다.
- 데이터가 없거나 부족하면 그 사실을 첫 줄에 쓰고, 어떤 데이터를 누가 입력해야 하는지 적는다.
- 보고서 말투로 짧게 쓴다. 마크다운 표 대신 줄 단위 목록을 쓴다(업무 본문으로 표시된다).
- '다음 액션'은 한 줄에 하나씩 '- 항목 · 담당 · 기한(YYYY-MM-DD)' 형식으로 쓴다. 업무 체크리스트로 옮겨진다.`;

  const user = `[오늘] ${today}
[업무] ${r.title}
[지시] ${r.instructions}

[참고 데이터]
${context}

다음 구조로 작성한다.
1. 결론 (3줄 이내)
2. 상세
3. 대표 확인 필요 (없으면 "없음")
4. 다음 액션 (항목 · 담당 · 기한)`;
  return { system, user };
}

export type RoutineRunResult = { todoId: string; title: string; ok: boolean; error?: string };

export const RESULT_MARK = "[AI 정기업무 결과";

type CheckItem = { id: string; text: string; done: boolean; due?: string };

/** 보고서의 '다음 액션' 절을 업무 체크리스트 항목으로 바꾼다(최대 8개). */
export function parseNextActions(text: string, idSeed = Date.now()): CheckItem[] {
  const m = text.match(/(?:^|\n)\s*(?:#+\s*)?(?:4[.)]\s*)?\**\s*다음 액션[^\n]*\n([\s\S]*)$/);
  if (!m) return [];
  const items: CheckItem[] = [];
  for (const raw of m[1].split("\n")) {
    const line = raw.trim();
    const t = line.replace(/^(?:[-•*]|\d+[.)])\s*/, "").replace(/\*\*/g, "").trim();
    if (!t || t === line && !/^[-•*]|^\d+[.)]/.test(line)) continue;
    if (/^(없음|해당 없음)\.?$/.test(t)) continue;
    const due = t.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
    items.push({ id: `ai-${idSeed.toString(36)}-${items.length}`, text: t.slice(0, 200), done: false, ...(due ? { due } : {}) });
    if (items.length >= 8) break;
  }
  return items;
}

/** 업무 본문(note): 결과 보고서 + 원래 지시문. */
export function buildResultNote(today: string, model: string, text: string, instructions: string) {
  return `${RESULT_MARK} · ${today} · ${model}]\n사내 검토용 초안입니다. 대외 발송·금액 확정 전 사람이 확인합니다.\n\n${text.trim()}\n\n[업무 지시] ${instructions}`;
}

/** 루틴 투두 1건 실행 */
export async function runRoutineTodo(todoId: string): Promise<RoutineRunResult> {
  const svc = createSupabaseServiceClient();
  const today = seoulToday();

  const { data: todo } = await svc
    .from("todos")
    .select("id, title, status, routine_id, agent_status, assignee_user_id, checklist")
    .eq("id", todoId)
    .maybeSingle();
  if (!todo || !todo.routine_id) return { todoId, title: "?", ok: false, error: "정기업무 투두가 아닙니다." };

  const { data: routine } = await svc.from("agent_routines").select(ROUTINE_SELECT).eq("id", todo.routine_id).maybeSingle();
  if (!routine) return { todoId, title: todo.title, ok: false, error: "루틴을 찾을 수 없습니다." };
  const r = routine as RoutineRow;

  // 실행 잠금: 대기/실패 상태에서만 실행중으로 바꾼다(동시 실행 방지).
  const { data: locked } = await svc
    .from("todos")
    .update({ agent_status: "실행중", agent_run_at: new Date().toISOString(), status: "진행" })
    .eq("id", todoId)
    .in("agent_status", ["대기", "실패"])
    .select("id");
  if (!locked || locked.length === 0) return { todoId, title: todo.title, ok: false, error: "이미 실행 중이거나 완료된 업무입니다." };

  try {
    const keys = (r.context_keys ?? []).filter((k) => CONTEXT_BUILDERS[k]);
    const ctxParts = await Promise.all(
      keys.map((k) => CONTEXT_BUILDERS[k](svc, today).catch(() => `[${k}] 읽기 실패`))
    );
    const { system, user } = buildRoutinePrompt(r, today, ctxParts.join("\n\n") || "지정된 참고 데이터 없음");

    const anthropic = await getAnthropic();
    const { msg, model } = await createMessageWithFallback(anthropic, {
      max_tokens: 1800,
      system,
      messages: [{ role: "user", content: user }],
    });
    const text = extractText(msg);
    if (!text) throw new Error("빈 응답");

    // 결과는 댓글이 아니라 업무 자체에 쓴다: 본문(note) = 보고서, 체크리스트 = 다음 액션.
    const prev = Array.isArray((todo as { checklist?: unknown }).checklist) ? ((todo as { checklist: CheckItem[] }).checklist) : [];
    const actions = parseNextActions(text).filter((a) => !prev.some((p) => p.text === a.text));
    await svc
      .from("todos")
      .update({
        note: buildResultNote(today, model, text, r.instructions),
        checklist: [...prev, ...actions],
        agent_status: "완료",
        agent_error: null,
        progress: r.requires_review ? 90 : 100,
        status: r.requires_review ? "진행" : "완료",
        completed_at: r.requires_review ? null : new Date().toISOString(),
      })
      .eq("id", todoId);
    await notifyCeoIfNeeded(svc, r.id, todoId, todo.title, text);
    return { todoId, title: todo.title, ok: true };
  } catch (e) {
    const err = friendlyAiError(e).slice(0, 500);
    await svc.from("todos").update({ agent_status: "실패", agent_error: err, status: "예정" }).eq("id", todoId);
    return { todoId, title: todo.title, ok: false, error: err };
  }
}

/** 루틴에 notify_ceo가 켜져 있으면 대표에게 인앱·푸시 알림. 0101 미적용이면 조용히 건너뛴다. */
async function notifyCeoIfNeeded(svc: Svc, routineId: string, todoId: string, title: string, text: string) {
  try {
    const { data: opt, error } = await svc.from("agent_routines").select("notify_ceo").eq("id", routineId).maybeSingle();
    if (error || !(opt as { notify_ceo?: boolean } | null)?.notify_ceo) return;
    const ceoEmail = (process.env.CEO_EMAIL || process.env.CEO_TODO_EMAIL || "seohoo628@gmail.com").toLowerCase();
    let { data: ceo } = await svc.from("users").select("id").eq("email", ceoEmail).maybeSingle();
    if (!ceo) ({ data: ceo } = await svc.from("users").select("id").eq("is_ceo", true).limit(1).maybeSingle());
    const ceoId = (ceo as { id?: string } | null)?.id;
    if (!ceoId) return;
    const { notifyUsers } = await import("@/lib/notify");
    const summary = text.replace(/\s+/g, " ").slice(0, 140);
    await notifyUsers({ userIds: [ceoId], type: "agent_report", title: `AI ${title}`, body: summary, link: "/todos" });
  } catch {
    /* 알림 실패는 실행 결과에 영향 주지 않는다 */
  }
}

/** 같은 날 다른 루틴이 끝난 뒤에 실행할 루틴(run_last) id. 0101 미적용이면 빈 목록. */
async function runLastRoutineIds(svc: Svc): Promise<string[]> {
  const { data, error } = await svc.from("agent_routines").select("id").eq("run_last", true);
  if (error) return [];
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

/** 실행 대기 중인 루틴 투두를 최대 limit건 병렬 실행(서버 함수 제한시간 대응). 실패 건은 다음 회차에 재시도한다. */
export async function runPendingRoutineTodos(limit = 6): Promise<RoutineRunResult[]> {
  const svc = createSupabaseServiceClient();
  const today = seoulToday();
  // 대기: 마감 7일 경과 전까지 실행. 실패: 마감일 전까지만 재시도(키 오류 등으로 무한 재호출 방지).
  const lastIds = await runLastRoutineIds(svc);
  const notLast = (q: any) => (lastIds.length ? q.not("routine_id", "in", `(${lastIds.join(",")})`) : q);
  const [waiting, failed, running] = await Promise.all([
    notLast(svc.from("todos").select("id, due_date").eq("agent_status", "대기").in("status", ["예정", "진행"])
      .gte("due_date", addDays(today, -7))).order("due_date", { ascending: true }).limit(limit),
    notLast(svc.from("todos").select("id, due_date").eq("agent_status", "실패").in("status", ["예정", "진행"])
      .gte("due_date", today)).order("due_date", { ascending: true }).limit(limit),
    // 15분 넘게 실행중이면 멈춘 것으로 보고 보고서 실행을 막지 않는다.
    notLast(svc.from("todos").select("id").eq("agent_status", "실행중")
      .gte("agent_run_at", new Date(Date.now() - 15 * 60 * 1000).toISOString())).limit(1),
  ]);
  let ids = [...((waiting.data ?? []) as { id: string }[]), ...((failed.data ?? []) as { id: string }[])]
    .map((x) => x.id)
    .slice(0, limit);
  // 다른 부서 업무가 모두 끝났을 때만 일일 보고(run_last)를 실행한다.
  if (ids.length === 0 && lastIds.length && (running.data ?? []).length === 0) {
    const { data: last } = await svc.from("todos").select("id").in("routine_id", lastIds)
      .in("agent_status", ["대기", "실패"]).in("status", ["예정", "진행"]).gte("due_date", today).limit(limit);
    ids = ((last ?? []) as { id: string }[]).map((x) => x.id);
  }
  const settled = await Promise.allSettled(ids.map((id) => runRoutineTodo(id)));
  return settled.map((s, i) =>
    s.status === "fulfilled" ? s.value : { todoId: ids[i], title: "?", ok: false, error: String(s.reason).slice(0, 200) }
  );
}
