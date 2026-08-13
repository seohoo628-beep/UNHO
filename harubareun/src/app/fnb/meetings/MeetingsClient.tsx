"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useData } from "@fnb/lib/store";
import { Card, Badge, Chips } from "@fnb/components/ui";
import { STORES, storeName } from "@fnb/lib/stores";
import { saveMeeting, summarizeMeeting, deleteMeeting } from "@/lib/storeMeetings";
import type { MeetingRow } from "@/lib/storeSharedRead";

const PLATFORM = "fnb" as const;

const SETUP_SQL = `create table if not exists public.store_meetings (
  id uuid primary key default gen_random_uuid(),
  platform text not null, store text not null default 'all',
  title text not null, meeting_type text not null default '내부',
  meeting_date date, attendees text, location text,
  body text, ai_summary text, file_path text, file_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.store_meetings enable row level security;
-- 첨부파일은 기존 공개 버킷 'generated-media' 재사용(별도 생성 불필요).`;

const field: React.CSSProperties = { width: "100%", padding: "9px 11px", border: "1px solid var(--border-strong)", borderRadius: 8, background: "var(--surface)", color: "var(--text)" };

export default function MeetingsClient({ rows, dbReady, publicBase, today }: { rows: MeetingRow[]; dbReady: boolean; publicBase: string; today: string }) {
  const { scope, ready } = useData();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [filter, setFilter] = useState<"전체" | "외부" | "내부">("전체");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<MeetingRow | null>(null);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState("");
  if (!ready) return null;

  const scoped = rows.filter((m) => scope === "all" || m.store === scope || m.store === "all");
  const list = scoped.filter(
    (m) => (filter === "전체" || m.meetingType === filter) && (!q || (m.title + m.attendees + m.body + m.aiSummary).toLowerCase().includes(q.toLowerCase()))
  );

  const refresh = () => router.refresh();
  const runSave = (fd: FormData) => start(async () => { const r = await saveMeeting(fd); if (!r.ok) setErr(r.error ?? "오류"); else { setErr(""); setOpen(false); refresh(); } });
  const runDelete = (m: MeetingRow) => { if (!confirm("삭제할까요?")) return; start(async () => { const r = await deleteMeeting(m.id, PLATFORM, m.filePath || undefined); if (!r.ok) setErr(r.error ?? "오류"); else refresh(); }); };
  const runAI = (m: MeetingRow) => { setBusyId(m.id); start(async () => { const r = await summarizeMeeting(m.id, PLATFORM); setBusyId(""); if (!r.ok) setErr(r.error ?? "오류"); else { setErr(""); refresh(); } }); };

  if (!dbReady) {
    return (
      <>
        <div className="page-head"><div><h1>미팅·회의 일지</h1><p>회의 내용을 기록하고 AI가 회의록으로 정리</p></div></div>
        <SetupNotice />
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>미팅·회의 일지</h1>
          <p>파일 업로드 + 직접 작성 시 AI 회의록 자동 정리 — {storeName(scope)} · <span style={{ color: "var(--green)" }}>DB 공유</span>{pending ? " · 처리 중…" : ""}</p>
        </div>
        <button className="btn primary" onClick={() => { setEdit(null); setOpen(true); }}>+ 회의 추가</button>
      </div>

      {err && <div className="card card-pad" style={{ marginBottom: 12, color: "var(--red)" }}>{err}</div>}

      <div className="row wrap" style={{ gap: 10, marginBottom: 16 }}>
        <input style={{ ...field, maxWidth: 240 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="제목·참석자·내용 검색…" />
        <Chips value={filter} onChange={setFilter} options={[{ value: "전체", label: "전체" }, { value: "내부", label: "내부" }, { value: "외부", label: "외부" }]} />
      </div>

      <div className="stack">
        {list.length === 0 && <Card pad><div className="empty">기록된 회의가 없습니다. ‘+ 회의 추가’로 등록하세요.</div></Card>}
        {list.map((m) => (
          <div key={m.id} className="card card-pad">
            <div className="row between" style={{ alignItems: "flex-start", gap: 12 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="row" style={{ gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                  <Badge tone={m.meetingType === "외부" ? "amber" : "brand"}>{m.meetingType}</Badge>
                  {scope === "all" && m.store !== "all" && <span className="badge gray">{storeName(m.store)}</span>}
                  <span className="muted" style={{ fontSize: 12 }}>{m.meetingDate || "-"}{m.location ? ` · ${m.location}` : ""}</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{m.title}</div>
                {m.attendees && <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>참석: {m.attendees}</div>}
              </div>
              <div className="row" style={{ gap: 4, flexShrink: 0 }}>
                <button className="btn primary sm" disabled={pending} onClick={() => runAI(m)}>{busyId === m.id ? "AI 정리 중…" : "✨ AI 정리"}</button>
                <button className="btn ghost sm" onClick={() => { setEdit(m); setOpen(true); }}>수정</button>
                <button className="btn danger sm" disabled={pending} onClick={() => runDelete(m)}>삭제</button>
              </div>
            </div>

            {m.body && (
              <details style={{ marginTop: 10 }}>
                <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--text-2)" }}>작성 원문 보기</summary>
                <div style={{ whiteSpace: "pre-wrap", fontSize: 13.5, lineHeight: 1.6, marginTop: 8, color: "var(--text-2)" }}>{m.body}</div>
              </details>
            )}

            {m.aiSummary && (
              <div style={{ marginTop: 12, border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface-2)", padding: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 12.5, color: "var(--brand)", marginBottom: 6 }}>✨ AI 정리 회의록</div>
                <div style={{ whiteSpace: "pre-wrap", fontSize: 13.5, lineHeight: 1.65 }}>{m.aiSummary}</div>
              </div>
            )}

            {m.filePath && (
              <div style={{ marginTop: 10 }}>
                <a className="btn sm" href={publicBase + m.filePath} target="_blank" rel="noreferrer">📎 {m.fileName || "첨부파일"}</a>
              </div>
            )}
          </div>
        ))}
      </div>

      {open && (
        <MeetingModal initial={edit} defaultStore={scope === "all" ? "all" : scope} today={today} pending={pending} onClose={() => setOpen(false)} onSave={runSave} />
      )}
    </>
  );
}

function SetupNotice() {
  const [copied, setCopied] = useState(false);
  return (
    <Card pad>
      <h3 style={{ marginTop: 0 }}>🛠 미팅·회의 일지 — DB 설정 필요</h3>
      <p style={{ color: "var(--text-2)", fontSize: 13.5, lineHeight: 1.6 }}>
        회의 기록을 공유·저장하려면 Supabase에 테이블을 한 번 생성해야 합니다.
        <br /><b>Supabase 대시보드 → SQL Editor</b>에 아래 SQL을 실행하세요. (한 번만)
      </p>
      <div style={{ position: "relative" }}>
        <button className="btn sm" style={{ position: "absolute", top: 8, right: 8 }} onClick={() => { navigator.clipboard?.writeText(SETUP_SQL); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "복사됨 ✓" : "복사"}</button>
        <pre style={{ background: "#0e1116", color: "#e7e9ec", padding: 16, borderRadius: 10, overflowX: "auto", fontSize: 12.5, lineHeight: 1.5 }}>{SETUP_SQL}</pre>
      </div>
      <p className="muted" style={{ fontSize: 12.5 }}>저장소: <code>supabase/migrations/0022_store_meetings.sql</code> · 첨부파일은 기존 공개 버킷 generated-media 사용</p>
    </Card>
  );
}

function MeetingModal({ initial, defaultStore, today, pending, onClose, onSave }: { initial: MeetingRow | null; defaultStore: string; today: string; pending: boolean; onClose: () => void; onSave: (fd: FormData) => void }) {
  const [type, setType] = useState(initial?.meetingType ?? "내부");
  const [store, setStore] = useState(initial?.store ?? defaultStore);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    const form = document.getElementById("mtg-form") as HTMLFormElement;
    const fd = new FormData(form);
    fd.set("platform", PLATFORM);
    fd.set("meeting_type", type);
    fd.set("store", store);
    if (initial) fd.set("id", initial.id);
    const f = fileRef.current?.files?.[0];
    if (f) fd.set("file", f);
    onSave(fd);
  };

  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, background: "rgba(16,24,40,0.5)", display: "grid", placeItems: "center", zIndex: 100, padding: 20 }}>
      <div className="card card-pad" onMouseDown={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto" }}>
        <h3 style={{ marginTop: 0 }}>{initial ? "회의 수정" : "회의 추가"}</h3>
        <form id="mtg-form" onSubmit={(e) => e.preventDefault()}>
          <div className="form-grid">
            <div className="full"><div className="form-label">제목</div><input className="field" name="title" defaultValue={initial?.title ?? ""} /></div>
            <div><div className="form-label">유형</div>
              <div className="chips">
                {["내부", "외부"].map((t) => <button type="button" key={t} className={`chip ${type === t ? "active" : ""}`} onClick={() => setType(t)}>{t}</button>)}
              </div>
            </div>
            <div><div className="form-label">매장</div>
              <select className="field" value={store} onChange={(e) => setStore(e.target.value)}>
                <option value="all">공통(전 지점)</option>
                {STORES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div><div className="form-label">일시</div><input type="date" className="field" name="meeting_date" defaultValue={initial?.meetingDate || today} /></div>
            <div><div className="form-label">장소</div><input className="field" name="location" defaultValue={initial?.location ?? ""} /></div>
            <div className="full"><div className="form-label">참석자</div><input className="field" name="attendees" defaultValue={initial?.attendees ?? ""} placeholder="예: 대표, 점장, 마케터" /></div>
            <div className="full"><div className="form-label">회의 내용 (직접 작성 → 저장 후 ‘AI 정리’로 회의록화)</div>
              <textarea className="field" name="body" rows={6} defaultValue={initial?.body ?? ""} style={{ resize: "vertical" }} placeholder="논의한 내용을 자유롭게 적어주세요. 저장 후 ✨AI 정리를 누르면 회의록 형식으로 정리됩니다." />
            </div>
            <div className="full"><div className="form-label">파일 첨부 (선택 · 25MB 이하)</div>
              <input ref={fileRef} type="file" name="file" />
              {initial?.fileName && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>현재: {initial.fileName} (새 파일 선택 시 교체)</div>}
            </div>
          </div>
        </form>
        <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn primary" disabled={pending} onClick={submit}>{pending ? "저장 중…" : "저장"}</button>
        </div>
      </div>
    </div>
  );
}
