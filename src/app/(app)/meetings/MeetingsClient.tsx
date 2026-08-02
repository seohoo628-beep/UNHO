"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DbSetupNotice } from "@/components/DbSetupNotice";
import { saveMeeting, summarizeMeeting, deleteMeeting } from "./actions";

export interface Meeting {
  id: string;
  title: string;
  meetingType: string; // 외부 / 내부
  meetingDate: string;
  attendees: string;
  location: string;
  body: string;
  aiSummary: string;
  filePath: string;
  fileName: string;
}

const SETUP_SQL = `create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  meeting_type text not null default '내부',
  meeting_date date, attendees text, location text,
  body text, ai_summary text, file_path text, file_name text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists meetings_date_idx on public.meetings(meeting_date desc);
alter table public.meetings enable row level security;
drop policy if exists meetings_all on public.meetings;
create policy meetings_all on public.meetings for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));
-- 첨부파일은 기존 공개 버킷 'generated-media'를 재사용합니다(별도 생성 불필요).`;

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  border: "1px solid var(--line-2)",
  borderRadius: "var(--radius)",
  background: "var(--surface)",
  color: "var(--ink)",
};

const typeColor = (t: string) => (t === "외부" ? "#b45309" : "var(--accent)");

function downloadMd(m: Meeting) {
  const content = m.aiSummary?.trim() || m.body?.trim() || "(내용 없음)";
  const head = `# ${m.title}\n\n- 유형: ${m.meetingType} 미팅\n- 일시: ${m.meetingDate || "-"}\n- 장소: ${m.location || "-"}\n- 참석자: ${m.attendees || "-"}\n\n---\n\n`;
  const blob = new Blob([head + content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safe = (m.title || "meeting").replace(/[^\w.\-가-힣]/g, "_");
  a.download = `${m.meetingDate || ""}_${safe}.md`.replace(/^_/, "");
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function MeetingsClient({
  rows,
  dbReady,
  publicBase,
  today,
}: {
  rows: Meeting[];
  dbReady: boolean;
  publicBase: string;
  today: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [filter, setFilter] = useState<"전체" | "외부" | "내부">("전체");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Meeting | null>(null);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState("");

  const list = useMemo(
    () =>
      rows.filter(
        (m) =>
          (filter === "전체" || m.meetingType === filter) &&
          (!q || (m.title + m.attendees + m.body + m.aiSummary).toLowerCase().includes(q.toLowerCase()))
      ),
    [rows, filter, q]
  );

  const run = (p: Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await p;
      if (!r.ok) setErr(r.error ?? "오류가 발생했습니다.");
      else {
        setErr("");
        router.refresh();
      }
    });

  const summarize = (id: string) =>
    start(async () => {
      setBusyId(id);
      const r = await summarizeMeeting(id);
      setBusyId("");
      if (!r.ok) setErr(r.error ?? "AI 정리 실패");
      else {
        setErr("");
        router.refresh();
      }
    });

  const counts = {
    외부: rows.filter((m) => m.meetingType === "외부").length,
    내부: rows.filter((m) => m.meetingType === "내부").length,
  };

  if (!dbReady) {
    return (
      <div>
        <div className="page-head">
          <h1 style={{ margin: 0 }}>📝 미팅·회의 일지</h1>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>외부·내부 미팅 기록, 파일 첨부, AI 회의록 정리.</p>
        </div>
        <DbSetupNotice title="미팅·회의 일지" sql={SETUP_SQL} />
      </div>
    );
  }

  return (
    <div>
      <div className="page-head" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>📝 미팅·회의 일지</h1>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
            외부 {counts.외부} · 내부 {counts.내부} · 파일첨부 + AI 회의록 정리
            {pending ? " · 처리 중…" : ""}
          </p>
        </div>
        <button className="btn" onClick={() => { setEdit(null); setOpen(true); }} style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}>+ 미팅 기록</button>
      </div>

      {err && <div className="card" style={{ padding: 10, marginBottom: 12, color: "var(--owner, #b91c1c)", background: "var(--owner-bg, #fef2f2)" }}>{err}</div>}

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {(["전체", "외부", "내부"] as const).map((t) => (
          <button
            key={t}
            className="btn"
            onClick={() => setFilter(t)}
            style={{ padding: "5px 12px", ...(filter === t ? { background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" } : {}) }}
          >
            {t === "전체" ? "전체" : `${t} 미팅`}
          </button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="제목·참석자·내용 검색…" style={{ ...inputStyle, maxWidth: 240, marginLeft: "auto" }} />
      </div>

      {list.length === 0 ? (
        <div className="card muted" style={{ padding: 28, textAlign: "center" }}>기록이 없습니다. ‘+ 미팅 기록’으로 회의 내용을 작성하거나 파일을 올려보세요.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {list.map((m) => (
            <div key={m.id} className="card" style={{ padding: 16 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#fff", background: typeColor(m.meetingType), padding: "2px 8px", borderRadius: 6 }}>{m.meetingType} 미팅</span>
                  <strong style={{ fontSize: 15 }}>{m.title}</strong>
                  <span className="muted" style={{ fontSize: 12.5 }}>{m.meetingDate || "-"}{m.location ? ` · ${m.location}` : ""}</span>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button className="btn" style={smBtn} disabled={pending} onClick={() => summarize(m.id)}>
                    {busyId === m.id ? "AI 정리 중…" : m.aiSummary ? "AI 재정리" : "✨ AI 정리"}
                  </button>
                  <button className="btn" style={smBtn} onClick={() => downloadMd(m)}>📄 파일로 저장</button>
                  <button className="btn" style={smBtn} onClick={() => { setEdit(m); setOpen(true); }}>수정</button>
                  <button className="btn" style={{ ...smBtn, color: "var(--owner, #b91c1c)" }} disabled={pending} onClick={() => { if (confirm("삭제할까요?")) run(deleteMeeting(m.id, m.filePath || undefined)); }}>삭제</button>
                </div>
              </div>

              {m.attendees && <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>참석: {m.attendees}</div>}

              {m.body && (
                <div style={{ marginTop: 10, fontSize: 13.5, whiteSpace: "pre-wrap", lineHeight: 1.6, color: "var(--ink)" }}>{m.body}</div>
              )}

              {m.filePath && (
                <div style={{ marginTop: 10 }}>
                  <a href={publicBase + m.filePath} target="_blank" rel="noreferrer" className="btn" style={{ ...smBtn, textDecoration: "none" }}>📎 {m.fileName || "첨부파일"} 열기 ↗</a>
                </div>
              )}

              {m.aiSummary && (
                <div style={{ marginTop: 12, padding: 14, background: "var(--surface-2, rgba(127,127,127,0.06))", borderRadius: "var(--radius)", border: "1px solid var(--line)" }}>
                  <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--accent)", marginBottom: 6 }}>✨ AI 정리 회의록</div>
                  <div style={{ fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.65 }}>{m.aiSummary}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {open && (
        <MeetingModal
          initial={edit}
          today={today}
          pending={pending}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); }}
          onSubmit={(fd) => run(saveMeeting(fd))}
        />
      )}
    </div>
  );
}

function MeetingModal({
  initial,
  today,
  pending,
  onClose,
  onSaved,
  onSubmit,
}: {
  initial: Meeting | null;
  today: string;
  pending: boolean;
  onClose: () => void;
  onSaved: () => void;
  onSubmit: (fd: FormData) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recordedBlobRef = useRef<Blob | null>(null);
  const activeRef = useRef(false);
  const [fileName, setFileName] = useState("");
  const [recording, setRecording] = useState(false);
  const [micSupported, setMicSupported] = useState(true);
  const [sttSupported, setSttSupported] = useState(true);
  const [recNote, setRecNote] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") setMicSupported(false);
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) setSttSupported(false);
    return () => {
      activeRef.current = false;
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const appendText = (t: string) => {
    const el = textareaRef.current;
    if (!el || !t.trim()) return;
    el.value = el.value ? el.value.replace(/\s*$/, "") + " " + t.trim() : t.trim();
  };

  const stopAll = () => {
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    try { if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop(); } catch { /* ignore */ }
    streamRef.current?.getTracks().forEach((t) => t.stop());
  };

  const startRec = async () => {
    setRecNote("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        recordedBlobRef.current = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        setRecNote(`녹음 저장됨 (${Math.round(recordedBlobRef.current.size / 1024)}KB) — ‘저장’ 시 첨부됩니다.`);
      };
      mr.start();
      mediaRecorderRef.current = mr;
    } catch {
      setMicSupported(false);
      setRecNote("마이크 접근이 거부되었습니다. 브라우저 권한을 확인하세요.");
      return;
    }

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SR) {
      const recog = new SR();
      recog.lang = "ko-KR";
      recog.continuous = true;
      recog.interimResults = true;
      recog.onresult = (ev: any) => {
        let finalText = "";
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          if (ev.results[i].isFinal) finalText += ev.results[i][0].transcript;
        }
        if (finalText) appendText(finalText);
      };
      recog.onend = () => { if (activeRef.current) { try { recog.start(); } catch { /* ignore */ } } };
      recog.onerror = () => { /* 무음·권한 등은 무시하고 계속 */ };
      try { recog.start(); } catch { /* ignore */ }
      recognitionRef.current = recog;
    }

    activeRef.current = true;
    setRecording(true);
  };

  const stopRec = () => {
    activeRef.current = false;
    stopAll();
    setRecording(false);
  };

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (recording) stopRec();
    const fd = new FormData(e.currentTarget);
    fd.set("id", initial?.id ?? "");
    const chosen = fd.get("file");
    if ((!(chosen instanceof File) || chosen.size === 0) && recordedBlobRef.current) {
      const ext = (recordedBlobRef.current.type || "audio/webm").includes("ogg") ? "ogg" : "webm";
      fd.set("file", new File([recordedBlobRef.current], `녹음_${initial?.title || "meeting"}.${ext}`, { type: recordedBlobRef.current.type || "audio/webm" }));
    }
    onSubmit(fd);
    onSaved();
  };

  return (
    <div onMouseDown={onClose} style={backdrop}>
      <form
        ref={formRef}
        onSubmit={submit}
        className="card"
        onMouseDown={(e) => e.stopPropagation()}
        style={{ padding: 20, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto" }}
      >
        <h3 style={{ marginTop: 0 }}>{initial ? "미팅 기록 수정" : "미팅 기록"}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="제목"><input name="title" style={inputStyle} defaultValue={initial?.title ?? ""} placeholder="예: OO거래처 입점 미팅" /></Field>
          </div>
          <Field label="유형">
            <select name="meeting_type" style={inputStyle} defaultValue={initial?.meetingType ?? "내부"}>
              <option value="내부">내부 미팅</option>
              <option value="외부">외부 미팅</option>
            </select>
          </Field>
          <Field label="일시"><input type="date" name="meeting_date" style={inputStyle} defaultValue={initial?.meetingDate || today} /></Field>
          <Field label="장소"><input name="location" style={inputStyle} defaultValue={initial?.location ?? ""} placeholder="사무실 / 화상 / 거래처" /></Field>
          <Field label="참석자"><input name="attendees" style={inputStyle} defaultValue={initial?.attendees ?? ""} placeholder="홍길동, 김대표…" /></Field>
          <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 12px", background: "var(--surface-2, rgba(127,127,127,0.06))", borderRadius: "var(--radius)", border: "1px solid var(--line)" }}>
            {!recording ? (
              <button type="button" className="btn" onClick={startRec} disabled={!micSupported} style={{ background: "#b91c1c", color: "#fff", borderColor: "#b91c1c" }}>🎙 음성 녹음 시작</button>
            ) : (
              <button type="button" className="btn" onClick={stopRec} style={{ background: "var(--ink)", color: "#fff", borderColor: "var(--ink)" }}>⏹ 녹음 정지</button>
            )}
            {recording ? (
              <span style={{ color: "#b91c1c", fontWeight: 700, fontSize: 13 }}>● 녹음 중… 말하면 아래에 자동으로 받아 적습니다</span>
            ) : (
              <span className="muted" style={{ fontSize: 12 }}>
                {recNote || (sttSupported ? "녹음하면 음성이 자동으로 텍스트화됩니다. 저장 후 ‘✨ AI 정리’로 회의록화." : "이 브라우저는 자동 텍스트화 미지원 — Chrome·Edge 권장(녹음 파일은 첨부됩니다).")}
              </span>
            )}
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="회의 내용 (직접 작성 또는 🎙 녹음 — AI가 정리해 드립니다)">
              <textarea ref={textareaRef} name="body" rows={7} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} defaultValue={initial?.body ?? ""} placeholder="논의된 내용을 자유롭게 적거나, 위 ‘음성 녹음’으로 받아 적으세요. 저장 후 ‘AI 정리’를 누르면 회의록 형식으로 정리됩니다." />
            </Field>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="파일 첨부 (선택 · 25MB 이하)">
              <input type="file" name="file" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")} style={{ ...inputStyle, padding: 8 }} />
            </Field>
            {initial?.fileName && !fileName && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>현재 첨부: {initial.fileName} (새 파일 선택 시 교체)</div>}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button type="button" className="btn" onClick={onClose}>취소</button>
          <button type="submit" className="btn" disabled={pending} style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}>저장</button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginBottom: 4, fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

const smBtn: React.CSSProperties = { padding: "3px 9px", fontSize: 12 };
const backdrop: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(16,20,24,0.5)", display: "grid", placeItems: "center", zIndex: 100, padding: 20 };
