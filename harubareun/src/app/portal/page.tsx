import { requireAppUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/time";
import PortalTaskCard, { type PortalTask } from "@/components/PortalTaskCard";
import type { PurchaseOrder } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PortalPage() {
  await requireAppUser();
  const supabase = createSupabaseServerClient();

  // RLS 가 자기 배정 업무 / 자기 발주만 반환한다.
  const [{ data: tasks }, { data: pos }] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, status, note, due_date, brands(name), attachments(file_name, created_at)")
      .eq("assignee_kind", "vendor")
      .order("created_at", { ascending: false }),
    supabase
      .from("purchase_orders")
      .select("*, brands(name)")
      .order("po_date", { ascending: false, nullsFirst: false }),
  ]);

  const taskList: PortalTask[] = (tasks ?? []).map((t) => {
    const r = t as unknown as {
      id: string;
      title: string;
      status: string;
      note: string | null;
      due_date: string | null;
      brands: { name: string } | null;
      attachments: { file_name: string | null; created_at: string }[] | null;
    };
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      note: r.note,
      dueDate: r.due_date,
      brandName: r.brands?.name ?? null,
      attachments: r.attachments ?? [],
    };
  });

  const poList = (pos ?? []) as unknown as (PurchaseOrder & {
    brands: { name: string } | null;
  })[];

  return (
    <div>
      <h1 style={{ fontSize: 22 }}>배정 업무</h1>
      <p className="muted" style={{ marginTop: 4, marginBottom: 18 }}>
        배정된 업무만 보입니다. 다른 업체 정보나 단가는 열람할 수 없습니다.
      </p>

      {taskList.length === 0 ? (
        <div className="card empty">배정된 업무가 없습니다.</div>
      ) : (
        taskList.map((t) => <PortalTaskCard key={t.id} task={t} />)
      )}

      <div className="section-title">정산 현황</div>
      <div className="card" style={{ padding: 0 }}>
        {poList.length === 0 ? (
          <div className="empty">정산 대상 발주가 없습니다.</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>발주번호</th>
                <th>발주일</th>
                <th>품목</th>
                <th>수량</th>
                <th>상태</th>
                <th>지급일</th>
              </tr>
            </thead>
            <tbody>
              {poList.map((p) => (
                <tr key={p.id}>
                  <td>{p.po_number ?? "-"}</td>
                  <td>{fmtDate(p.po_date)}</td>
                  <td>{p.item ?? "-"}</td>
                  <td>{p.order_qty ?? "-"}</td>
                  <td>
                    <span className="badge">{p.status}</span>
                  </td>
                  <td>{fmtDate(p.payment_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
