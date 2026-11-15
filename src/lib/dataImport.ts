// 엑셀·CSV 붙여넣기 → CS 문의 / 출고 / 공구·입점 리드 행으로 변환. 순수 함수(테스트 대상).
// 첫 줄은 머리글. 스마트스토어·카카오채널·쿠팡·택배사 내보내기 머리글을 흔한 이름으로 매핑한다.

export type ImportKind = "cs" | "shipments" | "crm";

type FieldDef = { key: string; label: string; aliases: string[]; required?: boolean; type?: "date" | "number" };

export const FIELDS: Record<ImportKind, FieldDef[]> = {
  cs: [
    { key: "received_at", label: "접수일", aliases: ["접수일", "문의일", "문의일시", "작성일", "등록일", "날짜", "일자", "received"], type: "date" },
    { key: "channel", label: "채널", aliases: ["채널", "판매처", "몰", "쇼핑몰", "경로", "channel"] },
    { key: "brand", label: "브랜드", aliases: ["브랜드", "brand"] },
    { key: "customer", label: "고객", aliases: ["고객", "고객명", "구매자", "구매자명", "작성자", "이름", "customer"] },
    { key: "order_no", label: "주문번호", aliases: ["주문번호", "상품주문번호", "order", "order_no"] },
    { key: "category", label: "유형", aliases: ["유형", "문의유형", "분류", "카테고리", "구분", "category"] },
    { key: "content", label: "내용", aliases: ["내용", "문의내용", "문의", "본문", "제목", "content"], required: true },
    { key: "status", label: "상태", aliases: ["상태", "처리상태", "답변상태", "status"] },
    { key: "answer", label: "답변", aliases: ["답변", "답변내용", "처리내용", "answer"] },
  ],
  shipments: [
    { key: "ship_date", label: "출고일", aliases: ["출고일", "발송일", "배송일", "출고일자", "발송처리일", "날짜", "일자"], type: "date" },
    { key: "channel", label: "채널", aliases: ["채널", "판매처", "거래처", "쇼핑몰", "몰"] },
    { key: "brand", label: "브랜드", aliases: ["브랜드"] },
    { key: "order_no", label: "주문번호", aliases: ["주문번호", "상품주문번호", "order"] },
    { key: "item", label: "품목", aliases: ["품목", "상품명", "제품명", "상품", "품명", "item"], required: true },
    { key: "qty", label: "수량", aliases: ["수량", "출고수량", "개수", "qty"], type: "number" },
    { key: "carrier", label: "택배사", aliases: ["택배사", "배송사", "물류사", "3pl", "carrier"] },
    { key: "tracking_no", label: "송장번호", aliases: ["송장번호", "운송장번호", "운송장", "송장", "tracking"] },
    { key: "status", label: "상태", aliases: ["상태", "배송상태", "status"] },
    { key: "note", label: "메모", aliases: ["메모", "비고", "note"] },
  ],
  crm: [
    { key: "name", label: "이름", aliases: ["이름", "셀러명", "바이어", "업체명", "회사명", "계정", "채널명", "name"], required: true },
    { key: "kind", label: "구분", aliases: ["구분", "유형", "kind"] },
    { key: "handle", label: "핸들", aliases: ["핸들", "인스타", "유튜브", "아이디", "도메인", "handle"] },
    { key: "contact", label: "연락처", aliases: ["연락처", "전화", "이메일", "메일", "contact"] },
    { key: "product", label: "제품", aliases: ["제품", "상품", "제안제품", "매칭제품", "product"] },
    { key: "stage", label: "단계", aliases: ["단계", "상태", "진행상태", "stage"] },
    { key: "source", label: "출처", aliases: ["출처", "유입", "경로", "source"] },
    { key: "proposed_at", label: "제안일", aliases: ["제안일", "proposed"], type: "date" },
    { key: "next_follow_up", label: "팔로업", aliases: ["팔로업", "다음팔로업", "팔로업일", "다음연락일", "follow"], type: "date" },
    { key: "note", label: "메모", aliases: ["메모", "비고", "note"] },
  ],
};

const norm = (s: string) => s.replace(/[\s_\-()[\]·./]/g, "").toLowerCase();

/** CSV(쉼표, 따옴표 지원) 또는 엑셀 복사(탭) 텍스트를 2차원 배열로 */
export function parseTable(text: string): string[][] {
  const src = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();
  if (!src) return [];
  const firstLine = src.split("\n")[0];
  const delim = firstLine.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"' && cell === "") q = true;
    else if (c === delim) { row.push(cell.trim()); cell = ""; }
    else if (c === "\n") { row.push(cell.trim()); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  row.push(cell.trim());
  rows.push(row);
  return rows.filter((r) => r.some((c) => c !== ""));
}

/** 2026.11.15 / 2026-11-15 / 20261115 / 11/15 / 2026-11-15 13:20 → YYYY-MM-DD */
export function normDate(v: string, today: string): string | null {
  const s = v.trim();
  if (!s) return null;
  let m = s.match(/^(20\d{2})[.\-/년\s]*(\d{1,2})[.\-/월\s]*(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(20\d{2})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[./\-월\s]+(\d{1,2})/);
  if (m) return `${today.slice(0, 4)}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}

const CS_STATUS = (v: string) => (/완료|답변완료|처리완료|종료/.test(v) ? "완료" : /처리중|진행|확인중/.test(v) ? "처리중" : "미처리");
const SHIP_STATUS = (v: string) =>
  /반품|회수/.test(v) ? "반품" : /지연|보류/.test(v) ? "지연" : /완료|배달/.test(v) ? "배송완료" : /배송중|이동/.test(v) ? "배송중" : "출고";
const CRM_STAGES = ["발굴", "제안", "회신", "협의", "성사", "실패", "보류"];

export type ImportResult = { headers: string[]; mapping: Record<string, string | null>; rows: Record<string, unknown>[]; skipped: number };

export function mapRows(kind: ImportKind, text: string, today: string): ImportResult {
  const table = parseTable(text);
  if (table.length < 2) return { headers: table[0] ?? [], mapping: {}, rows: [], skipped: 0 };
  const headers = table[0];
  const fields = FIELDS[kind];
  const used = new Set<number>();
  const mapping: Record<string, string | null> = {};
  const index: Record<string, number> = {};
  for (const f of fields) {
    const aliases = f.aliases.map(norm);
    // 정확히 같은 이름 우선, 없으면 포함 관계
    let at = headers.findIndex((h, i) => !used.has(i) && aliases.includes(norm(h)));
    if (at < 0) at = headers.findIndex((h, i) => !used.has(i) && aliases.some((a) => a.length >= 2 && norm(h).includes(a)));
    if (at >= 0) { used.add(at); index[f.key] = at; mapping[f.key] = headers[at]; } else mapping[f.key] = null;
  }

  const rows: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const r of table.slice(1)) {
    const get = (k: string) => (index[k] === undefined ? "" : (r[index[k]] ?? "").trim());
    const out: Record<string, unknown> = {};
    for (const f of fields) {
      const v = get(f.key);
      if (!v) continue;
      if (f.type === "date") { const d = normDate(v, today); if (d) out[f.key] = d; }
      else if (f.type === "number") { const n = Number(v.replace(/[^\d.\-]/g, "")); if (!isNaN(n)) out[f.key] = n; }
      else out[f.key] = v.slice(0, 2000);
    }
    if (fields.some((f) => f.required && !out[f.key])) { skipped++; continue; }
    if (kind === "cs") {
      out.status = CS_STATUS(String(out.status ?? ""));
      out.received_at ??= today;
    } else if (kind === "shipments") {
      out.status = SHIP_STATUS(String(out.status ?? ""));
      out.ship_date ??= today;
      out.qty ??= 1;
    } else {
      out.kind = /바이어|buyer|입점|유통/i.test(String(out.kind ?? "")) ? "buyer" : "seller";
      const st = String(out.stage ?? "");
      out.stage = CRM_STAGES.find((s) => st.includes(s)) ?? "발굴";
    }
    rows.push(out);
  }
  return { headers, mapping, rows, skipped };
}
