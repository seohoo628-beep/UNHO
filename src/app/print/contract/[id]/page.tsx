import { notFound, redirect } from "next/navigation";
import { requireAppUser } from "@/lib/auth";
import { canViewFinance } from "@/lib/finance";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

// 계약서 본문 인쇄용(A4). 브라우저 인쇄 → 'PDF로 저장'. 2부 출력해 갑·을 각 1부 보관.
export default async function PrintContract({ params }: { params: { id: string } }) {
  const user = await requireAppUser();
  if (!canViewFinance(user)) redirect("/hub");
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.from("contracts").select("title, body").eq("id", params.id).maybeSingle();
  const c = data as { title: string; body: string | null } | null;
  if (!c) notFound();
  return (
    <div style={{ position: "fixed", inset: 0, overflow: "auto", background: "#fff", color: "#111", fontFamily: "Pretendard, 'Malgun Gothic', serif", zIndex: 1 }}>
      <style>{`@page{size:A4;margin:20mm} @media print{.noprint{display:none} html,body{background:#fff!important}}`}</style>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
        <div className="noprint" style={{ textAlign: "right", marginBottom: 12 }}><PrintButton /></div>
        {c.body ? (
          <div style={{ whiteSpace: "pre-wrap", fontSize: 13.5, lineHeight: 1.85 }}>{c.body}</div>
        ) : (
          <p>{c.title}: 저장된 계약서 본문이 없습니다. 계약서 관리에서 본문을 작성·저장하세요.</p>
        )}
      </div>
    </div>
  );
}
