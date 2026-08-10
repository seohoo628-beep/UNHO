"use client";

import { useMemo, useState, useTransition } from "react";
import { generateBriefNow, fetchBrief, fetchBriefsRange, diagnoseCalendarAction } from "./actions";

type Mode = "일별" | "주별" | "월별";

// 월요일 시작 주의 시작일(YYYY-MM-DD)
function weekStart(ymd: string): string {
  const d = new Date(ymd + "T00:00:00+09:00");
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}
function addDays(ymd: string, n: number): string {
  const d = new Date(ymd + "T00:00:00+09:00");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function MorningBriefClient({
  initialHtml,
  initialDate,
  pastDates,
  dbReady,
}: {
  initialHtml: string;
  initialDate: string;
  pastDates: string[];
  dbReady: boolean;
}) {
  const [blocks, setBlocks] = useState<{ date: string; html: string }[]>(initialHtml ? [{ date: initialDate, html: initialHtml }] : []);
  const [active, setActive] = useState<string>(initialDate);
  const [mode, setMode] = useState<Mode>("일별");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // 그룹핑: 주별 / 월별
  const groups = useMemo(() => {
    if (mode === "일별") return pastDates.map((d) => ({ key: d, label: d, start: d, end: d }));
    if (mode === "주별") {
      const seen = new Map<string, { start: string; end: string }>();
      for (const d of pastDates) {
        const s = weekStart(d);
        if (!seen.has(s)) seen.set(s, { start: s, end: addDays(s, 6) });
      }
      return [...seen.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([s, r]) => ({
        key: s, label: `${s.slice(5).replace("-", "/")}~${r.end.slice(5).replace("-", "/")}`, start: r.start, end: r.end,
      }));
    }
    // 월별
    const seen = new Map<string, { start: string; end: string }>();
    for (const d of pastDates) {
      const m = d.slice(0, 7);
      if (!seen.has(m)) seen.set(m, { start: `${m}-01`, end: `${m}-31` });
    }
    return [...seen.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([m, r]) => ({
      key: m, label: `${m.slice(0, 4)}년 ${Number(m.slice(5, 7))}월`, start: r.start, end: r.end,
    }));
  }, [pastDates, mode]);

  function regen() {
    setMsg(null);
    start(async () => {
      const r = await generateBriefNow();
      if (!r.ok) return setMsg(r.tableMissing ? "테이블 미설정: 0063 마이그레이션을 적용하세요." : "❌ " + (r.error ?? "실패"));
      setBlocks([{ date: r.date ?? "", html: r.html ?? "" }]);
      setActive(r.date ?? "");
      setMode("일별");
      setMsg("✅ 오늘 브리핑을 생성했습니다.");
    });
  }

  function diag() {
    setMsg("진단 중…");
    start(async () => {
      const r = await diagnoseCalendarAction();
      setMsg(r.text);
    });
  }

  function openGroup(g: { key: string; start: string; end: string }) {
    setMsg(null);
    setActive(g.key);
    start(async () => {
      if (g.start === g.end) {
        const r = await fetchBrief(g.start);
        if (!r.ok) return setMsg("❌ " + (r.error ?? "실패"));
        setBlocks([{ date: g.start, html: r.html ?? "" }]);
      } else {
        const r = await fetchBriefsRange(g.start, g.end);
        if (!r.ok) return setMsg("❌ " + (r.error ?? "실패"));
        setBlocks(r.items ?? []);
      }
    });
  }

  const dateLabel = (d: string) => new Date(d + "T00:00:00+09:00").toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short" });

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>🌅 CEO 아침 브리핑</h1>
          <p>오늘 일정·이메일·투두·생일·이커머스 뉴스를 한 장으로. 매일 아침 이메일로도 발송됩니다.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={diag} disabled={pending}>🗓 캘린더 진단</button>
          <button className="btn primary" onClick={regen} disabled={pending}>{pending ? "생성 중…" : "오늘 브리핑 새로 생성"}</button>
        </div>
      </div>

      {!dbReady && (
        <div className="card" style={{ padding: 14, marginBottom: 14 }}>
          <div className="empty">테이블이 아직 준비되지 않았습니다. 마이그레이션(0063_morning_briefs.sql)을 적용해 주세요.</div>
        </div>
      )}
      {msg && <div className="card" style={{ padding: "10px 14px", marginBottom: 14, fontSize: 13.5, whiteSpace: "pre-wrap" }}>{msg}</div>}

      {pastDates.length > 0 && (
        <div className="card" style={{ padding: 12, marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {(["일별", "주별", "월별"] as Mode[]).map((m) => (
              <button key={m} className={`btn sm${mode === m ? " primary" : ""}`} onClick={() => setMode(m)}>{m}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {groups.map((g) => (
              <button key={g.key} className={`btn sm${active === g.key ? " primary" : ""}`} onClick={() => openGroup(g)} disabled={pending}>{g.label}</button>
            ))}
          </div>
        </div>
      )}

      {blocks.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {blocks.map((b) => (
            <div key={b.date}>
              {mode !== "일별" && <div className="muted" style={{ fontSize: 12.5, fontWeight: 700, margin: "4px 2px 6px" }}>{dateLabel(b.date)}</div>}
              <div className="card" style={{ padding: 20, overflow: "hidden" }}>
                <div dangerouslySetInnerHTML={{ __html: b.html }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card"><div className="empty">아직 브리핑이 없습니다. &ldquo;오늘 브리핑 새로 생성&rdquo;을 눌러 만들어 보세요.</div></div>
      )}
    </div>
  );
}
