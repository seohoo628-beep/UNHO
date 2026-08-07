"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { requireAppUser } from "@/lib/auth";
import { sendEmail, escapeHtml } from "@/lib/email";

type Result = { ok: boolean; error?: string };

// ── 전직원 투두 변경 알림 메일 ────────────────────────────────
// 업무 등록/수정/완료 시 대표 이메일로 발송. 메일 실패가 저장을 막지 않도록 전부 try/catch.
type TodoNotify = {
  title: string;
  brandId: string | null;
  priority: string;
  dueDate: string | null;
  status: string;
  refLink: string | null;
  note: string | null;
  assigneeIds: string[];
};

async function notifyTodoEvent(kind: "등록" | "수정" | "완료", t: TodoNotify, actorName: string): Promise<void> {
  try {
    if (!process.env.RESEND_API_KEY) return; // 메일 미설정이면 조용히 skip
    let assignees = "미지정";
    let brand = "-";
    try {
      const svc = createSupabaseServiceClient();
      if (t.assigneeIds.length) {
        const { data } = await svc.from("users").select("id,name").in("id", t.assigneeIds);
        const map = new Map(((data ?? []) as { id: string; name: string | null }[]).map((u) => [u.id, u.name]));
        assignees = t.assigneeIds.map((id) => map.get(id) || "이름미상").join(", ");
      }
      if (t.brandId) {
        const { data } = await svc.from("brands").select("name").eq("id", t.brandId).maybeSingle();
        brand = (data as { name?: string } | null)?.name || "-";
      }
    } catch {
      /* 이름 조회 실패해도 메일은 보냄 */
    }

    const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
    const emoji = kind === "완료" ? "✅" : kind === "등록" ? "🆕" : "✏️";
    const rows: [string, string][] = [
      ["상태", t.status],
      ["우선순위", t.priority],
      ["담당자", assignees],
      ["브랜드", brand],
      ["마감일", t.dueDate || "-"],
      ["메모", t.note || "-"],
      ["처리자", actorName],
      ["시각", now],
    ];
    const trs = rows
      .map(
        ([k, v]) =>
          `<tr><td style="padding:6px 10px;color:#6b7280;white-space:nowrap;vertical-align:top">${escapeHtml(k)}</td><td style="padding:6px 10px;color:#111827">${escapeHtml(v)}</td></tr>`
      )
      .join("");
    const linkHtml = t.refLink
      ? `<p style="margin:12px 0 0"><a href="${escapeHtml(t.refLink)}" style="color:#2563eb">🔗 참고 링크</a></p>`
      : "";
    const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto">
      <p style="font-size:13px;color:#6b7280;margin:0 0 6px">전직원 업무투두 · ${escapeHtml(kind)}</p>
      <h2 style="margin:0 0 14px;font-size:18px;color:#111827">${emoji} ${escapeHtml(t.title)}</h2>
      <table style="border-collapse:collapse;width:100%;font-size:14px;border:1px solid #e5e7eb;border-radius:8px">${trs}</table>
      ${linkHtml}
      <p style="margin:18px 0 0;font-size:12px;color:#9ca3af">운호컴퍼니 운영 플랫폼 자동 알림</p>
    </div>`;
    await sendEmail({ subject: `[전직원 투두·${kind}] ${t.title}`, html });
  } catch {
    /* 알림 실패는 무시 */
  }
}

async function requireStaff() {
  const user = await requireAppUser();
  if (user.role !== "owner" && user.role !== "staff") return null;
  return user;
}

// assignee_user_ids 컬럼이 아직 없을 때(마이그레이션 전) 나는 오류인지 판별.
function isUndefinedColumn(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42703" || /(assignee_user_ids|file_url|file_name|\bfiles\b)/.test(err.message ?? "");
}

// files_json(FormData) → [{url, name}] 배열
function readFiles(fd: FormData): { url: string; name: string }[] {
  const raw = (fd.get("files_json") as string) || "";
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((f) => ({ url: String(f?.url || ""), name: String(f?.name || "파일") }))
      .filter((f) => f.url);
  } catch {
    return [];
  }
}

// FormData의 assignee_ids(체크박스 다중) → 중복 제거된 문자열 배열.
function readAssigneeIds(fd: FormData): string[] {
  const raw = fd.getAll("assignee_ids") as string[];
  return [...new Set(raw.map((s) => (s || "").trim()).filter(Boolean))];
}

export async function createTodo(fd: FormData): Promise<Result> {
  const user = await requireStaff();
  if (!user) return { ok: false, error: "권한이 없습니다." };

  const title = (fd.get("title") as string)?.trim();
  if (!title) return { ok: false, error: "업무 내용을 입력하세요." };

  const str = (k: string) => {
    const v = (fd.get(k) as string)?.trim();
    return v ? v : null;
  };

  const ids = readAssigneeIds(fd);
  const base = {
    title,
    brand_id: str("brand_id"),
    priority: str("priority") ?? "보통",
    due_date: str("due_date"),
    status: str("status") ?? "예정",
    ref_link: str("ref_link"),
    note: str("note"),
    created_by: user.id,
    assignee_user_id: ids[0] ?? null,
  };
  const files = readFiles(fd);

  const supabase = createSupabaseServerClient();
  // 컬럼 미적용 대비 단계 폴백: 전체 → 파일 제외 → 담당배열까지 제외
  let { error } = await supabase.from("todos").insert({ ...base, assignee_user_ids: ids, files });
  if (error && isUndefinedColumn(error)) {
    ({ error } = await supabase.from("todos").insert({ ...base, assignee_user_ids: ids }));
  }
  if (error && isUndefinedColumn(error)) {
    ({ error } = await supabase.from("todos").insert(base));
  }
  if (error) return { ok: false, error: error.message };

  await notifyTodoEvent(
    "등록",
    {
      title,
      brandId: base.brand_id,
      priority: base.priority,
      dueDate: base.due_date,
      status: base.status,
      refLink: base.ref_link,
      note: base.note,
      assigneeIds: ids,
    },
    user.name || "담당자"
  );

  revalidatePath("/todos");
  return { ok: true };
}

export async function updateTodo(id: string, fd: FormData): Promise<Result> {
  const user = await requireStaff();
  if (!user) return { ok: false, error: "권한이 없습니다." };

  const title = (fd.get("title") as string)?.trim();
  if (!title) return { ok: false, error: "업무 내용을 입력하세요." };

  const str = (k: string) => {
    const v = (fd.get(k) as string)?.trim();
    return v ? v : null;
  };
  const status = str("status") ?? "예정";
  const ids = readAssigneeIds(fd);
  const base = {
    title,
    brand_id: str("brand_id"),
    priority: str("priority") ?? "보통",
    due_date: str("due_date"),
    status,
    completed_at: status === "완료" ? new Date().toISOString() : null,
    ref_link: str("ref_link"),
    note: str("note"),
    updated_at: new Date().toISOString(),
    assignee_user_id: ids[0] ?? null,
  };
  const files = readFiles(fd);

  const supabase = createSupabaseServerClient();
  let { error } = await supabase
    .from("todos")
    .update({ ...base, assignee_user_ids: ids, files })
    .eq("id", id);
  if (error && isUndefinedColumn(error)) {
    ({ error } = await supabase.from("todos").update({ ...base, assignee_user_ids: ids }).eq("id", id));
  }
  if (error && isUndefinedColumn(error)) {
    ({ error } = await supabase.from("todos").update(base).eq("id", id));
  }
  if (error) return { ok: false, error: error.message };

  await notifyTodoEvent(
    status === "완료" ? "완료" : "수정",
    {
      title,
      brandId: base.brand_id,
      priority: base.priority,
      dueDate: base.due_date,
      status,
      refLink: base.ref_link,
      note: base.note,
      assigneeIds: ids,
    },
    user.name || "담당자"
  );

  revalidatePath("/todos");
  return { ok: true };
}

export async function setTodoStatus(id: string, status: string): Promise<Result> {
  const user = await requireStaff();
  if (!user) return { ok: false, error: "권한이 없습니다." };
  const done = status === "완료";
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("todos")
    .update({
      status,
      completed_at: done ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  // 상태 변경 알림 — 저장된 업무 정보를 읽어 메일 구성.
  if (process.env.RESEND_API_KEY) {
    try {
      const sel = "title, brand_id, priority, due_date, ref_link, note, assignee_user_id, assignee_user_ids";
      let row: Record<string, unknown> | null = null;
      const r = await supabase.from("todos").select(sel).eq("id", id).maybeSingle();
      if (r.error) {
        const r2 = await supabase
          .from("todos")
          .select("title, brand_id, priority, due_date, ref_link, note, assignee_user_id")
          .eq("id", id)
          .maybeSingle();
        row = (r2.data as Record<string, unknown>) ?? null;
      } else {
        row = (r.data as Record<string, unknown>) ?? null;
      }
      if (row) {
        const ids = Array.isArray(row.assignee_user_ids)
          ? (row.assignee_user_ids as string[])
          : row.assignee_user_id
          ? [row.assignee_user_id as string]
          : [];
        await notifyTodoEvent(
          done ? "완료" : "수정",
          {
            title: String(row.title ?? "업무"),
            brandId: (row.brand_id as string) ?? null,
            priority: String(row.priority ?? "보통"),
            dueDate: (row.due_date as string) ?? null,
            status,
            refLink: (row.ref_link as string) ?? null,
            note: (row.note as string) ?? null,
            assigneeIds: ids,
          },
          user.name || "담당자"
        );
      }
    } catch {
      /* 알림 실패 무시 */
    }
  }

  revalidatePath("/todos");
  return { ok: true };
}

// 상단 고정 토글.
export async function setTodoPinned(id: string, pinned: boolean): Promise<Result> {
  if (!(await requireStaff())) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("todos").update({ pinned }).eq("id", id);
  if (error) {
    if (error.code === "42703" || /pinned/.test(error.message ?? "")) {
      return { ok: false, error: "고정 컬럼(pinned)이 없습니다. 상단 안내 SQL을 실행하세요." };
    }
    return { ok: false, error: error.message };
  }
  revalidatePath("/todos");
  return { ok: true };
}

// 같은 그룹(담당자+우선순위) 안에서 수동 정렬. 전달된 id 순서대로 sort_order 부여.
export async function reorderTodos(ids: string[]): Promise<Result> {
  const user = await requireStaff();
  if (!user) return { ok: false, error: "권한이 없습니다." };
  const clean = (ids || []).filter(Boolean);
  if (clean.length === 0) return { ok: true };
  const supabase = createSupabaseServerClient();
  const results = await Promise.all(
    clean.map((id, i) => supabase.from("todos").update({ sort_order: i }).eq("id", id))
  );
  const err = results.find((r) => r.error)?.error;
  if (err) {
    if (err.code === "42703" || /sort_order/.test(err.message ?? "")) {
      return { ok: false, error: "정렬 컬럼(sort_order)이 없습니다. 상단 안내 SQL을 실행하세요." };
    }
    return { ok: false, error: err.message };
  }
  revalidatePath("/todos");
  return { ok: true };
}

export async function deleteTodo(id: string): Promise<Result> {
  const user = await requireStaff();
  if (!user) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("todos").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/todos");
  return { ok: true };
}

// ── 최운호 업무 → CEO 투두 이관 (대표 전용) ─────────────────────────────
// CEO 투두 보드는 브라우저 저장(localStorage)이라, 여기서는 DB의 최운호 담당 업무를
// 골라서 반환만 하고(클라이언트가 CEO 보드에 넣음), 별도 호출로 DB에서 지운다.
export type ChoiTodo = {
  id: string;
  title: string;
  note: string | null;
  brandName: string | null;
  status: string;
};

export async function getChoiTodos(): Promise<{ ok: boolean; items?: ChoiTodo[]; error?: string }> {
  const user = await requireAppUser();
  if (user.role !== "owner") return { ok: false, error: "대표만 이관할 수 있습니다." };
  const supabase = createSupabaseServerClient();

  // "최운호" 담당 사용자 id 수집(이름 기준).
  const { data: choi } = await supabase.from("users").select("id, name").ilike("name", "%최운호%");
  const choiIds = new Set(((choi ?? []) as { id: string; name: string | null }[]).map((u) => u.id));
  if (choiIds.size === 0) return { ok: true, items: [] };

  // 담당자(단일/다중) 어느 쪽이든 최운호가 포함된 업무를 고른다.
  const sel = "id, title, note, status, assignee_user_id, assignee_user_ids, brands(name)";
  let rows: any[] = [];
  const res = await supabase.from("todos").select(sel).limit(1000);
  if (res.error) {
    // 다중 담당 컬럼이 아직 없으면 단일 컬럼만으로.
    const res2 = await supabase
      .from("todos")
      .select("id, title, note, status, assignee_user_id, brands(name)")
      .limit(1000);
    rows = (res2.data ?? []) as any[];
  } else {
    rows = (res.data ?? []) as any[];
  }

  const items: ChoiTodo[] = rows
    .filter((r) => {
      if (r.assignee_user_id && choiIds.has(r.assignee_user_id)) return true;
      const arr = (r.assignee_user_ids ?? []) as string[];
      return arr.some((id) => choiIds.has(id));
    })
    .map((r) => ({
      id: r.id,
      title: r.title,
      note: r.note ?? null,
      brandName: r.brands?.name ?? null,
      status: r.status,
    }));

  return { ok: true, items };
}

export async function deleteTodos(ids: string[]): Promise<Result> {
  const user = await requireAppUser();
  if (user.role !== "owner") return { ok: false, error: "대표만 삭제할 수 있습니다." };
  const clean = [...new Set((ids || []).filter(Boolean))];
  if (clean.length === 0) return { ok: true };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("todos").delete().in("id", clean);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/todos");
  return { ok: true };
}
