"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useUno } from "./store";
import { Segmented } from "./ui";
import { addDays, makeId, shortDate, startOfWeek, todayYmd, weekdayKo } from "./lib";
import type { ScheduleItem } from "./types";

const GRID_START = 6; // 시간표 시작 시각
const GRID_END = 23; // 시간표 끝 시각(포함)
const HOURS = Array.from({ length: GRID_END - GRID_START + 1 }, (_, k) => GRID_START + k);

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
    params.set("dates", `${it.date.replace(/-/g, "")}/${addDays(it.date, 1).replace(/-/g, "")}`);
  }
  if (it.note) params.set("details", it.note);
  if (it.location) params.set("location", it.location);
  params.set("ctz", "Asia/Seoul");
  return `${base}&${params.toString()}`;
}
function addHour(hm: string): string {
  const [h, m] = hm.split(":").map(Number);
  return `${String((h + 1) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function embedSrc(input?: string): string | null {
  if (!input) return null;
  const v = input.trim();
  if (!v) return null;
  const base = v.startsWith("http")
    ? v
    : `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(v)}&ctz=Asia%2FSeoul`;
  // 항상 주(WEEK) 단위로 표시. 사용자가 다른 mode를 넣었어도 WEEK로 고정.
  try {
    const u = new URL(base);
    u.searchParams.set("mode", "WEEK");
    if (!u.searchParams.get("ctz")) u.searchParams.set("ctz", "Asia/Seoul");
    return u.toString();
  } catch {
    return `${base}${base.includes("?") ? "&" : "?"}mode=WEEK`;
  }
}

type Draft = { date: string; start?: string; end?: string; title: string; location: string };
type View = "week" | "day";

export default function CalendarTab() {
  const { state, setState } = useUno();
  const [view, setView] = useState<View>("day");
  const [day, setDay] = useState<string>(todayYmd());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [allDay, setAllDay] = useState("");
  const [embedInput, setEmbedInput] = useState(state.settings.calendarEmbedUrl || "");
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => setOrigin(window.location.origin), []);
  const icalUrl = origin ? `${origin}/api/uno/ical` : "";
  const src = embedSrc(state.settings.calendarEmbedUrl);

  const weekDates = useMemo(() => {
    const s = startOfWeek(day);
    return Array.from({ length: 7 }, (_, i) => addDays(s, i));
  }, [day]);

  const itemsAt = (date: string, h: number) =>
    state.schedule.filter((s) => s.date === date && s.start && Number(s.start.split(":")[0]) === h);
  const allDayAt = (date: string) => state.schedule.filter((s) => s.date === date && !s.start);

  const upcoming = useMemo(
    () =>
      [...state.schedule]
        .filter((s) => s.date >= todayYmd())
        .sort((a, b) => (a.date + (a.start || "")).localeCompare(b.date + (b.start || "")))
        .slice(0, 12),
    [state.schedule],
  );

  const openSlot = (date: string, h: number) => {
    setDay(date);
    setDraft({ date, start: `${pad(h)}:00`, end: `${pad((h + 1) % 24)}:00`, title: "", location: "" });
  };
  const openAllDay = (date: string) => {
    setDay(date);
    setDraft({ date, start: undefined, end: undefined, title: "", location: "" });
  };
  const saveDraft = () => {
    if (!draft?.title.trim()) return;
    const it: ScheduleItem = {
      id: makeId("s"),
      title: draft.title.trim(),
      date: draft.date,
      start: draft.start || undefined,
      end: draft.start ? draft.end : undefined,
      location: draft.location.trim() || undefined,
    };
    setState((p) => ({ ...p, schedule: [...p.schedule, it] }));
    setDraft(null);
  };
  const addAllDay = () => {
    if (!allDay.trim()) return;
    setState((p) => ({ ...p, schedule: [...p.schedule, { id: makeId("s"), title: allDay.trim(), date: day }] }));
    setAllDay("");
  };
  const remove = (id: string) => setState((p) => ({ ...p, schedule: p.schedule.filter((s) => s.id !== id) }));
  const shift = (n: number) => setDay(addDays(day, view === "week" ? n * 7 : n));

  const saveEmbed = () =>
    setState((p) => ({ ...p, settings: { ...p.settings, calendarEmbedUrl: embedInput.trim() } }));
  const copyIcal = async () => {
    try {
      await navigator.clipboard.writeText(icalUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="uno-cal">
      {/* 구글 캘린더 보기(읽기 전용) — 최상단 */}
      <div className="card">
        <h3>📅 구글 캘린더 보기 (읽기 전용)</h3>
        <p className="muted uno-hint">
          구글 캘린더는 <strong>보기 전용</strong>이라 이 화면에서는 클릭 입력이 안 됩니다. 일정 추가는 아래 “내
          시간표”에서 하세요.
        </p>
        {src ? (
          <div className="uno-embed-wrap">
            <iframe title="구글 캘린더" src={src} className="uno-embed" style={{ border: 0 }} loading="lazy" />
          </div>
        ) : (
          <p className="muted uno-hint">캘린더 ID(예: my@gmail.com) 또는 임베드 URL을 입력하면 여기에 표시됩니다.</p>
        )}
        <div className="uno-embed-form">
          <input
            type="text"
            placeholder="구글 캘린더 ID 또는 임베드 URL"
            value={embedInput}
            onChange={(e) => setEmbedInput(e.target.value)}
          />
          <button className="btn primary sm" onClick={saveEmbed}>
            연동
          </button>
        </div>
      </div>

      {/* 인터랙티브 시간표 */}
      <div className="card uno-mt">
        <div className="uno-card-head">
          <h3>🗓 내 시간표</h3>
          <Segmented
            value={view}
            onChange={(v) => setView(v as View)}
            options={[
              { value: "day", label: "일" },
              { value: "week", label: "주" },
            ]}
          />
        </div>
        <div className="uno-datebar" style={{ padding: 0, marginBottom: 10, boxShadow: "none", border: 0 }}>
          <button className="btn sm" onClick={() => shift(-1)} aria-label="이전">
            ‹
          </button>
          <div className="uno-datebar-mid">
            {view === "week" ? (
              <strong>
                {shortDate(weekDates[0])} – {shortDate(weekDates[6])}
              </strong>
            ) : (
              <>
                <input type="date" value={day} onChange={(e) => setDay(e.target.value || todayYmd())} />
                <span className="uno-dow">
                  ({weekdayKo(day)}) {day === todayYmd() && <span className="badge accent">오늘</span>}
                </span>
              </>
            )}
          </div>
          <button className="btn sm" onClick={() => shift(1)} aria-label="다음">
            ›
          </button>
          <button className="btn sm" onClick={() => setDay(todayYmd())}>
            오늘
          </button>
        </div>
        <p className="muted uno-hint">빈 시간칸을 누르면 그 시간으로 일정이 바로 입력됩니다.</p>

        {/* 빠른 입력 */}
        {draft && (
          <div className="uno-quickadd">
            <div className="uno-quickadd-head">
              🗓 {shortDate(draft.date)} ({weekdayKo(draft.date)}) · {draft.start ? `${draft.start} 일정` : "종일 일정"}
            </div>
            <input
              autoFocus
              type="text"
              placeholder="일정 제목"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && saveDraft()}
            />
            <div className="uno-quickadd-row">
              <label>
                시작
                <input type="time" value={draft.start || ""} onChange={(e) => setDraft({ ...draft, start: e.target.value || undefined })} />
              </label>
              <label>
                종료
                <input type="time" value={draft.end || ""} onChange={(e) => setDraft({ ...draft, end: e.target.value || undefined })} />
              </label>
            </div>
            <input
              type="text"
              placeholder="장소(선택)"
              value={draft.location}
              onChange={(e) => setDraft({ ...draft, location: e.target.value })}
            />
            <div className="uno-quickadd-btns">
              <button className="btn sm" onClick={() => setDraft(null)}>
                취소
              </button>
              <button className="btn primary sm" onClick={saveDraft}>
                저장
              </button>
            </div>
          </div>
        )}

        {view === "day" ? (
          <>
            <div className="uno-allday">
              <span className="uno-allday-lbl">종일</span>
              <div className="uno-allday-items">
                {allDayAt(day).map((i) => (
                  <span key={i.id} className="uno-ev allday">
                    {i.title}
                    <button className="uno-x" onClick={() => remove(i.id)} aria-label="삭제">
                      ✕
                    </button>
                  </span>
                ))}
                <input
                  className="uno-allday-input"
                  type="text"
                  placeholder="+ 종일 일정"
                  value={allDay}
                  onChange={(e) => setAllDay(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addAllDay()}
                />
              </div>
            </div>
            <div className="uno-timegrid">
              {HOURS.map((h) => (
                <div className="uno-hour" key={h}>
                  <span className="uno-hour-lbl">{pad(h)}:00</span>
                  <button className="uno-hour-slot" onClick={() => openSlot(day, h)} aria-label={`${pad(h)}시 일정 추가`}>
                    {itemsAt(day, h).map((i) => (
                      <span key={i.id} className="uno-ev" onClick={(e) => e.stopPropagation()}>
                        <b>{i.start}</b> {i.title}
                        {i.location && <i> · {i.location}</i>}
                        <button className="uno-x" onClick={() => remove(i.id)} aria-label="삭제">
                          ✕
                        </button>
                      </span>
                    ))}
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="uno-week-scroll">
            <div className="uno-weekgrid">
              <div className="uno-wcorner" />
              {weekDates.map((d) => (
                <button
                  key={d}
                  className={`uno-whead${d === todayYmd() ? " today" : ""}`}
                  onClick={() => {
                    setDay(d);
                    setView("day");
                  }}
                >
                  <span>{weekdayKo(d)}</span>
                  <b>{Number(d.slice(-2))}</b>
                </button>
              ))}

              <div className="uno-wtime">종일</div>
              {weekDates.map((d) => (
                <button key={`ad-${d}`} className="uno-wcell allday" onClick={() => openAllDay(d)}>
                  {allDayAt(d).map((i) => (
                    <span key={i.id} className="uno-ev allday sm" onClick={(e) => e.stopPropagation()}>
                      {i.title}
                    </span>
                  ))}
                </button>
              ))}

              {HOURS.map((h) => (
                <Fragment key={h}>
                  <div className="uno-wtime">{pad(h)}</div>
                  {weekDates.map((d) => (
                    <button key={`${d}-${h}`} className="uno-wcell" onClick={() => openSlot(d, h)}>
                      {itemsAt(d, h).map((i) => (
                        <span key={i.id} className="uno-ev sm" onClick={(e) => e.stopPropagation()}>
                          {i.title}
                        </span>
                      ))}
                    </button>
                  ))}
                </Fragment>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 예정 일정 */}
      <div className="card uno-mt">
        <h3>📋 예정 일정</h3>
        {upcoming.length === 0 ? (
          <p className="muted">예정된 일정이 없습니다. 위 시간표에서 시간칸을 눌러 추가해 보세요.</p>
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
                    구글에 추가 ↗
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

      {/* 다른 캘린더 연동 */}
      <div className="card uno-mt">
        <h3>🔗 다른 캘린더와 연동</h3>
        <p className="muted uno-hint">
          아래 <strong>구독 주소(iCal)</strong>를 굿캘린더·네이버·애플·구글 등에서 “구독/가져오기”하면 여기서 추가한
          일정이 자동으로 표시됩니다.
        </p>
        <div className="uno-ical-row">
          <input type="text" readOnly value={icalUrl} onFocus={(e) => e.currentTarget.select()} />
          <button className="btn sm" onClick={copyIcal} disabled={!icalUrl}>
            {copied ? "복사됨 ✓" : "주소 복사"}
          </button>
          <a className="btn sm" href={icalUrl || "#"} download="uno.ics">
            .ics 다운로드
          </a>
        </div>
        <details className="uno-ical-help">
          <summary>앱별 등록 방법</summary>
          <ul>
            <li>
              <strong>굿캘린더</strong>: 굿캘린더는 URL 직접 구독이 없어, PC 구글 캘린더에 위 주소를 “URL로 추가”한 뒤
              굿캘린더 설정에서 “로컬 캘린더와 일정 동기화하기”를 켜면 반영됩니다.
            </li>
            <li>
              <strong>구글 캘린더</strong>(PC): 다른 캘린더 + → URL로 추가 → 위 주소
            </li>
            <li>
              <strong>애플(아이폰)</strong>: 설정 → 캘린더 → 계정 → 캘린더 구독 추가 → 위 주소
            </li>
          </ul>
        </details>
      </div>

    </div>
  );
}
