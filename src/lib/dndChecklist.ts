// 체크리스트 교차 드래그(항목을 다른 상위로, 상위를 다른 상위의 체크리스트로) 공용 상태.
// 한 번에 하나의 드래그만 있으므로 모듈 전역 변수로 충분(HTML5 DnD, PC 전용).
export type ChecklistDnd =
  | { kind: "item"; parentId: string; itemId: string }
  | { kind: "parent"; parentId: string };

let current: ChecklistDnd | null = null;
export function setChecklistDnd(v: ChecklistDnd | null) { current = v; }
export function getChecklistDnd(): ChecklistDnd | null { return current; }
