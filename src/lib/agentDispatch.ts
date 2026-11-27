// AI 보고서 '다음 액션' → 사람 담당자 업무 배정. 순수 함수(테스트 대상).
// 형식: "- 항목 · 담당 · 기한(YYYY-MM-DD)". 구분자는 '·', '|', ' / ' 를 받는다.

export type Staff = { id: string; name: string; job_title?: string | null };

export type ActionView = {
  idx: number; // 체크리스트 내 위치
  text: string; // 원문
  task: string; // 업무명
  who: string | null; // AI가 적은 담당
  due: string | null; // YYYY-MM-DD
  suggestId: string | null; // 추천 담당자(사람)
};

const DATE = /\b(20\d{2}-\d{2}-\d{2})\b/;

/** "항목 · 담당 · 기한" 을 나눈다. 담당·기한이 없으면 null. */
export function splitAction(text: string): { task: string; who: string | null; due: string | null } {
  const due = text.match(DATE)?.[1] ?? null;
  const parts = text
    .split(/\s*[·|]\s*|\s+\/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const isDue = (s: string) => DATE.test(s) || /^(기한|마감)\b/.test(s);
  const task = (parts[0] ?? text).replace(DATE, "").replace(/[()\s]+$/, "").trim() || text.trim();
  const rest = parts.slice(1).filter((s) => !isDue(s));
  const who = rest.length ? rest[0].replace(/^담당\s*[:：]?\s*/, "").trim() || null : null;
  return { task: task.slice(0, 200), who, due };
}

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
// 직무 키워드: 보고서에 '경리', '디자이너'처럼 직무로 적힌 경우
const ROLE_WORDS = ["대표", "경리", "회계", "재무", "인사", "디자인", "디자이너", "마케팅", "마케터", "md", "물류", "cs", "영업", "점장", "매니저", "pd", "영상"];

/** AI가 적은 담당을 실제 직원(사람)과 맞춘다. 이름 우선, 그다음 직무. 애매하면 null. */
export function matchAssignee(who: string | null, staff: Staff[]): string | null {
  if (!who) return null;
  const w = norm(who);
  if (!w || /^(ai|에이전트)/.test(w)) return null;
  const byName = staff.filter((s) => {
    const n = norm(s.name);
    return n.length >= 2 && (w.includes(n) || n.includes(w));
  });
  if (byName.length === 1) return byName[0].id;
  if (byName.length > 1) return null;
  const word = ROLE_WORDS.find((k) => w.includes(k));
  if (!word) return null;
  const byRole = staff.filter((s) => norm(s.job_title ?? "").includes(word) || (word === "대표" && /대표|ceo/i.test(s.job_title ?? "")));
  return byRole.length === 1 ? byRole[0].id : null;
}

type Check = { text: string; done?: boolean; due?: string; dispatched?: string };

/** 검토 화면용: 아직 배정하지 않은 다음 액션 목록 */
export function actionViews(checklist: unknown, staff: Staff[]): ActionView[] {
  if (!Array.isArray(checklist)) return [];
  const out: ActionView[] = [];
  (checklist as Check[]).forEach((c, idx) => {
    if (!c || typeof c.text !== "string" || c.done || c.dispatched) return;
    const s = splitAction(c.text);
    out.push({ idx, text: c.text, task: s.task, who: s.who, due: s.due ?? c.due ?? null, suggestId: matchAssignee(s.who, staff) });
  });
  return out;
}

/** 보고서 '대표 확인 필요' 절이 비었는가("없음") */
export function confirmSectionEmpty(text: string): boolean {
  const m = text.match(/대표 확인 필요[^\n]*\n([\s\S]*?)(?:\n\s*(?:#+\s*)?\**\s*4[.)]|\n\s*(?:#+\s*)?\**\s*다음 액션|$)/);
  if (!m) return false; // 절이 없으면 사람이 본다
  const body = m[1].replace(/[-•*\s.]/g, "");
  return body === "" || /^(없음|해당없음|특이사항없음)$/.test(body);
}

/** 대표 검토가 필요한 결과인가: 확인 필요 사항이나 사람이 할 다음 액션이 있으면 필요. */
export function needsCeoReview(text: string, actionCount: number): boolean {
  return actionCount > 0 || !confirmSectionEmpty(text);
}

export type DispatchPick = { idx: number; title: string; assigneeId: string; due: string | null };

/** 선택한 액션을 배정 가능한 것만 정리(중복 idx 제거, 빈 제목·담당 제외, 최대 8건) */
export function cleanPicks(picks: DispatchPick[], validIds: Set<string>): DispatchPick[] {
  const seen = new Set<number>();
  const out: DispatchPick[] = [];
  for (const p of picks ?? []) {
    if (!p || typeof p.idx !== "number" || p.idx < WHOLE || seen.has(p.idx)) continue;
    const title = String(p.title ?? "").trim().slice(0, 200);
    if (!title || !validIds.has(p.assigneeId)) continue;
    const due = typeof p.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.due) ? p.due : null;
    seen.add(p.idx);
    out.push({ idx: p.idx, title, assigneeId: p.assigneeId, due });
    if (out.length >= 8) break;
  }
  return out;
}

/** 다음 액션이 없을 때 결과 전체를 한 건의 업무로 배정하는 표시 */
export const WHOLE = -1;

/** 업무 본문(note)에서 머리말·원래 지시문을 뺀 보고서 본문 */
export function reportBody(note: string | null | undefined): string {
  return String(note ?? "").replace(/^\[AI 정기업무 결과[^\n]*\n[^\n]*\n\n/, "").split("\n\n[업무 지시]")[0].trim();
}

/**
 * 승인 시 기본 배정안: 다음 액션마다 추천 담당(없으면 승인자).
 * 다음 액션이 없으면 결과 전체를 '{업무명} 실행' 1건으로 승인자에게 배정한다. 승인은 항상 배정으로 이어진다.
 */
export function defaultPicks(views: ActionView[], title: string, approverId: string): DispatchPick[] {
  if (views.length === 0) return [{ idx: WHOLE, title: `${title} 실행`.slice(0, 200), assigneeId: approverId, due: null }];
  return views.map((v) => ({ idx: v.idx, title: v.task, assigneeId: v.suggestId ?? approverId, due: v.due }));
}
