import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import SearchBox from "@/components/SearchBox";
import Link from "next/link";

export const dynamic = "force-dynamic";

type Hit = { title: string; sub?: string | null; link: string };
type Group = { label: string; icon: string; hits: Hit[] };

// PostgREST or() 검색어 안전 처리(콤마·괄호 제거).
function safe(q: string): string {
  return q.replace(/[,()%]/g, " ").trim();
}

export default async function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");
  const supabase = createSupabaseServerClient();

  const qRaw = (searchParams.q ?? "").trim();
  const q = safe(qRaw);
  const like = `%${q}%`;

  const groups: Group[] = [];
  let total = 0;

  if (q.length >= 1) {
    // 각 검색은 실패해도(테이블/컬럼 없음) 조용히 건너뛴다.
    const run = async (fn: () => Promise<Hit[]>): Promise<Hit[]> => {
      try {
        return await fn();
      } catch {
        return [];
      }
    };

    const [todos, ceo, meetings, pdev, inv, appr, crm, vendors] = await Promise.all([
      run(async () => {
        const { data } = await supabase
          .from("todos")
          .select("id, title, note, status")
          .or(`title.ilike.${like},note.ilike.${like}`)
          .limit(20);
        return ((data ?? []) as { id: string; title: string; note: string | null; status: string }[]).map((t) => ({
          title: t.title,
          sub: `${t.status}${t.note ? " · " + t.note : ""}`,
          link: "/todos",
        }));
      }),
      run(async () => {
        // ceo_todos는 RLS로 대표만 결과가 나온다.
        const { data } = await supabase.from("ceo_todos").select("id, text, pri").ilike("text", like).limit(20);
        return ((data ?? []) as { id: string; text: string; pri: string }[]).map((t) => ({
          title: t.text,
          sub: t.pri,
          link: "/ceo-todos",
        }));
      }),
      run(async () => {
        const { data } = await supabase
          .from("meetings")
          .select("id, title, meeting_date")
          .or(`title.ilike.${like},body.ilike.${like},ai_summary.ilike.${like}`)
          .limit(20);
        return ((data ?? []) as { id: string; title: string; meeting_date: string | null }[]).map((m) => ({
          title: m.title,
          sub: m.meeting_date,
          link: "/meetings",
        }));
      }),
      run(async () => {
        const { data } = await supabase
          .from("product_developments")
          .select("id, name, category, stage")
          .or(`name.ilike.${like},note.ilike.${like},category.ilike.${like}`)
          .limit(20);
        return ((data ?? []) as { id: string; name: string; category: string | null; stage: string }[]).map((p) => ({
          title: p.name,
          sub: `${p.stage}${p.category ? " · " + p.category : ""}`,
          link: "/product-dev",
        }));
      }),
      run(async () => {
        const { data } = await supabase
          .from("inventory_items")
          .select("id, item")
          .or(`item.ilike.${like},note.ilike.${like}`)
          .limit(20);
        return ((data ?? []) as { id: string; item: string }[]).map((i) => ({ title: i.item, link: "/inventory" }));
      }),
      run(async () => {
        const { data } = await supabase
          .from("approval_requests")
          .select("id, title, kind, status")
          .or(`title.ilike.${like},body.ilike.${like}`)
          .limit(20);
        return ((data ?? []) as { id: string; title: string; kind: string; status: string }[]).map((a) => ({
          title: a.title,
          sub: `${a.kind} · ${a.status}`,
          link: "/e-approval",
        }));
      }),
      run(async () => {
        const { data } = await supabase
          .from("crm_leads")
          .select("id, name, product, stage")
          .or(`name.ilike.${like},product.ilike.${like},note.ilike.${like}`)
          .limit(20);
        return ((data ?? []) as { id: string; name: string; product: string | null; stage: string }[]).map((l) => ({
          title: l.name,
          sub: `${l.stage}${l.product ? " · " + l.product : ""}`,
          link: "/crm",
        }));
      }),
      run(async () => {
        const { data } = await supabase
          .from("vendors")
          .select("id, name, code")
          .or(`name.ilike.${like},code.ilike.${like}`)
          .limit(20);
        return ((data ?? []) as { id: string; name: string; code: string | null }[]).map((v) => ({
          title: v.name,
          sub: v.code,
          link: "/vendors",
        }));
      }),
    ]);

    const push = (label: string, icon: string, hits: Hit[]) => {
      if (hits.length) {
        groups.push({ label, icon, hits });
        total += hits.length;
      }
    };
    push("업무투두", "📋", todos);
    push("CEO 투두", "🔒", ceo);
    push("미팅·회의", "📝", meetings);
    push("제품개발", "🧪", pdev);
    push("재고", "📦", inv);
    push("전자결재", "📑", appr);
    push("CRM", "🤝", crm);
    push("거래처", "🏭", vendors);
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>통합 검색</h1>
          <p>업무·CEO투두·미팅·제품개발·재고·전자결재·CRM·거래처를 한 번에 검색한다.</p>
        </div>
      </div>

      <div style={{ marginBottom: 16, maxWidth: 520 }}>
        <SearchBox initial={qRaw} />
      </div>

      {qRaw.length === 0 ? (
        <div className="card"><div className="empty">검색어를 입력하세요.</div></div>
      ) : total === 0 ? (
        <div className="card"><div className="empty">&ldquo;{qRaw}&rdquo;에 대한 결과가 없습니다.</div></div>
      ) : (
        <>
          <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>총 {total}건</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {groups.map((g) => (
              <div key={g.label} className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ padding: "9px 14px", background: "var(--surface-2, #f5f6f8)", fontWeight: 600, fontSize: 13.5 }}>
                  {g.icon} {g.label} <span className="muted" style={{ fontWeight: 400 }}>· {g.hits.length}</span>
                </div>
                <div>
                  {g.hits.map((h, i) => (
                    <Link
                      key={i}
                      href={h.link}
                      style={{
                        display: "block",
                        padding: "10px 14px",
                        borderTop: "1px solid var(--line, #eef0f2)",
                        color: "var(--ink)",
                        textDecoration: "none",
                      }}
                    >
                      <div style={{ fontSize: 14 }}>{h.title}</div>
                      {h.sub && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{h.sub}</div>}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
