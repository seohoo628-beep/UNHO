// 의존성 없는 최소 CSV 파서. 따옴표·콤마·개행을 처리한다.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  // BOM 제거
  const s = text.replace(/^﻿/, "");

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      // 완전히 빈 줄은 건너뜀
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((v) => v.trim() !== "")) rows.push(row);
  }
  return rows;
}

/** 헤더 문자열에서 키워드를 포함하는 컬럼 인덱스를 찾는다(한/영 대응). */
export function findCol(header: string[], keywords: string[]): number {
  const norm = header.map((h) => h.trim().toLowerCase());
  for (let i = 0; i < norm.length; i++) {
    if (keywords.some((k) => norm[i].includes(k.toLowerCase()))) return i;
  }
  return -1;
}

export function toNum(v: string | undefined): number | null {
  if (v == null) return null;
  const cleaned = v.replace(/[,\s원₩]/g, "").trim();
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return isNaN(n) ? null : n;
}
