import { NextResponse } from "next/server";
import { getAppUserOrNull } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 커머스 마케팅 인터뷰지(public/commerce-interview) 저장소.
 * 화면 자체는 로그인 없이 계산기로 쓸 수 있고, 문서 저장·불러오기만 로그인을 요구한다.
 * 저장 실패 시 화면은 localStorage 로 알아서 되돌아간다.
 */

type SaveBody = {
  action?: string;
  doc?: string;
  status?: string;
  summary?: Record<string, unknown>;
  state?: Record<string, unknown>;
  // 계획 대비 실적 기록
  productIdx?: number;
  rows?: ActualRow[];
  // 타임블럭 → 업무 투두 내보내기
  brandSlug?: string;
  todos?: TodoRow[];
};

type ActualRow = {
  week_no?: number;
  week_start?: string;
  sales_qty?: number | null;
  reviews?: number | null;
  rank_pos?: number | null;
  revenue?: number | null;
  note?: string | null;
};

type TodoRow = { title?: string; due_date?: string; note?: string };

const err = (error: string, code = 400) => NextResponse.json({ ok: false, error }, { status: code });

/** 빈 문자열·null 은 null 로, 나머지는 숫자로. 실적 입력칸이 비어 있을 수 있다. */
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const stamp = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });

/** UNHO2026.0819.0001 — 같은 날 발번된 문서 수 +1 */
async function nextDocNo(
  supabase: ReturnType<typeof createSupabaseServerClient>
): Promise<string> {
  const now = new Date();
  const y = now.getFullYear();
  const mmdd = String(now.getMonth() + 1).padStart(2, "0") + String(now.getDate()).padStart(2, "0");
  const prefix = `UNHO${y}.${mmdd}.`;
  const { data } = await supabase
    .from("commerce_interviews")
    .select("doc_no")
    .like("doc_no", `${prefix}%`)
    .order("doc_no", { ascending: false })
    .limit(1);
  const last = (data as { doc_no: string }[] | null)?.[0]?.doc_no;
  const seq = last ? Number(last.slice(prefix.length)) + 1 : 1;
  return prefix + String(Number.isFinite(seq) ? seq : 1).padStart(4, "0");
}

export async function GET(request: Request) {
  const user = await getAppUserOrNull();
  if (!user) return err("로그인이 필요합니다", 401);
  if (!["owner", "staff"].includes(user.role)) return err("권한이 없습니다", 403);

  const supabase = createSupabaseServerClient();
  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "list";

  if (action === "load") {
    const doc = url.searchParams.get("doc");
    if (!doc) return err("문서번호가 없습니다");
    const { data, error } = await supabase
      .from("commerce_interviews")
      .select("doc_no, status, ver, state, updated_at")
      .eq("doc_no", doc)
      .maybeSingle();
    if (error) return err(error.message, 500);
    if (!data) return err("문서를 찾을 수 없습니다", 404);
    return NextResponse.json({
      ok: true,
      doc: data.doc_no,
      status: data.status,
      ver: data.ver,
      at: stamp(data.updated_at),
      state: data.state,
    });
  }

  // ── 자사 실적: 브랜드의 최근 N일 performance 합계를 인터뷰지 "현재" 값으로 준다.
  if (action === "perf") {
    const slug = url.searchParams.get("brand");
    if (!slug) return err("브랜드가 없습니다");
    const days = Math.min(180, Math.max(7, Number(url.searchParams.get("days")) || 30));
    const { data: brand } = await supabase
      .from("brands")
      .select("id, name")
      .eq("slug", slug)
      .maybeSingle();
    if (!brand) return err("브랜드를 찾을 수 없습니다", 404);
    const since = new Date();
    since.setDate(since.getDate() - days);
    const { data, error } = await supabase
      .from("performance")
      .select("channel, reach, conversions, revenue, recorded_at")
      .eq("brand_id", (brand as { id: string }).id)
      .gte("recorded_at", since.toISOString().slice(0, 10));
    if (error) return err(error.message, 500);
    const rows = (data ?? []) as { channel: string | null; reach: number | null; conversions: number | null; revenue: number | null }[];
    const sum = (k: "reach" | "conversions" | "revenue") =>
      rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
    // 기록 기간이 30일과 다르면 30일 기준으로 환산해 "월" 값으로 맞춘다.
    const scale = 30 / days;
    return NextResponse.json({
      ok: true,
      brand: (brand as { name: string }).name,
      days,
      count: rows.length,
      reach: Math.round(sum("reach") * scale),
      conversions: Math.round(sum("conversions") * scale),
      revenue: Math.round(sum("revenue") * scale),
      channels: [...new Set(rows.map((r) => r.channel).filter(Boolean))],
    });
  }

  // ── 계획 대비 실적: 문서·제품의 주차별 기록.
  if (action === "actuals") {
    const doc = url.searchParams.get("doc");
    if (!doc) return err("문서번호가 없습니다");
    const idx = Number(url.searchParams.get("productIdx")) || 0;
    const { data, error } = await supabase
      .from("commerce_interview_actuals")
      .select("week_no, week_start, sales_qty, reviews, rank_pos, revenue, note")
      .eq("doc_no", doc)
      .eq("product_idx", idx)
      .order("week_no");
    if (error) return err(error.message, 500);
    return NextResponse.json({ ok: true, rows: data ?? [] });
  }

  const { data, error } = await supabase
    .from("commerce_interviews")
    .select("doc_no, client, product, status, ver, summary, updated_at")
    .order("updated_at", { ascending: false })
    .limit(60);
  if (error) return err(error.message, 500);

  const items = (data ?? []).map((r) => {
    const s = (r.summary ?? {}) as Record<string, string>;
    return {
      doc: r.doc_no,
      client: r.client,
      product: r.product,
      cName: s.cName ?? "",
      cPhone: s.cPhone ?? "",
      status: r.status,
      ver: r.ver,
      at: stamp(r.updated_at),
    };
  });
  return NextResponse.json({ ok: true, items });
}

export async function POST(request: Request) {
  const user = await getAppUserOrNull();
  if (!user) return err("로그인이 필요합니다", 401);
  if (!["owner", "staff"].includes(user.role)) return err("권한이 없습니다", 403);

  let body: SaveBody;
  try {
    body = (await request.json()) as SaveBody;
  } catch {
    return err("본문을 읽을 수 없습니다");
  }
  const supabase = createSupabaseServerClient();

  // ── 계획 대비 실적 저장(주차 단위 upsert). 값이 전부 빈 주차는 지운다.
  if (body.action === "save-actuals") {
    const doc = (body.doc ?? "").trim();
    if (!doc) return err("문서를 먼저 저장해야 실적을 기록할 수 있습니다");
    const idx = Number(body.productIdx) || 0;
    const rows = (body.rows ?? []).filter((r) => Number.isFinite(Number(r.week_no)) && r.week_start);
    const filled = rows.filter(
      (r) => [r.sales_qty, r.reviews, r.rank_pos, r.revenue].some((v) => v !== null && v !== undefined && v !== ("" as unknown)) || (r.note ?? "").trim()
    );
    const empty = rows.filter((r) => !filled.includes(r)).map((r) => Number(r.week_no));

    if (filled.length) {
      const { error } = await supabase.from("commerce_interview_actuals").upsert(
        filled.map((r) => ({
          doc_no: doc,
          product_idx: idx,
          week_no: Number(r.week_no),
          week_start: r.week_start,
          sales_qty: num(r.sales_qty),
          reviews: num(r.reviews),
          rank_pos: num(r.rank_pos),
          revenue: num(r.revenue),
          note: (r.note ?? "").trim() || null,
          created_by: user.id,
        })),
        { onConflict: "doc_no,product_idx,week_no" }
      );
      if (error) return err(error.message, 500);
    }
    if (empty.length) {
      await supabase
        .from("commerce_interview_actuals")
        .delete()
        .eq("doc_no", doc)
        .eq("product_idx", idx)
        .in("week_no", empty);
    }
    return NextResponse.json({ ok: true, saved: filled.length, removed: empty.length });
  }

  // ── 타임블럭 마일스톤을 업무 투두로 내보낸다.
  if (body.action === "export-todos") {
    const list = (body.todos ?? []).filter((t) => (t.title ?? "").trim());
    if (!list.length) return err("내보낼 항목이 없습니다");
    let brandId: string | null = null;
    const slug = (body.brandSlug ?? "").trim();
    if (slug) {
      const { data } = await supabase.from("brands").select("id").eq("slug", slug).maybeSingle();
      brandId = (data as { id: string } | null)?.id ?? null;
    }
    const { data, error } = await supabase
      .from("todos")
      .insert(
        list.slice(0, 60).map((t) => ({
          brand_id: brandId,
          title: (t.title ?? "").trim().slice(0, 200),
          due_date: /^\d{4}-\d{2}-\d{2}$/.test(t.due_date ?? "") ? t.due_date : null,
          note: (t.note ?? "").trim() || null,
          status: "예정",
          created_by: user.id,
        }))
      )
      .select("id");
    if (error) return err(error.message, 500);
    return NextResponse.json({ ok: true, created: (data ?? []).length });
  }

  if (body.action !== "save") return err("알 수 없는 요청입니다");

  const summary = (body.summary ?? {}) as Record<string, string>;
  const client = (summary.client ?? "").trim();
  if (!client) return err("브랜드·거래처명이 비어 있습니다");

  const status = ["임시저장", "검토", "확정", "보관"].includes(body.status ?? "")
    ? (body.status as string)
    : "임시저장";

  const row = {
    client,
    product: (summary.product ?? "").trim(),
    brand_slug: (summary.brandSlug ?? "").trim() || null,
    status,
    summary,
    state: body.state ?? {},
    updated_by: user.id,
  };

  const doc = (body.doc ?? summary.doc ?? "").trim();
  if (doc) {
    const { data: cur } = await supabase
      .from("commerce_interviews")
      .select("ver")
      .eq("doc_no", doc)
      .maybeSingle();
    if (cur) {
      const ver = ((cur as { ver: number }).ver ?? 0) + 1;
      const { data, error } = await supabase
        .from("commerce_interviews")
        .update({ ...row, ver })
        .eq("doc_no", doc)
        .select("doc_no, ver, updated_at")
        .single();
      if (error) return err(error.message, 500);
      return NextResponse.json({ ok: true, doc: data.doc_no, ver: data.ver, at: stamp(data.updated_at) });
    }
  }

  const docNo = doc || (await nextDocNo(supabase));
  const { data, error } = await supabase
    .from("commerce_interviews")
    .insert({ ...row, doc_no: docNo, ver: 1, created_by: user.id })
    .select("doc_no, ver, updated_at")
    .single();
  if (error) return err(error.message, 500);
  return NextResponse.json({ ok: true, doc: data.doc_no, ver: data.ver, at: stamp(data.updated_at) });
}
