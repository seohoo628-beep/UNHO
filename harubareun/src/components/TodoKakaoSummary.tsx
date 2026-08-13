"use client";

import { useMemo, useState } from "react";

export type KakaoSumItem = {
  title: string;
  brand: string | null;
  priority: string;
  due: string | null; // 표시용 마감(예: 08-05) 없으면 null
  overdue: boolean;
};
export type KakaoSumGroup = { name: string; items: KakaoSumItem[] };

// 담당자 한 명 분량의 카톡 리마인드 텍스트 생성.
function blockFor(g: KakaoSumGroup, dateStr: string, withHeader: boolean): string {
  const lines: string[] = [];
  if (withHeader) {
    lines.push(`[하루바른·나아 업무 리마인드]`);
    lines.push(`📅 ${dateStr} 기준`);
    lines.push("");
  }
  lines.push(`👤 ${g.name} (${g.items.length}건)`);
  g.items.forEach((it, i) => {
    const head = `${i + 1}. ${it.brand ? `[${it.brand}] ` : ""}${it.title}`;
    lines.push(head);
    const bits: string[] = [`중요도 ${it.priority}`];
    if (it.due) bits.push(`마감 ${it.due}${it.overdue ? " ⏰지남" : ""}`);
    lines.push(`   - ${bits.join(" / ")}`);
  });
  return lines.join("\n");
}

export default function TodoKakaoSummary({ groups, dateStr }: { groups: KakaoSumGroup[]; dateStr: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // 미지정은 카톡 발송 대상이 없으므로 뒤로 미룸(표시는 함).
  const ordered = useMemo(
    () => [...groups].filter((g) => g.items.length > 0),
    [groups]
  );

  const allText = useMemo(() => {
    const parts = ordered.map((g) => blockFor(g, dateStr, false));
    return `[하루바른·나아 업무 리마인드]\n📅 ${dateStr} 기준\n\n${parts.join("\n\n")}`;
  }, [ordered, dateStr]);

  const copy = async (text: string, tag: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // 폴백: 임시 textarea
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* ignore */
      }
      document.body.removeChild(ta);
    }
    setCopied(tag);
    setTimeout(() => setCopied((c) => (c === tag ? null : c)), 1600);
  };

  return (
    <>
      <button
        className="btn"
        onClick={() => setOpen(true)}
        title="담당자별 업무를 카톡으로 보낼 텍스트로 요약"
        disabled={ordered.length === 0}
      >
        💬 카톡 리마인드 생성
      </button>

      {open && (
        <div
          onMouseDown={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(16,20,24,0.5)", display: "grid", placeItems: "center", zIndex: 100, padding: 20 }}
        >
          <div
            className="card"
            onMouseDown={(e) => e.stopPropagation()}
            style={{ padding: 20, width: "100%", maxWidth: 560, maxHeight: "85vh", overflow: "auto" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>💬 카톡 리마인드 텍스트</h3>
              <button className="btn" onClick={() => setOpen(false)} style={{ padding: "3px 9px" }}>닫기</button>
            </div>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
              담당자별로 복사해 카톡에 붙여넣으세요. 전체를 한 번에 복사할 수도 있습니다.
            </p>

            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <button
                className="btn"
                onClick={() => copy(allText, "__all__")}
                style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}
              >
                📋 전체 복사
              </button>
              {copied === "__all__" && <span style={{ alignSelf: "center", color: "var(--ok, #16a34a)", fontSize: 13 }}>복사됨 ✓</span>}
            </div>

            {ordered.map((g) => {
              const text = blockFor(g, dateStr, true);
              return (
                <div key={g.name} style={{ marginBottom: 14, border: "1px solid var(--line-2)", borderRadius: "var(--radius)", overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 12px", background: "var(--surface-2, #f8fafc)" }}>
                    <span style={{ fontWeight: 600, fontSize: 13.5 }}>👤 {g.name} · {g.items.length}건</span>
                    <button className="btn" onClick={() => copy(text, g.name)} style={{ padding: "3px 10px", fontSize: 12.5 }}>
                      {copied === g.name ? "복사됨 ✓" : "복사"}
                    </button>
                  </div>
                  <pre
                    style={{
                      margin: 0,
                      padding: "10px 12px",
                      fontSize: 12.5,
                      lineHeight: 1.55,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      fontFamily: "inherit",
                      background: "var(--surface)",
                      color: "var(--ink)",
                    }}
                  >
                    {text}
                  </pre>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
