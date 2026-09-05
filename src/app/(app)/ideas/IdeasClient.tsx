"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createIdea, updateIdea, deleteIdea, setIdeaStatus, setIdeaPinned, aiIdea, listRevisions, restoreRevision, type Revision } from "./actions";
import FolderHistoryButton from "@/components/FolderHistoryButton";

export type Idea = { id: string; title: string; body: string; tags: string; status: string; pinned: boolean; updatedAt: string };

const STATUSES = ["수집", "발전중", "보류", "실행"] as const;
const STATUS_COLOR: Record<string, string> = { 수집: "#64748b", 발전중: "#7c3aed", 보류: "#a16207", 실행: "#16a34a" };
const AI_MODES: { key: string; label: string }[] = [
  { key: "발전", label: "💡 발전시키기" },
  { key: "실행계획", label: "🗺 실행계획" },
  { key: "리스크", label: "⚠️ 리스크" },
  { key: "네이밍", label: "🏷 네이밍" },
];

const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 11px", border: "1px solid var(--line-2)", borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--ink)", fontSize: 14 };

function fmtDateTime(s: string) {
  try { return new Date(s).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  catch { return s; }
}

function IdeaForm({ initial, onSaved, onCancel }: { initial: Idea | null; onSaved: () => void; onCancel: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [tags, setTags] = useState(initial?.tags ?? "");
  const [status, setStatus] = useState(initial?.status ?? "수집");
  const [err, setErr] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState("");
  const [aiResult, setAiResult] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  // 음성 입력(본문에 이어붙이기)
  const [listening, setListening] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  const recRef = useRef<any>(null);
  const baseRef = useRef("");
  useEffect(() => { setMicSupported(typeof window !== "undefined" && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)); }, []);
  useEffect(() => () => { try { recRef.current?.stop(); } catch { /* noop */ } }, []);

  const toggleMic = () => {
    if (listening) { try { recRef.current?.stop(); } catch { /* noop */ } setListening(false); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "ko-KR"; rec.interimResults = true; rec.continuous = true;
    baseRef.current = body ? body + " " : "";
    let finalT = "";
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalT += t + " "; else interim += t;
      }
      setBody((baseRef.current + finalT + interim).trimStart());
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec; setListening(true);
    try { rec.start(); } catch { setListening(false); }
  };

  const runAi = (mode: string) => {
    if (!title.trim() && !body.trim()) { setErr("먼저 아이디어 제목이나 내용을 입력하세요."); return; }
    setErr(null); setAiResult(""); setAiBusy(mode);
    start(async () => {
      const r = await aiIdea(mode, title, body);
      setAiBusy("");
      if (!r.ok) { setErr(r.error ?? "AI 오류"); return; }
      setAiResult(r.text ?? "");
    });
  };
  const appendAi = () => { if (aiResult) { setBody((b) => (b ? b + "\n\n" : "") + aiResult); setAiResult(""); } };

  const save = () => {
    if (!title.trim() && !body.trim()) { setErr("제목이나 내용을 입력하세요."); return; }
    start(async () => {
      const r = initial?.id ? await updateIdea(initial.id, title, body, tags, status) : await createIdea(title, body, tags, status);
      if (!r.ok) { setErr(r.error ?? "저장 실패"); return; }
      onSaved(); void 0; /* 서버 액션의 revalidatePath 가 화면을 갱신 — 이중 새로고침 제거 */
    });
  };

  return (
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="아이디어 제목" style={{ ...inputStyle, fontWeight: 700, marginBottom: 8 }} />
      <div style={{ position: "relative" }}>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder={listening ? "듣는 중… 말씀하세요" : "내용 (🎤로 음성 입력 가능)"} style={{ ...inputStyle, resize: "vertical", paddingRight: 48 }} />
        {micSupported && (
          <button type="button" onClick={toggleMic} title={listening ? "중지" : "음성 입력"} style={{ position: "absolute", top: 8, right: 8, width: 34, height: 34, borderRadius: 8, border: "1px solid var(--line-2)", cursor: "pointer", fontSize: 17, background: listening ? "var(--owner, #dc2626)" : "var(--surface)", color: listening ? "#fff" : "var(--ink)" }}>🎤</button>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="태그(콤마)" style={{ ...inputStyle, width: "auto", flex: "1 1 160px" }} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
        <span className="muted" style={{ fontSize: 12, alignSelf: "center" }}>AI:</span>
        {AI_MODES.map((m) => (
          <button key={m.key} type="button" className="btn sm" onClick={() => runAi(m.key)} disabled={pending}>{aiBusy === m.key ? "생각 중…" : m.label}</button>
        ))}
      </div>
      {aiResult && (
        <div className="card" style={{ padding: 12, marginTop: 10, background: "var(--line)" }}>
          <div style={{ fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.6, maxHeight: 260, overflow: "auto" }}>{aiResult}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button type="button" className="btn sm primary" onClick={appendAi}>＋ 본문에 추가</button>
            <button type="button" className="btn sm" onClick={() => setAiResult("")}>닫기</button>
          </div>
        </div>
      )}

      {err && <div style={{ color: "var(--owner)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button className="btn primary" onClick={save} disabled={pending}>{pending ? "저장 중…" : "저장"}</button>
        <button className="btn" onClick={onCancel} disabled={pending}>취소</button>
      </div>
    </div>
  );
}

function RevisionsModal({ idea, onClose, onRestored }: { idea: Idea; onClose: () => void; onRestored: () => void }) {
  const [items, setItems] = useState<Revision[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  useEffect(() => { (async () => { const r = await listRevisions(idea.id); if (r.ok) setItems(r.items ?? []); else setErr(r.error ?? "불러오기 실패"); })(); }, [idea.id]);

  const restore = (revId: string) => {
    if (!confirm("이 버전으로 복원할까요? (현재 내용은 기록에 자동 저장됩니다)")) return;
    start(async () => { const r = await restoreRevision(idea.id, revId); if (r.ok) { onRestored(); void 0; /* 서버 액션의 revalidatePath 가 화면을 갱신 — 이중 새로고침 제거 */ onClose(); } else setErr(r.error ?? "복원 실패"); });
  };

  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, background: "rgba(16,20,24,0.5)", display: "grid", placeItems: "center", zIndex: 150, padding: 16 }}>
      <div className="card" onMouseDown={(e) => e.stopPropagation()} style={{ padding: 18, width: "100%", maxWidth: 560, maxHeight: "88vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>🕘 버전 기록 · 복원</h3>
          <button className="btn sm" onClick={onClose}>닫기 ✕</button>
        </div>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>날짜·시간을 눌러 그 시점으로 복원합니다. &ldquo;{idea.title || "제목 없음"}&rdquo;</div>
        {err && <div style={{ color: "var(--owner)", fontSize: 12.5, marginBottom: 8 }}>{err}</div>}
        {!items ? <div className="muted" style={{ fontSize: 13 }}>불러오는 중…</div> :
          items.length === 0 ? <div className="card muted" style={{ padding: 20, textAlign: "center" }}>아직 저장 기록이 없습니다. 내용을 수정·저장하면 이전 버전이 여기에 쌓입니다.</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map((r) => (
                <div key={r.id} className="card" style={{ padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>🕒 {fmtDateTime(r.createdAt)} {r.note && <span className="muted" style={{ fontWeight: 400 }}>· {r.note}</span>} {r.status && <span className="badge" style={{ background: STATUS_COLOR[r.status] ?? "#64748b", color: "#fff" }}>{r.status}</span>}</div>
                    <button className="btn sm primary" onClick={() => restore(r.id)} disabled={pending}>이 버전으로 복원</button>
                  </div>
                  {(r.title || r.body) && <div className="muted" style={{ fontSize: 12.5, marginTop: 6, whiteSpace: "pre-wrap", maxHeight: 90, overflow: "hidden" }}>{[r.title, r.body].filter(Boolean).join(" — ").slice(0, 260)}</div>}
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

function Row({ idea, onEdit, onHistory }: { idea: Idea; onEdit: () => void; onHistory: () => void }) {
  const [pending, start] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();
  const color = STATUS_COLOR[idea.status] ?? "#64748b";
  const tags = idea.tags ? idea.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
  const remove = () => { if (!confirm("이 아이디어를 삭제할까요?")) return; start(async () => { await deleteIdea(idea.id); void 0; /* 서버 액션의 revalidatePath 가 화면을 갱신 — 이중 새로고침 제거 */ }); };
  const pin = () => start(async () => { await setIdeaPinned(idea.id, !idea.pinned); void 0; /* 서버 액션의 revalidatePath 가 화면을 갱신 — 이중 새로고침 제거 */ });
  const changeStatus = (s: string) => start(async () => { await setIdeaStatus(idea.id, s); void 0; /* 서버 액션의 revalidatePath 가 화면을 갱신 — 이중 새로고침 제거 */ });
  const long = (idea.body || "").length > 180;

  return (
    <div className="card" style={{ padding: 14, borderLeft: `4px solid ${color}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {idea.pinned && <span className="badge" style={{ background: "var(--accent)", color: "var(--accent-ink)" }}>📌</span>}
            <span className="badge" style={{ background: color, color: "#fff" }}>{idea.status}</span>
            <strong style={{ fontSize: 15 }}>{idea.title || "(제목 없음)"}</strong>
          </div>
          {idea.body && <div style={{ fontSize: 13.5, marginTop: 6, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{long && !expanded ? idea.body.slice(0, 180) + "…" : idea.body}{long && <button className="btn sm" style={{ marginLeft: 6, padding: "0 6px" }} onClick={() => setExpanded((v) => !v)}>{expanded ? "접기" : "더보기"}</button>}</div>}
          {tags.length > 0 && <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>{tags.map((t) => <span key={t} className="badge" style={{ background: "var(--line)", color: "var(--ink-2)" }}>#{t}</span>)}</div>}
          <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>수정 {fmtDateTime(idea.updatedAt)}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
          <select value={idea.status} onChange={(e) => changeStatus(e.target.value)} disabled={pending} style={{ ...inputStyle, width: "auto", padding: "4px 8px", fontSize: 12 }}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button className="btn sm" onClick={pin} title="고정" style={idea.pinned ? { background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" } : undefined}>📌</button>
            <button className="btn sm" onClick={onHistory} title="버전 기록·복원">🕘</button>
            <button className="btn sm" onClick={onEdit}>수정</button>
            <button className="btn sm" onClick={remove} disabled={pending} style={{ color: "var(--owner)" }}>삭제</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function IdeasClient({ items, dbReady }: { items: Idea[]; dbReady: boolean }) {
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [history, setHistory] = useState<Idea | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("전체");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter((i) => {
      if (status !== "전체" && (i.status || "수집") !== status) return false;
      if (!s) return true;
      return [i.title, i.body, i.tags].filter(Boolean).join(" ").toLowerCase().includes(s);
    });
  }, [items, q, status]);

  const counts = useMemo(() => { const m: Record<string, number> = {}; items.forEach((i) => { const k = i.status || "수집"; m[k] = (m[k] ?? 0) + 1; }); return m; }, [items]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>💡 아이디어 관리</h1>
          <p>대표님만 보는 아이디어 보관함 · AI 발전 · 🎤 음성 입력 · 버전 복원</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <FolderHistoryButton entity="ideas" label="아이디어" />
          {!adding && <button className="btn primary" onClick={() => { setEditId(null); setAdding(true); }}>+ 아이디어 추가</button>}
        </div>
      </div>

      {!dbReady && <div className="card" style={{ padding: 14, marginBottom: 14 }}><div className="empty">테이블이 아직 준비되지 않았습니다. 마이그레이션(0071_ideas)을 적용해 주세요.</div></div>}

      {adding && <IdeaForm initial={null} onSaved={() => setAdding(false)} onCancel={() => setAdding(false)} />}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {["전체", ...STATUSES].map((t) => { const n = t === "전체" ? items.length : counts[t] ?? 0; return <button key={t} className={`btn sm${status === t ? " primary" : ""}`} onClick={() => setStatus(t)}>{t} {n > 0 && <span style={{ opacity: 0.7 }}>({n})</span>}</button>; })}
      </div>
      <div style={{ marginBottom: 14, maxWidth: 360 }}>
        <input placeholder="제목·내용·태그 검색" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%" }} />
      </div>

      {filtered.length === 0 ? (
        <div className="card"><div className="empty">{q || status !== "전체" ? "해당 결과가 없습니다." : "아이디어가 없습니다. “+ 아이디어 추가”로 시작하세요."}</div></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((i) => (
            editId === i.id
              ? <IdeaForm key={i.id} initial={i} onSaved={() => setEditId(null)} onCancel={() => setEditId(null)} />
              : <Row key={i.id} idea={i} onEdit={() => { setAdding(false); setEditId(i.id); }} onHistory={() => setHistory(i)} />
          ))}
        </div>
      )}

      {history && <RevisionsModal idea={history} onClose={() => setHistory(null)} onRestored={() => setHistory(null)} />}
    </div>
  );
}
