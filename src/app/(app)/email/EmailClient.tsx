"use client";

import { useState, useTransition } from "react";
import { listInbox, openMessage, sendMail } from "./actions";
import type { MailHeader, MailFull } from "@/lib/gmail";

type Tab = { key: string; label: string };
const TABS: Tab[] = [
  { key: "INBOX", label: "받은편지함" },
  { key: "SENT", label: "보낸편지함" },
  { key: "", label: "전체" },
];

const SETUP_GUIDE = `1) Google Workspace 관리콘솔(admin.google.com) 로그인
2) 보안 → 액세스 및 데이터 제어 → API 제어 → 도메인 전체 위임 관리
3) '새로 추가' → 서비스계정의 클라이언트 ID 입력
4) OAuth 범위에 아래 두 개를 추가하고 저장:
   https://www.googleapis.com/auth/gmail.modify
   https://www.googleapis.com/auth/gmail.send
5) Vercel 환경변수에 GMAIL_USER=uc@unocompany.net 확인 후 재배포`;

function nameOf(addr: string): string {
  if (!addr) return "(알 수 없음)";
  const m = addr.match(/^\s*"?([^"<]+?)"?\s*<([^>]+)>/);
  if (m) return m[1].trim() || m[2].trim();
  return addr.trim();
}
function emailOf(addr: string): string {
  const m = addr.match(/<([^>]+)>/);
  return (m ? m[1] : addr).trim();
}
function fmtTs(ts: number): string {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

type ComposeState = {
  to: string;
  cc: string;
  subject: string;
  body: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
} | null;

export default function EmailClient({
  mailbox,
  configured,
  initial,
  initialNext,
  initialError,
  initialNeedsSetup,
}: {
  mailbox: string;
  configured: boolean;
  initial: MailHeader[];
  initialNext?: string;
  initialError?: string;
  initialNeedsSetup?: boolean;
}) {
  const [label, setLabel] = useState("INBOX");
  const [q, setQ] = useState("");
  const [messages, setMessages] = useState<MailHeader[]>(initial);
  const [next, setNext] = useState<string | undefined>(initialNext);
  const [error, setError] = useState<string | undefined>(initialError);
  const [needsSetup, setNeedsSetup] = useState(!!initialNeedsSetup);
  const [loading, start] = useTransition();

  const [selected, setSelected] = useState<MailFull | null>(null);
  const [opening, setOpening] = useState(false);
  const [compose, setCompose] = useState<ComposeState>(null);

  const load = (opts: { label?: string; q?: string; append?: boolean; pageToken?: string }) => {
    start(async () => {
      const r = await listInbox({
        label: opts.label ?? label,
        q: opts.q ?? q,
        pageToken: opts.pageToken,
      });
      if (!r.ok) {
        setError(r.error);
        setNeedsSetup(!!r.needsSetup);
        if (!opts.append) setMessages([]);
        return;
      }
      setError(undefined);
      setNeedsSetup(false);
      setNext(r.nextPageToken);
      setMessages((prev) => (opts.append ? [...prev, ...(r.messages ?? [])] : r.messages ?? []));
    });
  };

  const switchTab = (key: string) => {
    setLabel(key);
    setMessages([]);
    load({ label: key, append: false });
  };

  const open = (id: string) => {
    setOpening(true);
    setSelected(null);
    start(async () => {
      const r = await openMessage(id);
      setOpening(false);
      if (!r.ok || !r.message) {
        setError(r.error);
        return;
      }
      setSelected(r.message);
      // 읽음 반영(목록에서 굵게 해제)
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, unread: false } : m)));
    });
  };

  const startReply = (m: MailFull) => {
    const quoted = (m.bodyText || m.snippet || "")
      .split("\n")
      .map((l) => "> " + l)
      .join("\n");
    setCompose({
      to: emailOf(m.from),
      cc: "",
      subject: m.subject.startsWith("Re:") ? m.subject : `Re: ${m.subject}`,
      body: `\n\n\n------- 원본 메일 -------\n보낸사람: ${m.from}\n제목: ${m.subject}\n\n${quoted}`,
      threadId: m.threadId,
      inReplyTo: m.messageId || undefined,
      references: m.references || undefined,
    });
  };

  return (
    <div>
      <div className="page-head" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>📧 이메일 트래킹</h1>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
            회사 메일함 <b>{mailbox}</b> 확인 · 발송
          </p>
        </div>
        <button
          className="btn"
          onClick={() => setCompose({ to: "", cc: "", subject: "", body: "" })}
          style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}
        >
          ✏️ 메일 쓰기
        </button>
      </div>

      {!configured && (
        <div className="card" style={{ borderLeft: "4px solid var(--warn, #f59e0b)", marginBottom: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>서비스계정 미설정</div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
            GOOGLE_SA_CLIENT_EMAIL / GOOGLE_SA_PRIVATE_KEY 환경변수가 필요합니다(드라이브 연동과 동일 계정).
          </p>
        </div>
      )}

      {needsSetup && configured && (
        <div className="card" style={{ borderLeft: "4px solid var(--warn, #f59e0b)", marginBottom: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Gmail 권한 설정 필요 — 도메인 전체 위임</div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
            서비스계정이 회사 메일함을 대신 열람/발송하려면 관리콘솔에서 아래 위임을 허용해야 합니다.
          </p>
          <pre className="pre" style={{ fontSize: 11.5, overflow: "auto", maxHeight: 200 }}>{SETUP_GUIDE}</pre>
        </div>
      )}

      {/* 탭 + 검색 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ display: "inline-flex", border: "1px solid var(--line-2)", borderRadius: "var(--radius)", overflow: "hidden" }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              className="btn"
              onClick={() => switchTab(t.key)}
              style={{
                border: "none",
                borderRadius: 0,
                padding: "8px 14px",
                background: label === t.key ? "var(--accent)" : "var(--surface)",
                color: label === t.key ? "var(--accent-ink)" : "var(--ink-2)",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load({ append: false });
          }}
          style={{ display: "flex", gap: 6, flex: 1, minWidth: 220 }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="검색 (예: from:거래처 · 제목 키워드)"
            style={{ flex: 1, padding: "8px 11px", border: "1px solid var(--line-2)", borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--ink)" }}
          />
          <button className="btn" type="submit" disabled={loading}>검색</button>
        </form>
        <button className="btn" onClick={() => load({ append: false })} disabled={loading} title="새로고침">
          ⟳
        </button>
      </div>

      {error && <div className="card" style={{ padding: 10, marginBottom: 12, color: "var(--owner, #b91c1c)", fontSize: 13 }}>{error}</div>}

      {/* 목록 */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading && messages.length === 0 ? (
          <div className="empty" style={{ padding: 30, textAlign: "center" }} >불러오는 중…</div>
        ) : messages.length === 0 ? (
          <div className="empty" style={{ padding: 30, textAlign: "center" }}>메일이 없습니다.</div>
        ) : (
          messages.map((m, idx) => (
            <div
              key={m.id}
              onClick={() => open(m.id)}
              style={{
                display: "flex",
                gap: 12,
                padding: "11px 14px",
                borderTop: idx === 0 ? "none" : "1px solid var(--line)",
                cursor: "pointer",
                background: m.unread ? "var(--accent-weak, rgba(99,102,241,0.06))" : "transparent",
                alignItems: "baseline",
              }}
            >
              <div style={{ width: 150, flexShrink: 0, fontSize: 13.5, fontWeight: m.unread ? 700 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {m.unread && <span style={{ color: "var(--accent)", marginRight: 4 }}>●</span>}
                {label === "SENT" ? `→ ${nameOf(m.to)}` : nameOf(m.from)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: m.unread ? 700 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {m.subject}
                </div>
                <div className="muted" style={{ fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {m.snippet}
                </div>
              </div>
              <div className="muted" style={{ fontSize: 12, flexShrink: 0, whiteSpace: "nowrap" }}>{fmtTs(m.ts)}</div>
            </div>
          ))
        )}
      </div>

      {next && (
        <div style={{ textAlign: "center", marginTop: 12 }}>
          <button className="btn" disabled={loading} onClick={() => load({ append: true, pageToken: next })}>
            {loading ? "불러오는 중…" : "더 보기"}
          </button>
        </div>
      )}

      {/* 상세 보기 */}
      {(selected || opening) && (
        <div
          onMouseDown={() => { setSelected(null); setOpening(false); }}
          style={{ position: "fixed", inset: 0, background: "rgba(16,20,24,0.55)", display: "grid", placeItems: "center", zIndex: 100, padding: 16 }}
        >
          <div className="card" onMouseDown={(e) => e.stopPropagation()} style={{ padding: 0, width: "100%", maxWidth: 720, maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {opening && !selected ? (
              <div className="empty" style={{ padding: 40, textAlign: "center" }}>메일을 여는 중…</div>
            ) : selected ? (
              <>
                <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--line)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                    <h3 style={{ margin: 0, fontSize: 17 }}>{selected.subject}</h3>
                    <button className="btn" onClick={() => setSelected(null)} style={{ padding: "3px 9px", flexShrink: 0 }}>닫기</button>
                  </div>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.6 }}>
                    <div><b>보낸사람</b> {selected.from}</div>
                    <div><b>받는사람</b> {selected.to}</div>
                    {selected.cc && <div><b>참조</b> {selected.cc}</div>}
                    <div><b>일시</b> {fmtTs(selected.ts)}</div>
                  </div>
                  {selected.attachments.length > 0 && (
                    <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {selected.attachments.map((a, i) => (
                        <span key={i} className="badge" style={{ fontSize: 11.5 }}>📎 {a.filename}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, overflow: "auto", background: "#fff" }}>
                  {selected.bodyHtml ? (
                    <iframe
                      title="메일 본문"
                      sandbox=""
                      srcDoc={selected.bodyHtml}
                      style={{ width: "100%", height: "48vh", border: "none", background: "#fff" }}
                    />
                  ) : (
                    <pre style={{ margin: 0, padding: 18, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "inherit", fontSize: 14, lineHeight: 1.6, color: "#111" }}>
                      {selected.bodyText || selected.snippet || "(본문 없음)"}
                    </pre>
                  )}
                </div>
                <div style={{ padding: "12px 18px", borderTop: "1px solid var(--line)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button className="btn" onClick={() => startReply(selected)} style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}>
                    ↩ 답장
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {compose && <Compose state={compose} onClose={() => setCompose(null)} />}
    </div>
  );
}

function Compose({ state, onClose }: { state: NonNullable<ComposeState>; onClose: () => void }) {
  const [to, setTo] = useState(state.to);
  const [cc, setCc] = useState(state.cc);
  const [subject, setSubject] = useState(state.subject);
  const [body, setBody] = useState(state.body);
  const [sending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const field: React.CSSProperties = { width: "100%", padding: "9px 11px", border: "1px solid var(--line-2)", borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--ink)", marginBottom: 10 };

  const submit = () => {
    if (!to.trim()) { setMsg({ ok: false, text: "받는 사람을 입력하세요." }); return; }
    setMsg(null);
    start(async () => {
      const r = await sendMail({
        to,
        cc,
        subject,
        body,
        threadId: state.threadId,
        inReplyTo: state.inReplyTo,
        references: state.references,
      });
      if (!r.ok) {
        setMsg({ ok: false, text: r.error ?? "발송 실패" });
        return;
      }
      setMsg({ ok: true, text: "메일을 보냈습니다." });
      setTimeout(onClose, 900);
    });
  };

  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, background: "rgba(16,20,24,0.55)", display: "grid", placeItems: "center", zIndex: 110, padding: 16 }}>
      <div className="card" onMouseDown={(e) => e.stopPropagation()} style={{ padding: 20, width: "100%", maxWidth: 620, maxHeight: "90vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>{state.inReplyTo ? "답장 쓰기" : "메일 쓰기"}</h3>
          <button className="btn" onClick={onClose} style={{ padding: "3px 9px" }}>닫기</button>
        </div>
        <label style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginBottom: 4, fontWeight: 600 }}>받는 사람</label>
        <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com (여러 명은 쉼표로 구분)" style={field} />
        <label style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginBottom: 4, fontWeight: 600 }}>참조 (선택)</label>
        <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="cc@example.com" style={field} />
        <label style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginBottom: 4, fontWeight: 600 }}>제목</label>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="제목" style={field} />
        <label style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginBottom: 4, fontWeight: 600 }}>내용</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} placeholder="내용을 입력하세요" style={{ ...field, resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 }} />

        {msg && (
          <div style={{ fontSize: 13, marginBottom: 10, color: msg.ok ? "var(--ok, #16a34a)" : "var(--owner, #b91c1c)" }}>{msg.text}</div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={onClose}>취소</button>
          <button
            className="btn"
            onClick={submit}
            disabled={sending}
            style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}
          >
            {sending ? "보내는 중…" : "📤 보내기"}
          </button>
        </div>
      </div>
    </div>
  );
}
