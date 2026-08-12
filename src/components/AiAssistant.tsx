"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { FOLDER_GROUPS } from "@/lib/folders";
import { askAssistant, type ChatMsg } from "@/lib/assistantActions";

// 현재 경로 → 사람이 읽는 화면 이름(사이드바 라벨 기준).
function usePageLabel(): string {
  const path = usePathname() || "/";
  return useMemo(() => {
    let best = "";
    for (const g of FOLDER_GROUPS) {
      for (const it of g.items) {
        if (path === it.href || path.startsWith(it.href + "/")) {
          if (it.href.length > best.length) best = it.label;
        }
      }
    }
    return (best || path).replace(/^[^\s]+\s/, (m) => m); // 이모지 포함 라벨 그대로
  }, [path]);
}

const QUICK = ["이 폴더 데이터 요약해줘", "지금 뭐부터 하면 좋아?", "고객 문자 초안 써줘", "영어로 번역해줘"];

export default function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pageLabel = usePageLabel();
  const pathname = usePathname() || "/";
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, pending, open]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || pending) return;
    setErr(null);
    const next: ChatMsg[] = [...msgs, { role: "user", content: t }];
    setMsgs(next);
    setInput("");
    setPending(true);
    const r = await askAssistant(next, pathname);
    setPending(false);
    if (!r.ok) { setErr(r.error ?? "오류"); return; }
    setMsgs((p) => [...p, { role: "assistant", content: r.text ?? "" }]);
  };

  return (
    <>
      {/* 플로팅 버튼 */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="AI 어시스턴트 열기"
          className="ai-fab"
          style={{
            position: "fixed", right: 16, bottom: "calc(env(safe-area-inset-bottom, 0px) + 74px)", zIndex: 120,
            width: 54, height: 54, borderRadius: "50%", border: "none", cursor: "pointer",
            background: "linear-gradient(135deg, #7c5cff, #d946ef)", color: "#fff", fontSize: 24,
            boxShadow: "0 6px 20px rgba(124,92,255,0.45)",
          }}
        >
          🤖
        </button>
      )}

      {open && (
        <div
          style={{
            position: "fixed", zIndex: 130, right: 12, bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
            width: "min(420px, calc(100vw - 24px))", height: "min(620px, calc(100vh - 90px))",
            display: "flex", flexDirection: "column", background: "var(--surface)", color: "var(--ink)",
            border: "1px solid var(--line-2)", borderRadius: 16, overflow: "hidden", boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
          }}
        >
          {/* 헤더 */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "linear-gradient(135deg, #7c5cff, #d946ef)", color: "#fff" }}>
            <span style={{ fontSize: 18 }}>🤖</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>AI 어시스턴트</div>
              <div style={{ fontSize: 11, opacity: 0.9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>현재: {pageLabel}</div>
            </div>
            {msgs.length > 0 && <button onClick={() => { setMsgs([]); setErr(null); }} title="새 대화" style={fabBtn}>🗑</button>}
            <button onClick={() => setOpen(false)} title="닫기" style={fabBtn}>✕</button>
          </div>

          {/* 대화 */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10, background: "var(--bg, var(--surface))" }}>
            {msgs.length === 0 && (
              <div style={{ margin: "auto 0", textAlign: "center", color: "var(--ink-2)" }}>
                <div style={{ fontSize: 30 }}>💬</div>
                <div style={{ fontSize: 13, marginTop: 6 }}>무엇이든 물어보세요. 초안·요약·번역·아이디어까지.</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginTop: 12 }}>
                  {QUICK.map((q) => (
                    <button key={q} className="btn sm" onClick={() => send(q)}>{q}</button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "88%" }}>
                <div
                  style={{
                    padding: "8px 11px", borderRadius: 12, fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word",
                    background: m.role === "user" ? "var(--accent)" : "var(--line)",
                    color: m.role === "user" ? "var(--accent-ink)" : "var(--ink)",
                  }}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {pending && <div style={{ alignSelf: "flex-start", color: "var(--ink-2)", fontSize: 13 }}>생각 중…</div>}
            {err && <div style={{ color: "var(--owner)", fontSize: 12.5 }}>{err}</div>}
          </div>

          {/* 입력 */}
          <div style={{ display: "flex", gap: 6, padding: 10, borderTop: "1px solid var(--line)" }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
              rows={1}
              placeholder="메시지 입력 (Enter 전송 · Shift+Enter 줄바꿈)"
              style={{ flex: 1, resize: "none", maxHeight: 120, padding: "9px 11px", border: "1px solid var(--line-2)", borderRadius: 10, background: "var(--surface)", color: "var(--ink)", fontSize: 13.5, fontFamily: "inherit" }}
            />
            <button className="btn" onClick={() => send(input)} disabled={pending || !input.trim()} style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)", alignSelf: "stretch", padding: "0 14px" }}>전송</button>
          </div>
        </div>
      )}
    </>
  );
}

const fabBtn: React.CSSProperties = { background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", width: 28, height: 28, borderRadius: 8, cursor: "pointer", fontSize: 13 };
