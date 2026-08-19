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
};

const err = (error: string, code = 400) => NextResponse.json({ ok: false, error }, { status: code });

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
  if (body.action !== "save") return err("알 수 없는 요청입니다");

  const supabase = createSupabaseServerClient();
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
