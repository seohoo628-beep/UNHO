"use client";

import { useState, useTransition } from "react";
import { generateBriefNow, fetchBrief } from "./actions";

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
  const [html, setHtml] = useState(initialHtml);
  const [viewDate, setViewDate] = useState(initialDate);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function regen() {
    setMsg(null);
    start(async () => {
      const r = await generateBriefNow();
      if (!r.ok) return setMsg(r.tableMissing ? "테이블 미설정: 0063 마이그레이션을 적용하세요." : "❌ " + (r.error ?? "실패"));
      setHtml(r.html ?? "");
      setViewDate(r.date ?? "");
      setMsg("✅ 오늘 브리핑을 생성했습니다.");
    });
  }

  function view(date: string) {
    setMsg(null);
    start(async () => {
      const r = await fetchBrief(date);
      if (!r.ok) return setMsg("❌ " + (r.error ?? "실패"));
      setHtml(r.html ?? "");
      setViewDate(date);
    });
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>🌅 CEO 아침 브리핑</h1>
          <p>오늘 일정·이메일·투두·생일·이커머스 동향을 한 장으로. 매일 아침 이메일로도 발송됩니다.</p>
        </div>
        <button className="btn primary" onClick={regen} disabled={pending}>{pending ? "생성 중…" : "오늘 브리핑 새로 생성"}</button>
      </div>

      {!dbReady && (
        <div className="card" style={{ padding: 14, marginBottom: 14 }}>
          <div className="empty">테이블이 아직 준비되지 않았습니다. 마이그레이션(0063_morning_briefs.sql)을 적용해 주세요.</div>
        </div>
      )}
      {msg && <div className="card" style={{ padding: "10px 14px", marginBottom: 14, fontSize: 13.5 }}>{msg}</div>}

      {pastDates.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
          <span className="muted" style={{ fontSize: 12.5 }}>지난 브리핑:</span>
          {pastDates.map((d) => (
            <button key={d} className={`btn sm${viewDate === d ? " primary" : ""}`} onClick={() => view(d)} disabled={pending}>{d}</button>
          ))}
        </div>
      )}

      {html ? (
        <div className="card" style={{ padding: 20 }}>
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      ) : (
        <div className="card"><div className="empty">아직 오늘 브리핑이 없습니다. &ldquo;오늘 브리핑 새로 생성&rdquo;을 눌러 만들어 보세요.</div></div>
      )}
    </div>
  );
}
