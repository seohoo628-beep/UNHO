import { parseCsv } from "@/lib/csv";
import { getSetting } from "@/lib/settings";

// 셀러 관리 구글 시트 — 읽기 전용. 로컬 복제하지 않는다(원본이 갈라지면 안 됨).
// CLAUDE.md 기준 기본 시트 ID. app_settings 의 seller_sheet_id 로 덮어쓸 수 있다.
export const DEFAULT_SELLER_SHEET_ID = ""; // 운호 시트 제거. /settings 에서 설정한다.

export async function getSellerSheetId(): Promise<string> {
  return (await getSetting("seller_sheet_id")) || DEFAULT_SELLER_SHEET_ID;
}

/**
 * 구글 시트를 CSV(gviz)로 읽는다. 시트가 "링크가 있는 모든 사용자 - 뷰어"로 공유돼 있어야 한다.
 * 비공개면 로그인 HTML이 와서 실패로 처리한다.
 */
export async function fetchSellerSheet(
  sheetId?: string
): Promise<{ ok: boolean; rows?: string[][]; error?: string }> {
  const id = sheetId || (await getSellerSheetId());
  const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv`;
  try {
    const res = await fetch(url, { redirect: "follow", cache: "no-store" });
    const text = await res.text();
    if (!res.ok || text.trim().startsWith("<")) {
      return {
        ok: false,
        error:
          '시트를 읽지 못했습니다. 구글 시트 공유 설정을 "링크가 있는 모든 사용자 · 뷰어"로 바꾸세요(읽기 전용).',
      };
    }
    return { ok: true, rows: parseCsv(text) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "시트 읽기 실패" };
  }
}

/** MD 에이전트 입력용 요약 텍스트(헤더 + 상위 N행). */
export function summarizeSheet(rows: string[][], maxRows = 20): string {
  if (rows.length === 0) return "";
  const header = rows[0].join(" | ");
  const body = rows
    .slice(1, 1 + maxRows)
    .map((r) => r.join(" | "))
    .join("\n");
  return `${header}\n${body}`;
}
