import { redirect } from "next/navigation";
import { requireAppUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { seoulToday } from "@/lib/time";
import DataImportForm from "@/components/DataImportForm";

export const dynamic = "force-dynamic";

type Cs = { id: string; received_at: string; channel: string | null; category: string | null; content: string; status: string };
type Ship = { id: string; ship_date: string; channel: string | null; item: string; qty: number; carrier: string | null; status: string };

// 비어 있던 CS 문의·출고·공구 리드를 엑셀/CSV 붙여넣기로 채운다. 이 데이터를 CS·물류·공구 AI 직원이 매일 읽는다.
export default async function DataImportPage() {
  const user = await requireAppUser();
  if (user.role !== "owner" && user.role !== "staff") redirect("/hub");
  const supabase = createSupabaseServerClient();
  const [cs, ship, crm] = await Promise.all([
    supabase.from("cs_inquiries").select("id, received_at, channel, category, content, status").order("received_at", { ascending: false }).limit(15),
    supabase.from("shipments").select("id, ship_date, channel, item, qty, carrier, status").order("ship_date", { ascending: false }).limit(15),
    supabase.from("crm_leads").select("id", { count: "exact", head: true }),
  ]);
  const missing = [cs.error && "cs_inquiries", ship.error && "shipments", crm.error && "crm_leads"].filter(Boolean) as string[];
  const csRows = (cs.data ?? []) as Cs[];
  const shipRows = (ship.data ?? []) as Ship[];
  const open = csRows.filter((r) => r.status !== "완료").length;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>데이터 입력 (CS·출고·공구)</h1>
          <p>엑셀·CSV를 붙여넣으면 CS 문의, 출고 내역, 공구·입점 리드로 저장됩니다. 저장된 자료는 CS·물류·공구 AI 직원이 매일 아침 읽고 보고합니다.</p>
        </div>
      </div>

      {missing.length > 0 && (
        <div className="card" style={{ borderLeft: "4px solid var(--warn)", marginBottom: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>DB 준비 필요</div>
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
            없는 테이블: <span className="mono">{missing.join(", ")}</span>. Supabase SQL Editor에서 <span className="mono">supabase/migrations/0102_platform_upgrade.sql</span>을 실행하세요.
          </p>
        </div>
      )}

      <DataImportForm today={seoulToday()} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 }}>
        <div className="card" style={{ margin: 0 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>최근 CS 문의 · 미완료 {open}건</div>
          {csRows.length === 0 ? <div className="empty">아직 없습니다.</div> : csRows.map((r) => (
            <div key={r.id} style={{ fontSize: 12.5, padding: "5px 0", borderTop: "1px solid var(--line)" }}>
              <span className={`badge ${r.status === "완료" ? "ok" : r.status === "처리중" ? "warn" : "owner"}`} style={{ marginRight: 6 }}>{r.status}</span>
              <span className="muted">{r.received_at} · {r.channel ?? "-"} · {r.category ?? "-"}</span>
              <div style={{ marginTop: 2, wordBreak: "break-word" }}>{r.content.slice(0, 140)}</div>
            </div>
          ))}
        </div>
        <div className="card" style={{ margin: 0 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>최근 출고</div>
          {shipRows.length === 0 ? <div className="empty">아직 없습니다.</div> : shipRows.map((r) => (
            <div key={r.id} style={{ fontSize: 12.5, padding: "5px 0", borderTop: "1px solid var(--line)" }}>
              <span className="muted">{r.ship_date} · {r.channel ?? "-"} · {r.carrier ?? "-"}</span>
              <div>{r.item} × {r.qty} <span className={`badge ${r.status === "지연" || r.status === "반품" ? "owner" : ""}`}>{r.status}</span></div>
            </div>
          ))}
        </div>
      </div>
      {!crm.error && <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>공구·입점 리드 {crm.count ?? 0}건 · 상세 관리는 <a href="/crm">셀러·바이어 CRM</a>에서 합니다.</p>}
    </div>
  );
}
