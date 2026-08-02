"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DbSetupNotice } from "@/components/DbSetupNotice";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { saveMeeting, summarizeMeeting, deleteMeeting, type MeetingInput } from "./actions";

const STORAGE_SQL = `insert into storage.buckets (id, name, public)
values ('generated-media','generated-media', true)
on conflict (id) do update set public = true;
drop policy if exists "media_auth_insert" on storage.objects;
create policy "media_auth_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'generated-media');
drop policy if exists "media_auth_update" on storage.objects;
create policy "media_auth_update" on storage.objects
  for update to authenticated using (bucket_id = 'generated-media') with check (bucket_id = 'generated-media');
drop policy if exists "media_public_read" on storage.objects;
create policy "media_public_read" on storage.objects
  for select to public using (bucket_id = 'generated-media');`;

// 브라우저에서 Supabase Storage로 직접 업로드 (서버 우회 → 용량 제한 회피)
async function uploadMeetingFile(
  file: File
): Promise<{ ok: boolean; path?: string; error?: string; permission?: boolean }> {
  if (file.size > 45 * 1024 * 1024) return { ok: false, error: "파일이 너무 큽니다(45MB 초과)." };
  try {
    const supabase = createSupabaseBrowserClient();
    // Supabase Storage 키는 ASCII만 허용 → 한글 파일명은 경로에서 제거한다.
    // (원본 파일명은 DB(file_name)에 그대로 저장되어 화면·다운로드명에 쓰인다.)
    const dot = file.name.lastIndexOf(".");
    const ext = (dot >= 0 ? file.name.slice(dot + 1) : "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(0, 8);
    const base = (dot >= 0 ? file.name.slice(0, dot) : file.name).replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 40) || "file";
    const rand = Math.random().toString(36).slice(2, 7);
    const path = `meeting-files/${Date.now()}_${rand}_${base}${ext ? "." + ext : ""}`;
    const { error } = await supabase.storage
      .from("generated-media")
      .upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (error) {
      const msg = error.message || "업로드 실패";
      const permission = /row-level|policy|unauthor|403|permission|not allowed|violat/i.test(msg);
      return { ok: false, error: msg, permission };
    }
    return { ok: true, path };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

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

function minutesText(m: Meeting): string {
  return (m.aiSummary?.trim() || m.body?.trim() || "");
}
function fileBase(m: Meeting): string {
  return `${m.meetingDate || ""}_${(m.title || "meeting").replace(/[^\w.\-가-힣]/g, "_")}`.replace(/^_/, "");
}
// 회의록을 사람이 보기 좋은 HTML로 (PDF 인쇄·Word 저장 공용)
function docHtml(m: Meeting): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const content = minutesText(m) || "(내용 없음)";
  const bodyHtml = esc(content)
    .split("\n")
    .map((raw) => {
      const l = raw.trim();
      if (l.startsWith("## ")) return `<h2>${l.slice(3)}</h2>`;
      if (l.startsWith("# ")) return `<h1>${l.slice(2)}</h1>`;
      if (l.startsWith("- ") || l.startsWith("• ")) return `<li>${l.slice(2)}</li>`;
      if (!l) return "";
      return `<p>${l}</p>`;
    })
    .join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(m.title)}</title>
<style>body{font-family:'Malgun Gothic','맑은 고딕','Apple SD Gothic Neo',sans-serif;line-height:1.6;color:#111;padding:28px;max-width:720px;margin:0 auto}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:18px 0 6px;border-bottom:1px solid #ddd;padding-bottom:4px}
li{margin:2px 0}p{margin:4px 0}.meta{color:#555;font-size:13px;margin:6px 0 18px}</style></head>
<body><h1>${esc(m.title)}</h1>
<div class="meta">${esc(m.meetingType)} 미팅 · ${esc(m.meetingDate || "-")}${m.location ? " · " + esc(m.location) : ""}<br/>참석자: ${esc(m.attendees || "-")}</div>
${bodyHtml}</body></html>`;
}
function savePdf(m: Meeting) {
  const iframe = document.createElement("iframe");
  Object.assign(iframe.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) return;
  doc.open();
  doc.write(docHtml(m));
  doc.close();
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      setTimeout(() => iframe.remove(), 1500);
    }
  }, 350);
}
function saveDoc(m: Meeting) {
  const blob = new Blob(["﻿", docHtml(m)], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileBase(m)}.doc`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
// 네이티브 공유 시트(→ 구글 드라이브·카톡 등). 파일 공유 미지원 시 텍스트/클립보드로 폴백.
async function shareDoc(m: Meeting): Promise<string> {
  const text = `[${m.title}]\n${m.meetingType} 미팅 · ${m.meetingDate || "-"}\n참석자: ${m.attendees || "-"}\n\n${minutesText(m)}`;
  const nav = navigator as any;
  try {
    const blob = new Blob(["﻿", docHtml(m)], { type: "application/msword" });
    const file = new File([blob], `${fileBase(m)}.doc`, { type: "application/msword" });
    if (nav.canShare && nav.canShare({ files: [file] })) {
      await nav.share({ files: [file], title: m.title });
      return "";
    }
    if (nav.share) {
      await nav.share({ title: m.title, text });
      return "";
    }
    await navigator.clipboard.writeText(text);
    return "이 브라우저는 공유를 지원하지 않아 회의록을 클립보드에 복사했습니다.";
  } catch (e: any) {
    if (e?.name === "AbortError") return "";
    try {
      await navigator.clipboard.writeText(text);
      return "공유가 취소되어 클립보드에 복사했습니다.";
    } catch {
      return `공유 실패: ${e?.message || e}`;
    }
  }
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ all: "unset", cursor: "pointer", display: "block", width: "100%", boxSizing: "border-box", padding: "9px 12px", fontSize: 13.5, borderRadius: 8 }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--line)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {label}
    </button>
  );
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
  const [working, setWorking] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [fileMenu, setFileMenu] = useState("");

  const doSave = async (m: Meeting, kind: "pdf" | "doc" | "share") => {
    if (!minutesText(m)) {
      setErr("저장할 회의록이 없습니다. 먼저 ‘✨ AI 정리’로 회의록을 만들어주세요.");
      return;
    }
    setErr("");
    if (kind === "pdf") savePdf(m);
    else if (kind === "doc") saveDoc(m);
    else {
      const msg = await shareDoc(m);
      if (msg) setErr(msg);
    }
  };

  // 저장 후 필요 시 AI(제목·회의록) 자동 생성까지 한 번에 처리
  const saveAndProcess = async (input: MeetingInput, autoAi: boolean) => {
    setWorking("저장 중…");
    setErr("");
    try {
      const r = await saveMeeting(input);
      if (!r.ok) {
        setErr(r.error ?? "저장에 실패했습니다.");
        setWorking("");
        return;
      }
      if (autoAi && r.id) {
        setWorking("✨ AI가 제목과 회의록을 생성하는 중…");
        const s = await summarizeMeeting(r.id);
        if (!s.ok) setErr(s.error ?? "AI 처리에 실패했습니다. (저장은 완료됨)");
      }
    } catch (e: any) {
      setErr(`처리 중 오류: ${e?.message || e}`);
    } finally {
      setWorking("");
      router.refresh();
    }
  };

  const list = useMemo(
    () =>
      rows.filter(
        (m) =>
          (filter === "전체" || m.meetingType === filter) &&
          (!q || (m.title + m.attendees + m.body + m.aiSummary).toLowerCase().includes(q.toLowerCase()))
      ),
    [rows, filter, q]
  );

  // 월 단위 → 내부/외부 그룹핑
  const groups = useMemo(() => {
    const byMonth = new Map<string, Meeting[]>();
    for (const m of list) {
      const key = (m.meetingDate || "").slice(0, 7) || "0000-00";
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key)!.push(m);
    }
    return Array.from(byMonth.keys())
      .sort((a, b) => (a < b ? 1 : -1))
      .map((key) => {
        const items = byMonth.get(key)!;
        const types = (["외부", "내부"] as const).filter((t) => items.some((m) => m.meetingType === t));
        return {
          key,
          monthLabel: key === "0000-00" ? "날짜 미지정" : `${key.slice(0, 4)}년 ${Number(key.slice(5, 7))}월`,
          items,
          sections: types.map((type) => ({ type, items: items.filter((m) => m.meetingType === type) })),
        };
      });
  }, [list]);

  const run = (p: Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      try {
        const r = await p;
        if (!r.ok) setErr(r.error ?? "오류가 발생했습니다.");
        else {
          setErr("");
          router.refresh();
        }
      } catch (e: any) {
        setErr(`저장 중 오류: ${e?.message || e}`);
      }
    });

  const summarize = (id: string) =>
    start(async () => {
      setBusyId(id);
      try {
        const r = await summarizeMeeting(id);
        if (!r.ok) setErr(r.error ?? "AI 정리 실패");
        else {
          setErr("");
          router.refresh();
        }
      } catch (e: any) {
        setErr(`AI 정리 오류: ${e?.message || e}`);
      } finally {
        setBusyId("");
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

      {working && (
        <div className="card" style={{ padding: 12, marginBottom: 12, fontWeight: 700, color: "var(--accent)", background: "var(--surface-2, rgba(124,92,255,0.08))" }}>
          {working}
        </div>
      )}
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
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {groups.map((g) => (
            <div key={g.key}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "2px 2px 12px", borderBottom: "2px solid var(--line)", paddingBottom: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 800 }}>📅 {g.monthLabel}</span>
                <span className="muted" style={{ fontSize: 12 }}>{g.items.length}건</span>
              </div>
              {g.sections.map((sec) => (
                <div key={sec.type} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: sec.type === "외부" ? "#b45309" : "var(--accent)", margin: "0 2px 8px" }}>
                    {sec.type} 미팅 · {sec.items.length}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {sec.items.map((m) => (
                      <div key={m.id} className="card" style={{ padding: 16 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <button
                  onClick={() => setExpanded((e) => ({ ...e, [m.id]: !e[m.id] }))}
                  title="눌러서 회의록 펼치기/접기"
                  style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
                >
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#fff", background: typeColor(m.meetingType), padding: "2px 8px", borderRadius: 6 }}>{m.meetingType} 미팅</span>
                  <strong style={{ fontSize: 15 }}>{m.title}</strong>
                  <span className="muted" style={{ fontSize: 12.5 }}>{m.meetingDate || "-"}{m.location ? ` · ${m.location}` : ""}</span>
                  <span style={{ fontSize: 12, color: "var(--accent)", fontWeight: 700 }}>{expanded[m.id] ? "▲ 접기" : "▼ 회의록 보기"}</span>
                </button>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button className="btn" style={smBtn} disabled={pending} onClick={() => summarize(m.id)}>
                    {busyId === m.id ? "AI 정리 중…" : m.aiSummary ? "AI 재정리" : "✨ AI 정리"}
                  </button>
                  <div style={{ position: "relative" }}>
                    <button className="btn" style={smBtn} onClick={() => setFileMenu((v) => (v === m.id ? "" : m.id))}>📄 파일로 저장 ▾</button>
                    {fileMenu === m.id && (
                      <>
                        <div onClick={() => setFileMenu("")} style={{ position: "fixed", inset: 0, zIndex: 20 }} />
                        <div className="card" style={{ position: "absolute", top: "112%", right: 0, zIndex: 30, padding: 6, minWidth: 200, boxShadow: "0 8px 28px rgba(0,0,0,0.2)" }}>
                          <MenuItem label="📄 PDF로 저장 (인쇄)" onClick={() => { setFileMenu(""); doSave(m, "pdf"); }} />
                          <MenuItem label="📝 Word 문서(.doc)" onClick={() => { setFileMenu(""); doSave(m, "doc"); }} />
                          <MenuItem label="📤 공유 · 구글 드라이브" onClick={() => { setFileMenu(""); doSave(m, "share"); }} />
                        </div>
                      </>
                    )}
                  </div>
                  <button className="btn" style={smBtn} onClick={() => { setEdit(m); setOpen(true); }}>수정</button>
                  <button className="btn" style={{ ...smBtn, color: "var(--owner, #b91c1c)" }} disabled={pending} onClick={() => { if (confirm("삭제할까요?")) run(deleteMeeting(m.id, m.filePath || undefined)); }}>삭제</button>
                </div>
              </div>

              {m.attendees && <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>참석: {m.attendees}</div>}

              {m.filePath && (
                <div style={{ marginTop: 10 }}>
                  <a href={publicBase + m.filePath} target="_blank" rel="noreferrer" className="btn" style={{ ...smBtn, textDecoration: "none" }}>📎 {m.fileName || "첨부파일"} 열기 ↗</a>
                </div>
              )}

              {expanded[m.id] && (
                <div style={{ marginTop: 12 }}>
                  {m.aiSummary ? (
                    <div style={{ padding: 14, background: "var(--surface-2, rgba(127,127,127,0.06))", borderRadius: "var(--radius)", border: "1px solid var(--line)" }}>
                      <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--accent)", marginBottom: 6 }}>✨ AI 정리 회의록</div>
                      <div style={{ fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.65 }}>{m.aiSummary}</div>
                    </div>
                  ) : m.body ? (
                    <div>
                      <div className="muted" style={{ fontSize: 11.5, marginBottom: 4 }}>작성 원문 (‘✨ AI 정리’를 누르면 회의록으로 정리됩니다)</div>
                      <div style={{ fontSize: 13.5, whiteSpace: "pre-wrap", lineHeight: 1.6, color: "var(--ink)" }}>{m.body}</div>
                    </div>
                  ) : (
                    <div className="muted" style={{ fontSize: 13 }}>아직 정리된 내용이 없습니다. ‘✨ AI 정리’를 누르면 회의록이 생성됩니다.</div>
                  )}
                </div>
              )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
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
          onSubmit={(input, autoAi) => saveAndProcess(input, autoAi)}
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
  onSubmit,
}: {
  initial: Meeting | null;
  today: string;
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: MeetingInput, autoAi: boolean) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recordedBlobRef = useRef<Blob | null>(null);
  const activeRef = useRef(false);
  const wakeLockRef = useRef<any>(null);
  const [fileName, setFileName] = useState("");
  const [recording, setRecording] = useState(false);
  const [micSupported, setMicSupported] = useState(true);
  const [sttSupported, setSttSupported] = useState(true);
  const [recNote, setRecNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [upErr, setUpErr] = useState("");
  const [needStorage, setNeedStorage] = useState(false);

  const acquireWakeLock = async () => {
    try {
      if ((navigator as any).wakeLock) wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
    } catch {
      /* ignore */
    }
  };
  const releaseWakeLock = () => {
    try {
      wakeLockRef.current?.release?.();
    } catch {
      /* ignore */
    }
    wakeLockRef.current = null;
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") setMicSupported(false);
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) setSttSupported(false);
    // 화면 복귀 시: wake lock 재획득 + (중단됐다면) 음성인식 재개
    const onVis = async () => {
      if (document.visibilityState === "visible" && activeRef.current) {
        if (!wakeLockRef.current) await acquireWakeLock();
        try { recognitionRef.current?.start?.(); } catch { /* 이미 실행 중이면 무시 */ }
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      activeRef.current = false;
      releaseWakeLock();
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
    await acquireWakeLock(); // 녹음 중 화면 꺼짐 방지
  };

  const stopRec = () => {
    activeRef.current = false;
    releaseWakeLock();
    stopAll();
    setRecording(false);
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (recording) stopRec();
    const fd = new FormData(e.currentTarget);

    // 첨부 파일 결정: 선택 파일 우선, 없으면 녹음본
    let file: File | null = null;
    const chosen = fd.get("file");
    if (chosen instanceof File && chosen.size > 0) file = chosen;
    else if (recordedBlobRef.current) {
      const ext = (recordedBlobRef.current.type || "audio/webm").includes("ogg") ? "ogg" : "webm";
      file = new File([recordedBlobRef.current], `녹음_${String(fd.get("title") || "meeting")}.${ext}`, {
        type: recordedBlobRef.current.type || "audio/webm",
      });
    }

    const titleVal = String(fd.get("title") ?? "").trim();
    const bodyVal = String(fd.get("body") ?? "").trim();
    if (!file && !titleVal && !bodyVal) {
      setUpErr("제목을 입력하거나 회의 내용을 작성/녹음하세요.");
      return;
    }

    let filePath: string | undefined;
    let fileName: string | undefined;
    if (file) {
      setUploading(true);
      setUpErr("");
      setNeedStorage(false);
      const res = await uploadMeetingFile(file);
      setUploading(false);
      if (!res.ok) {
        setUpErr(res.error || "파일 업로드에 실패했습니다.");
        if (res.permission) setNeedStorage(true);
        return; // 모달 유지 — 텍스트는 그대로 두고 다시 시도 가능
      }
      filePath = res.path;
      fileName = file.name;
    }

    // 음성 녹음·음성파일이 쓰였거나, 제목 없이 내용만 있으면 AI가 제목·회의록 자동 생성
    const isAudioFile = !!file && /\.(m4a|mp3|wav|webm|ogg|oga|aac|mp4|mpeg|mpga|flac)$/i.test(file.name);
    const autoAi = !!recordedBlobRef.current || isAudioFile || (!titleVal && !!bodyVal);

    onSubmit(
      {
        id: initial?.id,
        title: titleVal,
        meetingType: String(fd.get("meeting_type") ?? "내부"),
        meetingDate: String(fd.get("meeting_date") ?? ""),
        attendees: String(fd.get("attendees") ?? ""),
        location: String(fd.get("location") ?? ""),
        body: bodyVal,
        filePath,
        fileName,
      },
      autoAi
    );
    onClose();
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
            <Field label="제목 (비우면 녹음·내용 기반으로 AI가 자동 생성)"><input name="title" style={inputStyle} defaultValue={initial?.title ?? ""} placeholder="비워두면 AI가 제목을 지어줍니다" /></Field>
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
              <span style={{ color: "#b91c1c", fontWeight: 700, fontSize: 13 }}>● 녹음 중… 말하면 자동 기록 · 화면 꺼짐 방지 중 (앱을 벗어나면 멈춤)</span>
            ) : (
              <span className="muted" style={{ fontSize: 12 }}>
                {recNote || (sttSupported ? "녹음하면 자동 텍스트화 + 화면 꺼짐 방지. 저장하면 AI가 제목·회의록 자동 생성. (브라우저 특성상 앱을 벗어나거나 화면을 직접 끄면 녹음이 멈추니 앱을 켜 두세요.)" : "이 브라우저는 자동 텍스트화 미지원 — Chrome·Edge 권장(녹음 파일은 첨부됩니다).")}
              </span>
            )}
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="회의 내용 (직접 작성 또는 🎙 녹음 — AI가 정리해 드립니다)">
              <textarea ref={textareaRef} name="body" rows={7} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} defaultValue={initial?.body ?? ""} placeholder="논의된 내용을 자유롭게 적거나, 위 ‘음성 녹음’으로 받아 적으세요. 저장 후 ‘AI 정리’를 누르면 회의록 형식으로 정리됩니다." />
            </Field>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="파일 첨부 (선택 · 사진·문서·녹음, 45MB 이하)">
              <input type="file" name="file" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")} style={{ ...inputStyle, padding: 8 }} />
            </Field>
            {initial?.fileName && !fileName && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>현재 첨부: {initial.fileName} (새 파일 선택 시 교체)</div>}
          </div>
        </div>

        {upErr && <div style={{ marginTop: 12, color: "var(--owner, #b91c1c)", fontSize: 13 }}>{upErr}</div>}
        {needStorage && (
          <div style={{ marginTop: 10 }}>
            <DbSetupNotice title="파일 업로드 저장소 권한(최초 1회)" sql={STORAGE_SQL} />
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button type="button" className="btn" onClick={onClose}>취소</button>
          <button type="submit" className="btn" disabled={pending || uploading} style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}>
            {uploading ? "파일 업로드 중…" : "저장"}
          </button>
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
