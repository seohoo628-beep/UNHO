"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import AttachmentPicker from "@/components/AttachmentPicker";
import ManagerLogClient, { type Log as ManagerLog, type Incentive } from "../manager-log/ManagerLogClient";
import { createWorkLog, updateWorkLog, deleteWorkLog } from "./actions";

const LOG_KINDS = ["일일업무일지", "주간업무계획", "월간업무계획"] as const;

const KIND_META: Record<string, { color: string; icon: string }> = {
  일일업무일지: { color: "#0ea5e9", icon: "📅" },
  주간업무계획: { color: "#8b5cf6", icon: "🗓" },
  월간업무계획: { color: "#f59e0b", icon: "📆" },
};

// 역할 탭 정의(디자이너/마케터/BM/MD는 동일 구조 공용). 경영지원은 별도 리치 화면.
export const ROLES = [
  { key: "designer", table: "designer_logs", label: "디자이너", icon: "🎨" },
  { key: "marketer", table: "marketer_logs", label: "마케터", icon: "🖊" },
  { key: "bm", table: "bm_logs", label: "BM", icon: "🧭" },
  { key: "md", table: "md_logs", label: "MD", icon: "🛒" },
] as const;

export type WorkLog = {
  id: string;
  kind: string;
  logDate: string;
  title: string;
  note: string;
  files: { url: string; name: string }[];
  authorName: string;
};
type Opt = { id: string; name: string };

function Fields({ log, users, today }: { log?: WorkLog; users: Opt[]; today: string }) {
  return (
    <>
      <div className="row">
        <label className="field" style={{ marginBottom: 0 }}>
          <span>구분 *</span>
          <select name="kind" defaultValue={log?.kind ?? "일일업무일지"}>
            {LOG_KINDS.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>날짜 *</span>
          <input type="date" name="log_date" defaultValue={log?.logDate || today} required />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>작성자</span>
          <select name="author_user_id" defaultValue="">
            <option value="">(본인)</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="field" style={{ marginTop: 10 }}>
        <span>제목</span>
        <input name="title" placeholder="예) 8월 2주차 계획 / 상세페이지 A안" defaultValue={log?.title ?? ""} />
      </label>
      <label className="field" style={{ marginTop: 10 }}>
        <span>내용</span>
        <textarea name="note" rows={4} placeholder="업무 내용 / 계획을 적거나, 아래에 파일을 첨부하세요." defaultValue={log?.note ?? ""} />
      </label>
      <div style={{ marginTop: 10 }}>
        <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>첨부파일 (여러 개 가능 · 내 파일/컴퓨터 자료)</div>
        <AttachmentPicker initial={log?.files ?? []} />
      </div>
    </>
  );
}

function AddForm({ table, users, today }: { table: string; users: Opt[]; today: string }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function submit(fd: FormData) {
    setErr(null);
    start(async () => {
      const r = await createWorkLog(table, fd);
      if (!r.ok) { setErr(r.error ?? "저장 실패"); return; }
      formRef.current?.reset();
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return <button className="btn primary" onClick={() => setOpen(true)}>+ 업무일지 올리기</button>;
  }
  return (
    <form ref={formRef} action={submit} className="card" style={{ padding: 14, marginBottom: 16 }}>
      <Fields users={users} today={today} />
      {err && <div style={{ color: "var(--owner)", fontSize: 12, marginTop: 8 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button className="btn primary" disabled={pending}>{pending ? "저장 중…" : "저장"}</button>
        <button type="button" className="btn" onClick={() => setOpen(false)} disabled={pending}>취소</button>
      </div>
    </form>
  );
}

function EditForm({ table, log, users, today, onDone }: { table: string; log: WorkLog; users: Opt[]; today: string; onDone: () => void }) {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function submit(fd: FormData) {
    setErr(null);
    start(async () => {
      const r = await updateWorkLog(table, log.id, fd);
      if (!r.ok) { setErr(r.error ?? "저장 실패"); return; }
      onDone();
      router.refresh();
    });
  }
  return (
    <form action={submit} style={{ marginTop: 8 }}>
      <Fields log={log} users={users} today={today} />
      {err && <div style={{ color: "var(--owner)", fontSize: 12, marginTop: 8 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button className="btn primary" disabled={pending}>{pending ? "저장 중…" : "수정 저장"}</button>
        <button type="button" className="btn" onClick={onDone} disabled={pending}>취소</button>
      </div>
    </form>
  );
}

function LogRow({ table, log, users, today }: { table: string; log: WorkLog; users: Opt[]; today: string }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const meta = KIND_META[log.kind] ?? { color: "#94a3b8", icon: "📄" };

  function remove() {
    if (!confirm("이 업무일지를 삭제할까요?")) return;
    start(async () => { await deleteWorkLog(table, log.id); router.refresh(); });
  }

  return (
    <div className="card" style={{ padding: 14, borderLeft: `4px solid ${meta.color}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 200, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span className="badge" style={{ background: meta.color, color: "#fff" }}>{log.kind}</span>
            <span style={{ fontWeight: 700 }}>{log.logDate}</span>
            {log.title && <span style={{ fontWeight: 600 }}>· {log.title}</span>}
          </div>
          {log.authorName && <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>작성자 {log.authorName}</div>}
          {log.note && <div style={{ fontSize: 13.5, marginTop: 6, whiteSpace: "pre-wrap" }}>{log.note}</div>}
          {log.files.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {log.files.map((f, idx) => (
                <a key={idx} href={f.url} target="_blank" rel="noreferrer" className="btn sm" title={f.name}>📎 {f.name}</a>
              ))}
            </div>
          )}
        </div>
        {!editing && (
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn sm" onClick={() => setEditing(true)}>수정</button>
            <button className="btn sm" onClick={remove} disabled={pending} style={{ color: "var(--owner)" }}>삭제</button>
          </div>
        )}
      </div>
      {editing && <EditForm table={table} log={log} users={users} today={today} onDone={() => setEditing(false)} />}
    </div>
  );
}

function RolePanel({ table, migration, logs, users, today, dbReady }: { table: string; migration: string; logs: WorkLog[]; users: Opt[]; today: string; dbReady: boolean }) {
  const [kind, setKind] = useState<string>("전체");
  const filtered = useMemo(() => (kind === "전체" ? logs : logs.filter((l) => l.kind === kind)), [logs, kind]);
  const kinds = ["전체", ...LOG_KINDS];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <AddForm table={table} users={users} today={today} />
      </div>

      {!dbReady && (
        <div className="card" style={{ padding: 14, marginBottom: 14 }}>
          <div className="empty">테이블이 아직 준비되지 않았습니다. 마이그레이션({migration})을 적용해 주세요.</div>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {kinds.map((t) => {
          const n = t === "전체" ? logs.length : logs.filter((l) => l.kind === t).length;
          return (
            <button key={t} className={`btn sm${kind === t ? " primary" : ""}`} onClick={() => setKind(t)}>
              {t} {n > 0 && <span style={{ opacity: 0.7 }}>({n})</span>}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="card"><div className="empty">등록된 업무일지가 없습니다. “+ 업무일지 올리기”로 추가하세요.</div></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((l) => <LogRow key={l.id} table={table} log={l} users={users} today={today} />)}
        </div>
      )}
    </div>
  );
}

const MIGRATION_OF: Record<string, string> = {
  designer_logs: "0053_designer_logs.sql",
  marketer_logs: "0076_work_logs.sql",
  bm_logs: "0076_work_logs.sql",
  md_logs: "0076_work_logs.sql",
};

export default function WorkLogsClient({
  roleLogs,
  roleReady,
  users,
  today,
  manager,
}: {
  roleLogs: Record<string, WorkLog[]>;
  roleReady: Record<string, boolean>;
  users: Opt[];
  today: string;
  manager: { logs: ManagerLog[]; incentives: Incentive[]; dbReady: boolean };
}) {
  const [active, setActive] = useState<string>("designer");
  const role = ROLES.find((r) => r.key === active);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>업무일지</h1>
          <p>역할별 일일·주간·월간 업무일지를 한곳에서 기록·공유합니다.</p>
        </div>
      </div>

      {/* 역할 탭 */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16, borderBottom: "1px solid var(--line)", paddingBottom: 12 }}>
        {ROLES.map((r) => (
          <button
            key={r.key}
            className={`btn${active === r.key ? " primary" : ""}`}
            onClick={() => setActive(r.key)}
            style={{ fontWeight: 700 }}
          >
            {r.icon} {r.label}
            {roleLogs[r.key]?.length ? <span style={{ opacity: 0.7, marginLeft: 4 }}>({roleLogs[r.key].length})</span> : null}
          </button>
        ))}
        <button
          className={`btn${active === "manager" ? " primary" : ""}`}
          onClick={() => setActive("manager")}
          style={{ fontWeight: 700 }}
        >
          📓 경영지원매니저
          {manager.logs.length ? <span style={{ opacity: 0.7, marginLeft: 4 }}>({manager.logs.length})</span> : null}
        </button>
      </div>

      {role ? (
        <RolePanel
          key={role.key}
          table={role.table}
          migration={MIGRATION_OF[role.table] ?? "supabase migrations"}
          logs={roleLogs[role.key] ?? []}
          users={users}
          today={today}
          dbReady={roleReady[role.key] ?? true}
        />
      ) : (
        // 경영지원매니저: 카테고리·상시업무·인센티브 정산 포함 리치 화면을 그대로 사용.
        <ManagerLogClient logs={manager.logs} incentives={manager.incentives} dbReady={manager.dbReady} today={today} />
      )}
    </div>
  );
}
