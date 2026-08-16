"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FOLDER_GROUPS } from "@/lib/folders";
import { askAssistant, type ChatMsg } from "@/lib/assistantActions";

function usePageLabel(): string {
  const path = usePathname() || "/";
  return useMemo(() => {
    let best = "";
    let label = "";
    for (const g of FOLDER_GROUPS) {
      for (const it of g.items) {
        if ((path === it.href || path.startsWith(it.href + "/")) && it.href.length > best.length) { best = it.href; label = it.label; }
      }
    }
    return label || path;
  }, [path]);
}

const QUICK = ["이 폴더 데이터 요약해줘", "지금 뭐부터 하면 좋아?", "고객 문자 초안 써줘", "영어로 번역해줘"];

export default function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false); // 답변 읽어주기 + 핸즈프리 대화 루프
  const [recogSupported, setRecogSupported] = useState(false);
  const [speakSupported, setSpeakSupported] = useState(false);
  const pageLabel = usePageLabel();
  const pathname = usePathname() || "/";
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const recogRef = useRef<any>(null);
  const voiceOnRef = useRef(false);
  const pendingRef = useRef(false);

  useEffect(() => { voiceOnRef.current = voiceOn; }, [voiceOn]);
  useEffect(() => { pendingRef.current = pending; }, [pending]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setRecogSupported(!!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition));
    setSpeakSupported(!!window.speechSynthesis);
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, pending, open]);

  // 정리
  useEffect(() => () => {
    try { recogRef.current?.stop(); } catch { /* noop */ }
    try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
  }, []);

  const speak = (text: string) => {
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text.slice(0, 2000));
      u.lang = "ko-KR";
      const v = synth.getVoices().find((vv) => (vv.lang || "").toLowerCase().startsWith("ko"));
      if (v) u.voice = v;
      u.onend = () => { if (voiceOnRef.current) startListening(); };
      synth.speak(u);
    } catch { /* noop */ }
  };

  const startListening = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR || pendingRef.current) return;
    try { recogRef.current?.stop(); } catch { /* noop */ }
    const rec = new SR();
    rec.lang = "ko-KR";
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let finalText = "";
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t; else interim += t;
      }
      setInput((finalText + interim).trim());
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => {
      setListening(false);
      const t = finalText.trim();
      if (t) send(t);
    };
    recogRef.current = rec;
    setListening(true);
    try { rec.start(); } catch { setListening(false); }
  };

  const stopListening = () => { try { recogRef.current?.stop(); } catch { /* noop */ } setListening(false); };
  const toggleMic = () => (listening ? stopListening() : startListening());

  const toggleVoice = () => {
    const nv = !voiceOn;
    setVoiceOn(nv);
    if (nv) { if (!listening && !pending) startListening(); } // 대화 시작
    else { try { window.speechSynthesis?.cancel(); } catch { /* noop */ } stopListening(); }
  };

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || pendingRef.current) return;
    setErr(null);
    const next: ChatMsg[] = [...msgs, { role: "user", content: t }];
    setMsgs(next);
    setInput("");
    setPending(true);
    try {
      // 서버 액션이 시간초과로 죽거나 네트워크가 끊겨도 '생각 중…'에서 멈추지 않도록
      // 클라이언트에서도 상한 시간을 둔다(서버 maxDuration 60초 + 여유).
      const r = await Promise.race([
        askAssistant(next, pathname),
        new Promise<{ ok: false; error: string }>((_, rej) =>
          setTimeout(() => rej(new Error("timeout")), 70000)
        ),
      ]);
      if (!r.ok) { setErr(r.error ?? "오류"); return; }
      const reply = r.text ?? "";
      setMsgs((p) => [...p, { role: "assistant", content: reply }]);
      if ((r as any).edited) router.refresh(); // 편집이 반영됐으면 폴더 화면 새로고침
      if (voiceOnRef.current && reply) speak(reply); // 읽어주고 끝나면 다시 듣기(루프)
    } catch (e: any) {
      const m = e?.message === "timeout"
        ? "응답이 지연되고 있어요. 요청을 조금 더 짧게 나눠서 다시 시도해 주세요."
        : `연결 오류: ${e?.message || "잠시 후 다시 시도해 주세요."}`;
      setErr(m);
    } finally {
      setPending(false); // 성공·실패·시간초과 어떤 경우에도 로딩 상태 해제
    }
  };

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} aria-label="AI 어시스턴트 열기"
          style={{ position: "fixed", right: 16, bottom: "calc(env(safe-area-inset-bottom, 0px) + 74px)", zIndex: 120, width: 54, height: 54, borderRadius: "50%", border: "none", cursor: "pointer", background: "linear-gradient(135deg, #7c5cff, #d946ef)", color: "#fff", fontSize: 24, boxShadow: "0 6px 20px rgba(124,92,255,0.45)" }}>
          🤖
        </button>
      )}

      {open && (
        <div style={{ position: "fixed", zIndex: 130, right: 12, bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)", width: "min(420px, calc(100vw - 24px))", height: "min(620px, calc(100vh - 90px))", display: "flex", flexDirection: "column", background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--line-2)", borderRadius: 16, overflow: "hidden", boxShadow: "0 12px 40px rgba(0,0,0,0.35)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "linear-gradient(135deg, #7c5cff, #d946ef)", color: "#fff" }}>
            <span style={{ fontSize: 18 }}>🤖</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>AI 어시스턴트</div>
              <div style={{ fontSize: 11, opacity: 0.9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>현재: {pageLabel}{voiceOn ? " · 🎙 음성대화" : ""}</div>
            </div>
            {speakSupported && recogSupported && (
              <button onClick={toggleVoice} title={voiceOn ? "음성 대화 끄기" : "음성 대화(읽어주기+듣기)"} style={{ ...fabBtn, background: voiceOn ? "#fff" : "rgba(255,255,255,0.2)", color: voiceOn ? "#7c3aed" : "#fff" }}>{voiceOn ? "🔊" : "🔈"}</button>
            )}
            {msgs.length > 0 && <button onClick={() => { setMsgs([]); setErr(null); }} title="새 대화" style={fabBtn}>🗑</button>}
            <button onClick={() => { setOpen(false); stopListening(); try { window.speechSynthesis?.cancel(); } catch { /* noop */ } }} title="닫기" style={fabBtn}>✕</button>
          </div>

          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {msgs.length === 0 && (
              <div style={{ margin: "auto 0", textAlign: "center", color: "var(--ink-2)" }}>
                <div style={{ fontSize: 30 }}>💬</div>
                <div style={{ fontSize: 13, marginTop: 6 }}>무엇이든 물어보세요. 🎤로 말해도 됩니다.</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginTop: 12 }}>
                  {QUICK.map((q) => <button key={q} className="btn sm" onClick={() => send(q)}>{q}</button>)}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "88%" }}>
                <div style={{ padding: "8px 11px", borderRadius: 12, fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word", background: m.role === "user" ? "var(--accent)" : "var(--line)", color: m.role === "user" ? "var(--accent-ink)" : "var(--ink)" }}>{m.content}</div>
              </div>
            ))}
            {pending && <div style={{ alignSelf: "flex-start", color: "var(--ink-2)", fontSize: 13 }}>생각 중…</div>}
            {err && <div style={{ color: "var(--owner)", fontSize: 12.5 }}>{err}</div>}
          </div>

          <div style={{ display: "flex", gap: 6, padding: 10, borderTop: "1px solid var(--line)", alignItems: "flex-end" }}>
            {recogSupported && (
              <button onClick={toggleMic} title={listening ? "듣는 중… (탭하면 중지)" : "음성 입력"} className="btn" style={{ padding: "0 12px", alignSelf: "stretch", background: listening ? "var(--owner, #dc2626)" : "var(--surface)", color: listening ? "#fff" : "var(--ink)", borderColor: listening ? "var(--owner, #dc2626)" : "var(--line-2)", fontSize: 18 }}>🎤</button>
            )}
            <textarea value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
              rows={1} placeholder={listening ? "듣는 중… 말씀하세요" : "메시지 입력 (Enter 전송)"}
              style={{ flex: 1, resize: "none", maxHeight: 120, padding: "9px 11px", border: "1px solid var(--line-2)", borderRadius: 10, background: "var(--surface)", color: "var(--ink)", fontSize: 13.5, fontFamily: "inherit" }} />
            <button className="btn" onClick={() => send(input)} disabled={pending || !input.trim()} style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)", alignSelf: "stretch", padding: "0 14px" }}>전송</button>
          </div>
        </div>
      )}
    </>
  );
}

const fabBtn: React.CSSProperties = { background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", width: 28, height: 28, borderRadius: 8, cursor: "pointer", fontSize: 13 };
