"use client";

import { useMemo, useState } from "react";

export type ShareLog = { kind: string; logDate: string; title: string; note: string; authorName: string };

// 업무일지 목록을 카톡 전달용 텍스트로 요약.
function buildText(title: string, logs: ShareLog[]): string {
  const lines: string[] = [];
  lines.push(`[하루바른·나아 ${title}]`);
  lines.push(`🗂 총 ${logs.length}건`);
  lines.push("");
  logs.forEach((l, i) => {
    const head = `${i + 1}. ${l.kind ? `[${l.kind}] ` : ""}${l.logDate}${l.title ? " · " + l.title : ""}`;
    lines.push(head);
    if (l.authorName) lines.push(`   · 작성자 ${l.authorName}`);
    if (l.note) {
      const note = l.note.trim().replace(/\n{2,}/g, "\n");
      note.split("\n").slice(0, 6).forEach((ln) => lines.push(`   ${ln}`));
    }
  });
  return lines.join("\n");
}

export default function WorkLogKakaoShare({ title, logs }: { title: string; logs: ShareLog[] }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => buildText(title, logs), [title, logs]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const share = async () => {
    // 모바일: 네이티브 공유 시트(카톡 선택 가능), 실패 시 복사로 폴백
    try {
      if (typeof navigator !== "undefined" && (navigator as any).share) {
        await (navigator as any).share({ text });
        return;
      }
    } catch { /* 취소/미지원 → 복사 폴백 */ }
    copy();
  };

  return (
    <>
      <button className="btn" onClick={() => setOpen(true)} disabled={logs.length === 0} title="이 목록을 카톡 전달용 텍스트로 복사">
        💬 카톡 전달용 복사
      </button>

      {open && (
        <div onMouseDown={() => setOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(16,20,24,0.5)", display: "grid", placeItems: "center", zIndex: 100, padding: 20 }}>
          <div className="card" onMouseDown={(e) => e.stopPropagation()} style={{ padding: 20, width: "100%", maxWidth: 560, maxHeight: "85vh", overflow: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>💬 카톡 전달용 — {title}</h3>
              <button className="btn" onClick={() => setOpen(false)} style={{ padding: "3px 9px" }}>닫기</button>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <button className="btn" onClick={copy} style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}>
                {copied ? "복사됨 ✓" : "📋 복사"}
              </button>
              <button className="btn" onClick={share} title="모바일에서 카톡 등으로 바로 공유">📤 공유</button>
            </div>
            <pre style={{ margin: 0, padding: "10px 12px", fontSize: 12.5, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "inherit", background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--line-2)", borderRadius: "var(--radius)" }}>
              {text}
            </pre>
          </div>
        </div>
      )}
    </>
  );
}
