"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import AttachmentPicker from "@/components/AttachmentPicker";
import CopyForKakaoButton from "@/components/CopyForKakaoButton";
import { createDesignerLog, updateDesignerLog, deleteDesignerLog } from "./actions";

// 업무일지 한 건을 카톡 전달용 텍스트로 변환.
function logToText(log: DesignerLog): string {
  const lines: string[] = [];
  lines.push(`【${log.kind}】 ${log.logDate}${log.title ? ` · ${log.title}` : ""}`);
  if (log.authorName) lines.push(`작성자: ${log.authorName}`);
  if (log.note) { lines.push(""); lines.push(log.note.trim()); }
  if (log.files.length) { lines.push(""); lines.push(`📎 첨부: ${log.files.map((f) => f.name).join(", ")}`); }
  return lines.join("\n");
}

// 하루치 업무일지를 카톡 전달용 텍스트로(담당자 필터 반영).
function dayCopyText(label: string, day: string, dayLogs: DesignerLog[], author: string): string {
  const who = author !== "전체" ? ` · ${author}` : "";
  return `📋 ${label} 업무일지 · ${day}${who}\n──────────\n` + dayLogs.map(logToText).join("\n\n──────────\n\n");
}

// 서버 액션 모듈에서 상수를 import하면 클라이언트에서 배열이 아니게 되므로 여기서 선언.
const DESIGNER_LOG_KINDS = ["일일업무일지", "주간업무계획", "월간업무계획"] as const;

export type DesignerLog = {
  id: string;
  kind: string;
  logDate: string;
  title: string;
  note: string;
  files: { url: string; name: string }[];
  authorName: string;
  role?: string;
};

type Opt = { id: string; name: string };

const KIND_META: Record<string, { color: string; icon: string }> = {
  일일업무일지: { color: "#0ea5e9", icon: "📅" },
  주간업무계획: { color: "#8b5cf6", icon: "🗓" },
  월간업무계획: { color: "#f59e0b", icon: "📆" },
};

function Fields({ log, users, today, role }: { log?: DesignerLog; users: Opt[]; today: string; role: string }) {
  return (
    <>
      <input type="hidden" name="role" value={log?.role ?? role} />
      <div className="row">
        <label className="field" style={{ marginBottom: 0 }}>
          <span>구분 *</span>
          <select name="kind" defaultValue={log?.kind ?? "일일업무일지"}>
            {DESIGNER_LOG_KINDS.map((k) => (
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
          <select name="author_user_id" defaultValue={log ? "" : ""}>
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

function AddForm({ users, today, role }: { users: Opt[]; today: string; role: string }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function submit(fd: FormData) {
    setErr(null);
    start(async () => {
      const r = await createDesignerLog(fd);
      if (!r.ok) {
        setErr(r.error ?? "저장 실패");
        return;
      }
      formRef.current?.reset();
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button className="btn primary" onClick={() => setOpen(true)}>
        + 업무일지 올리기
      </button>
    );
  }

  return (
    <form ref={formRef} action={submit} className="card" style={{ padding: 14, marginBottom: 16 }}>
      <Fields users={users} today={today} role={role} />
      {err && <div style={{ color: "var(--owner)", fontSize: 12, marginTop: 8 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button className="btn primary" disabled={pending}>{pending ? "저장 중…" : "저장"}</button>
        <button type="button" className="btn" onClick={() => setOpen(false)} disabled={pending}>취소</button>
      </div>
    </form>
  );
}

function EditForm({ log, users, today, onDone }: { log: DesignerLog; users: Opt[]; today: string; onDone: () => void }) {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function submit(fd: FormData) {
    setErr(null);
    start(async () => {
      const r = await updateDesignerLog(log.id, fd);
      if (!r.ok) {
        setErr(r.error ?? "저장 실패");
        return;
      }
      onDone();
      router.refresh();
    });
  }

  return (
    <form action={submit} style={{ marginTop: 8 }}>
      <Fields log={log} users={users} today={today} role={log.role ?? "디자이너"} />
      {err && <div style={{ color: "var(--owner)", fontSize: 12, marginTop: 8 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button className="btn primary" disabled={pending}>{pending ? "저장 중…" : "수정 저장"}</button>
        <button type="button" className="btn" onClick={onDone} disabled={pending}>취소</button>
      </div>
    </form>
  );
}

function LogRow({ log, users, today }: { log: DesignerLog; users: Opt[]; today: string }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const meta = KIND_META[log.kind] ?? { color: "#94a3b8", icon: "📄" };

  function remove() {
    if (!confirm("이 업무일지를 삭제할까요?")) return;
    start(async () => {
      await deleteDesignerLog(log.id);
      router.refresh();
    });
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
                <a key={idx} href={f.url} target="_blank" rel="noreferrer" className="btn sm" title={f.name}>
                  📎 {f.name}
                </a>
              ))}
            </div>
          )}
        </div>
        {!editing && (
          <div style={{ display: "flex", gap: 6 }}>
            <CopyForKakaoButton text={() => logToText(log)} />
            <button className="btn sm" onClick={() => setEditing(true)}>수정</button>
            <button className="btn sm" onClick={remove} disabled={pending} style={{ color: "var(--owner)" }}>삭제</button>
          </div>
        )}
      </div>
      {editing && <EditForm log={log} users={users} today={today} onDone={() => setEditing(false)} />}
    </div>
  );
}

export default function DesignerLogClient({
  logs,
  users,
  today,
  dbReady,
  role = "디자이너",
  roleLabel,
}: {
  logs: DesignerLog[];
  users: Opt[];
  today: string;
  dbReady: boolean;
  role?: string;
  roleLabel?: string;
}) {
  const [tab, setTab] = useState<string>("전체");
  const [author, setAuthor] = useState<string>("전체");
  // 이 역할의 로그만.
  const roleLogs = useMemo(() => logs.filter((l) => (l.role ?? "디자이너") === role), [logs, role]);
  // 담당자(작성자) 목록.
  const authors = useMemo(() => [...new Set(roleLogs.map((l) => l.authorName).filter(Boolean))], [roleLogs]);
  const filtered = useMemo(
    () => roleLogs.filter((l) => (tab === "전체" || l.kind === tab) && (author === "전체" || l.authorName === author)),
    [roleLogs, tab, author]
  );
  const tabs = ["전체", ...DESIGNER_LOG_KINDS];
  const label = roleLabel ?? role;

  // 날짜별로 묶어 일일단위 복사를 지원(최신 날짜 먼저).
  const byDate = useMemo(() => {
    const m = new Map<string, DesignerLog[]>();
    for (const l of filtered) { const k = l.logDate || "-"; (m.get(k) ?? m.set(k, []).get(k)!).push(l); }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{label} 업무일지</h1>
          <p>일일업무일지 · 주간업무계획 · 월간업무계획을 파일과 함께 기록하고 공유합니다.</p>
        </div>
        <AddForm users={users} today={today} role={role} />
      </div>

      {!dbReady && (
        <div className="card" style={{ padding: 14, marginBottom: 14 }}>
          <div className="empty">테이블이 아직 준비되지 않았습니다. 마이그레이션(0053_designer_logs.sql)을 적용해 주세요.</div>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {tabs.map((t) => {
          const n = t === "전체" ? roleLogs.length : roleLogs.filter((l) => l.kind === t).length;
          const active = tab === t;
          return (
            <button
              key={t}
              className={`btn sm${active ? " primary" : ""}`}
              onClick={() => setTab(t)}
            >
              {t} {n > 0 && <span style={{ opacity: 0.7 }}>({n})</span>}
            </button>
          );
        })}
      </div>

      {authors.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
          <span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>담당자</span>
          {["전체", ...authors].map((a) => (
            <button key={a} className={`btn sm${author === a ? " primary" : ""}`} onClick={() => setAuthor(a)}>
              {a}{a !== "전체" && <span style={{ opacity: 0.7 }}> ({roleLogs.filter((l) => l.authorName === a).length})</span>}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="card">
          <div className="empty">등록된 업무일지가 없습니다. &ldquo;+ 업무일지 올리기&rdquo;로 추가하세요.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {byDate.map(([d, dayLogs]) => (
            <div key={d} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", position: "sticky", top: 0, background: "var(--bg, var(--surface))", padding: "4px 0", zIndex: 1 }}>
                <span style={{ fontWeight: 800, fontSize: 14 }}>🗓 {d}</span>
                <span className="muted" style={{ fontSize: 12, marginRight: 4 }}>{dayLogs.length}건{author !== "전체" ? ` · ${author}` : ""}</span>
                <CopyForKakaoButton
                  label={`📋 복사`}
                  text={() => dayCopyText(label, d, dayLogs, author)}
                />
                <CopyForKakaoButton
                  share
                  label={`📤 카톡 발송`}
                  text={() => dayCopyText(label, d, dayLogs, author)}
                />
              </div>
              {dayLogs.map((l) => (
                <LogRow key={l.id} log={l} users={users} today={today} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
