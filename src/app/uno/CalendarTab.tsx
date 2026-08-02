"use client";

import { useMemo, useState } from "react";
import { useUno } from "./store";
import { Field } from "./ui";
import { addDays, makeId, shortDate, todayYmd, weekdayKo } from "./lib";
import type { ScheduleItem } from "./types";

// 구글 캘린더 "일정 추가" 템플릿 링크 (단방향 동기화)
function gcalLink(it: ScheduleItem): string {
  const base = "https://calendar.google.com/calendar/render?action=TEMPLATE";
  const params = new URLSearchParams();
  params.set("text", it.title);
  if (it.start) {
    const s = it.date.replace(/-/g, "") + "T" + it.start.replace(":", "") + "00";
    const endHm = it.end || addHour(it.start);
    const e = it.date.replace(/-/g, "") + "T" + endHm.replace(":", "") + "00";
    params.set("dates", `${s}/${e}`);
  } else {
    const d = it.date.replace(/-/g, "");
    const next = addDays(it.date, 1).replace(/-/g, "");
    params.set("dates", `${d}/${next}`);
  }
  if (it.note) params.set("details", it.note);
  if (it.location) params.set("location", it.location);
  params.set("ctz", "Asia/Seoul");
  return `${base}&${params.toString()}`;
}

function addHour(hm: string): string {
  const [h, m] = hm.split(":").map(Number);
  const nh = (h + 1) % 24;
  return `${String(nh).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function embedSrc(input?: string): string | null {
  if (!input) return null;
  const v = input.trim();
  if (!v) return null;
  if (v.startsWith("http")) return v;
  // 캘린더 ID / 이메일로 간주
  return `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(v)}&ctz=Asia%2FSeoul`;
}

export default function CalendarTab() {
  const { state, setState } = useUno();
  const src = embedSrc(state.settings.calendarEmbedUrl);
  const [embedInput, setEmbedInput] = useState(state.settings.calendarEmbedUrl || "");

  const [form, setForm] = useState<Partial<ScheduleItem>>({ date: todayYmd() });

  const upcoming = useMemo(() => {
    const from = todayYmd();
    return [...state.schedule]
      .filter((s) => s.date >= addDays(from, -1))
      .sort((a, b) => (a.date + (a.start || "")).localeCompare(b.date + (b.start || "")));
  }, [state.schedule]);

  const saveEmbed = () =>
    setState((p) => ({ ...p, settings: { ...p.settings, calendarEmbedUrl: embedInput.trim() } }));

  const addItem = () => {
    if (!form.title?.trim() || !form.date) return;
    const it: ScheduleItem = {
      id: makeId("s"),
      title: form.title.trim(),
      date: form.date,
      start: form.start,
      end: form.end,
      location: form.location,
      note: form.note,
      category: form.category,
    };
    setState((p) => ({ ...p, schedule: [...p.schedule, it] }));
    setForm({ date: form.date });
  };
  const remove = (id: string) => setState((p) => ({ ...p, schedule: p.schedule.filter((s) => s.id !== id) }));

  return (
    <div className="uno-cal">
      {/* 구글 캘린더 임베드 */}
      <div className="card">
        <div className="uno-card-head">
          <h3>📅 구글 캘린더</h3>
        </div>
        {src ? (
          <div className="uno-embed-wrap">
            <iframe
              title="구글 캘린더"
              src={src}
              className="uno-embed"
              style={{ border: 0 }}
              loading="lazy"
            />
          </div>
        ) : (
          <div className="uno-cal-setup">
            <p className="muted">
              내 구글 캘린더를 연동하세요. 캘린더 설정 → <strong>“캘린더 통합”</strong>에서 공개용 URL을
              복사하거나, 캘린더 ID(예: <code>my@gmail.com</code>)를 입력하면 이 화면에 그대로 표시됩니다.
            </p>
          </div>
        )}
        <div className="uno-embed-form">
          <input
            type="text"
            placeholder="구글 캘린더 임베드 URL 또는 캘린더 ID(my@gmail.com)"
            value={embedInput}
            onChange={(e) => setEmbedInput(e.target.value)}
          />
          <button className="btn primary sm" onClick={saveEmbed}>
            연동
          </button>
          {src && (
            <a className="btn sm" href={src} target="_blank" rel="noreferrer">
              새 탭에서 열기 ↗
            </a>
          )}
        </div>
      </div>

      {/* 내 일정 + 구글 캘린더로 보내기 */}
      <div className="card uno-mt">
        <h3>🗓 내 일정</h3>
        <p className="muted uno-hint">
          여기에 적은 일정은 “구글 캘린더에 추가” 버튼으로 내 캘린더에 바로 등록됩니다.
        </p>
        <div className="uno-sch-form">
          <input
            type="text"
            placeholder="일정 제목"
            value={form.title || ""}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && addItem()}
          />
          <div className="uno-sch-form-row">
            <Field label="날짜">
              <input type="date" value={form.date || ""} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </Field>
            <Field label="시작">
              <input type="time" value={form.start || ""} onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))} />
            </Field>
            <Field label="종료">
              <input type="time" value={form.end || ""} onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))} />
            </Field>
          </div>
          <div className="uno-sch-form-row">
            <input
              type="text"
              placeholder="장소(선택)"
              value={form.location || ""}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            />
            <button className="btn primary" onClick={addItem}>
              일정 추가
            </button>
          </div>
        </div>

        {upcoming.length === 0 ? (
          <p className="muted">예정된 일정이 없습니다.</p>
        ) : (
          <ul className="uno-sch-list">
            {upcoming.map((it) => (
              <li className="uno-sch-item" key={it.id}>
                <div className="uno-sch-when">
                  <span className="uno-sch-date">
                    {shortDate(it.date)} ({weekdayKo(it.date)})
                  </span>
                  <span className="uno-sch-time">{it.start ? `${it.start}${it.end ? `–${it.end}` : ""}` : "종일"}</span>
                </div>
                <div className="uno-sch-body">
                  <strong>{it.title}</strong>
                  {it.location && <span className="muted"> · {it.location}</span>}
                </div>
                <div className="uno-sch-actions">
                  <a className="btn sm" href={gcalLink(it)} target="_blank" rel="noreferrer">
                    구글 캘린더에 추가 ↗
                  </a>
                  <button className="uno-x" onClick={() => remove(it.id)} aria-label="삭제">
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
