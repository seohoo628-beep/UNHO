"use client";

import { useState } from "react";
import { useUno } from "./store";

// 구글 캘린더 임베드 URL 생성. 항상 주(WEEK) 단위로 고정.
function embedSrc(input?: string): string | null {
  if (!input) return null;
  const v = input.trim();
  if (!v) return null;
  const base = v.startsWith("http")
    ? v
    : `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(v)}&ctz=Asia%2FSeoul`;
  try {
    const u = new URL(base);
    u.searchParams.set("mode", "WEEK");
    if (!u.searchParams.get("ctz")) u.searchParams.set("ctz", "Asia/Seoul");
    return u.toString();
  } catch {
    return `${base}${base.includes("?") ? "&" : "?"}mode=WEEK`;
  }
}

// 앱은 구글 캘린더를 '보기'만 한다. 모든 일정 관리는 구글/굿캘린더에서.
export default function CalendarTab() {
  const { state, setState } = useUno();
  const [embedInput, setEmbedInput] = useState(state.settings.calendarEmbedUrl || "");
  const src = embedSrc(state.settings.calendarEmbedUrl);

  const saveEmbed = () =>
    setState((p) => ({ ...p, settings: { ...p.settings, calendarEmbedUrl: embedInput.trim() } }));

  return (
    <div className="uno-cal">
      <div className="card">
        <h3>📅 구글 캘린더</h3>
        <p className="muted uno-hint">
          모든 일정은 <strong>구글 캘린더(굿캘린더)</strong>에서 관리하고, 이 화면은 그 캘린더를{" "}
          <strong>주 단위로 보여주는 보기 전용</strong> 화면이에요. 일정 추가·수정은 구글/굿캘린더에서 하세요.
        </p>

        {src ? (
          <div className="uno-embed-wrap">
            <iframe title="구글 캘린더" src={src} className="uno-embed" style={{ border: 0 }} loading="lazy" />
          </div>
        ) : (
          <div className="uno-cal-setup">
            <p className="muted" style={{ marginTop: 0 }}>
              아래에 <strong>구글 캘린더 ID</strong>(예: <code>my@gmail.com</code>)를 넣으면 이 화면에 표시됩니다.
            </p>
          </div>
        )}

        <div className="uno-embed-form">
          <input
            type="text"
            placeholder="구글 캘린더 ID(예: my@gmail.com) 또는 임베드 URL"
            value={embedInput}
            onChange={(e) => setEmbedInput(e.target.value)}
          />
          <button className="btn primary sm" onClick={saveEmbed}>
            연동
          </button>
          {src && (
            <a className="btn sm" href={src} target="_blank" rel="noreferrer">
              구글 캘린더 열기 ↗
            </a>
          )}
        </div>

        <details className="uno-ical-help">
          <summary>굿캘린더(폰)랑 똑같이 보이게 하려면?</summary>
          <ul>
            <li>
              폰 굿캘린더에서 실제로 쓰는 <strong>구글 계정 ID</strong>(예: <code>unhoteam@gmail.com</code>)를 위 칸에
              넣으세요. 그러면 이 화면과 굿캘린더가 같은 일정을 보여줍니다.
            </li>
            <li>
              캘린더가 화면에 안 뜨면, 구글 캘린더 설정 → 해당 캘린더 → “<strong>액세스 권한</strong>”에서 공개(또는
              링크가 있는 사용자에게 공개)로 바꾸면 임베드가 표시됩니다.
            </li>
            <li>일정 추가·수정·삭제는 이 화면이 아니라 구글 캘린더(굿캘린더)에서 하세요.</li>
          </ul>
        </details>
      </div>
    </div>
  );
}
