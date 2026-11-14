#!/usr/bin/env python3
"""운호컴퍼니 매출 전자세금계산서 발행 대장 생성·검증 도구.

발행 자체는 하지 않는다. 홈택스(또는 지정 발행 서비스)에 사람이 입력·서명하기 전에
입력 데이터를 검증하고, 세금계산서 단위로 묶은 발행 대장을 만든다.

사용법:
    python3 tax_invoice.py template OUT.csv          # 입력 양식 CSV 생성
    python3 tax_invoice.py build IN.csv OUT_DIR      # 검증 + 발행 대장 생성
        [--today YYYY-MM-DD]                          # 기한 계산 기준일(기본: 오늘)

입력 CSV 한 줄 = 품목 1개. 같은 (공급자, 작성일자, 공급받는자 사업자번호, 영수/청구)
조합은 세금계산서 1장으로 묶고, 품목이 4개를 넘으면 장을 나눈다.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import re
import sys
from collections import OrderedDict
from pathlib import Path

# 자사 공급자(발행 주체). 업태·종목은 사업자등록증 기준으로 채워야 한다.
SUPPLIERS = {
    "운호컴퍼니": {"name": "㈜운호컴퍼니", "biz_no": "715-87-03094", "ceo": "최운호",
               "address": "서울 강남구 신사동 562-17 신영빌딩 301호"},
    "뷰티밤": {"name": "뷰티밤㈜", "biz_no": "654-81-02686", "ceo": "최운호",
            "address": "서울 강남구 신사동 562-17 신영빌딩 301호"},
}
BLOCKED_SUPPLIERS = ("SBJ", "엣지라인")
MAX_ITEMS = 4

COLUMNS = [
    "공급자", "작성일자", "공급받는자_사업자번호", "공급받는자_상호", "공급받는자_대표자",
    "공급받는자_주소", "공급받는자_업태", "공급받는자_종목", "공급받는자_이메일",
    "품목", "규격", "수량", "단가", "공급가액", "세액", "과세유형", "영수청구", "비고",
]
EXAMPLE = {
    "공급자": "운호컴퍼니", "작성일자": "2026-11-13", "공급받는자_사업자번호": "000-00-00000",
    "공급받는자_상호": "(거래처 상호)", "공급받는자_대표자": "(대표자)",
    "공급받는자_주소": "(사업장 주소)", "공급받는자_업태": "", "공급받는자_종목": "",
    "공급받는자_이메일": "tax@example.com", "품목": "(품목명)", "규격": "", "수량": "1",
    "단가": "", "공급가액": "", "세액": "", "과세유형": "과세", "영수청구": "청구", "비고": "",
}
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def valid_biz_no(raw: str) -> bool:
    """국세청 사업자등록번호 체크섬."""
    d = re.sub(r"\D", "", raw or "")
    if len(d) != 10 or len(set(d)) == 1:  # 000-00-00000 등 반복 숫자는 체크섬이 맞아도 무효
        return False
    digits = [int(c) for c in d]
    weights = [1, 3, 7, 1, 3, 7, 1, 3, 5]
    total = sum(a * b for a, b in zip(digits, weights)) + (digits[8] * 5) // 10
    return (10 - total % 10) % 10 == digits[9]


def fmt_biz_no(raw: str) -> str:
    d = re.sub(r"\D", "", raw)
    return f"{d[:3]}-{d[3:5]}-{d[5:]}" if len(d) == 10 else raw


def to_int(raw: str) -> int | None:
    s = (raw or "").replace(",", "").strip()
    if not s:
        return None
    try:
        return int(float(s))
    except ValueError:
        return None


def issue_deadline(write_date: dt.date) -> dt.date:
    """발급기한: 공급시기(작성일자)가 속한 달의 다음 달 10일."""
    y, m = (write_date.year + 1, 1) if write_date.month == 12 else (write_date.year, write_date.month + 1)
    return dt.date(y, m, 10)


def resolve_supplier(raw: str) -> tuple[str | None, str | None]:
    s = (raw or "").strip()
    if any(b in s for b in BLOCKED_SUPPLIERS):
        return None, f"공급자 '{s}'는 자사 법인이 아님(발행 불가)"
    for key in SUPPLIERS:
        if key in s:
            return key, None
    return None, f"공급자 '{s}' 미확인(운호컴퍼니/뷰티밤 중 하나)"


def check_row(n: int, row: dict, today: dt.date) -> tuple[dict, list[str], list[str]]:
    errors, warnings = [], []
    sup, err = resolve_supplier(row.get("공급자", ""))
    if err:
        errors.append(err)

    try:
        wdate = dt.date.fromisoformat((row.get("작성일자") or "").strip())
    except ValueError:
        wdate = None
        errors.append("작성일자 형식 오류(YYYY-MM-DD)")
    if wdate:
        if wdate > today:
            warnings.append("작성일자가 미래 날짜")
        deadline = issue_deadline(wdate)
        if today > deadline:
            warnings.append(f"발급기한({deadline}) 경과: 지연발급 가산세 대상일 수 있음, 세무대리인 확인")
        elif (deadline - today).days <= 3:
            warnings.append(f"발급기한 임박({deadline})")

    biz = row.get("공급받는자_사업자번호", "")
    if not valid_biz_no(biz):
        errors.append(f"공급받는자 사업자번호 '{biz}' 체크섬 불일치")
    for f in ("공급받는자_상호", "공급받는자_대표자", "품목"):
        v = (row.get(f) or "").strip()
        if not v or v.startswith("("):
            errors.append(f"{f} 비어 있음")
    for f in ("공급받는자_주소", "공급받는자_업태", "공급받는자_종목"):
        if not (row.get(f) or "").strip() or (row.get(f) or "").startswith("("):
            warnings.append(f"{f} 비어 있음(사업자등록증 확인 권장)")
    email = (row.get("공급받는자_이메일") or "").strip()
    if not EMAIL_RE.match(email) or email.endswith("example.com"):
        errors.append(f"공급받는자 이메일 '{email}' 확인 필요")

    tax_type = (row.get("과세유형") or "과세").strip()
    if tax_type not in ("과세", "영세"):
        errors.append(f"과세유형 '{tax_type}': 과세/영세만 허용(면세는 계산서로 별도 발행)")
    kind = (row.get("영수청구") or "청구").strip()
    if kind not in ("영수", "청구"):
        errors.append(f"영수청구 '{kind}': 영수/청구만 허용")

    qty, price = to_int(row.get("수량", "")), to_int(row.get("단가", ""))
    supply, tax = to_int(row.get("공급가액", "")), to_int(row.get("세액", ""))
    if supply is None and qty is not None and price is not None:
        supply = qty * price
    if supply is None:
        errors.append("공급가액 없음(공급가액 또는 수량×단가 필요)")
    elif qty is not None and price is not None and qty * price != supply:
        warnings.append(f"수량×단가({qty * price:,}) ≠ 공급가액({supply:,})")
    expected_tax = None
    if supply is not None:
        expected_tax = supply // 10 if tax_type == "과세" else 0  # 원 단위 절사(부동소수 오차 없음)
        if tax is None:
            tax = expected_tax
        elif tax != expected_tax:
            warnings.append(f"세액 {tax:,} ≠ 계산값 {expected_tax:,}(원 단위 절사 기준)")

    clean = {
        "supplier": sup, "write_date": wdate, "buyer_biz": fmt_biz_no(biz),
        "buyer_name": (row.get("공급받는자_상호") or "").strip(),
        "buyer_ceo": (row.get("공급받는자_대표자") or "").strip(),
        "buyer_addr": (row.get("공급받는자_주소") or "").strip(),
        "buyer_type": (row.get("공급받는자_업태") or "").strip(),
        "buyer_item": (row.get("공급받는자_종목") or "").strip(),
        "buyer_email": email, "item": (row.get("품목") or "").strip(),
        "spec": (row.get("규격") or "").strip(), "qty": qty, "price": price,
        "supply": supply or 0, "tax": tax or 0, "tax_type": tax_type, "kind": kind,
        "note": (row.get("비고") or "").strip(),
    }
    return clean, [f"{n}행: {e}" for e in errors], [f"{n}행: {w}" for w in warnings]


def cmd_template(out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS)
        w.writeheader()
        w.writerow(EXAMPLE)
    print(f"입력 양식 생성: {out}")


def cmd_build(src: Path, out_dir: Path, today: dt.date) -> int:
    with src.open(newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    missing = [c for c in ("공급자", "작성일자", "공급받는자_사업자번호", "품목") if c not in (rows[0] if rows else {})]
    if not rows or missing:
        print(f"입력 오류: 행이 없거나 필수 열 누락 {missing}", file=sys.stderr)
        return 2

    all_err, all_warn, groups = [], [], OrderedDict()
    for i, row in enumerate(rows, start=2):  # 1행은 헤더
        clean, errs, warns = check_row(i, row, today)
        all_err += errs
        all_warn += warns
        key = (clean["supplier"], clean["write_date"], clean["buyer_biz"], clean["kind"], clean["tax_type"])
        groups.setdefault(key, []).append(clean)

    invoices = []
    for (sup, wdate, biz, kind, tax_type), items in groups.items():
        for start in range(0, len(items), MAX_ITEMS):
            chunk = items[start:start + MAX_ITEMS]
            invoices.append({"supplier": sup, "write_date": wdate, "kind": kind, "tax_type": tax_type,
                             "items": chunk, "split": len(items) > MAX_ITEMS})

    out_dir.mkdir(parents=True, exist_ok=True)
    ledger = out_dir / "발행대장.csv"
    with ledger.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["장번호", "공급자", "공급자_사업자번호", "작성일자", "발급기한", "과세유형", "영수청구",
                    "공급받는자_사업자번호", "상호", "대표자", "주소", "업태", "종목", "이메일",
                    "품목순번", "월일", "품목", "규격", "수량", "단가", "공급가액", "세액", "비고",
                    "승인번호(발행 후 기입)"])
        for no, inv in enumerate(invoices, start=1):
            s = SUPPLIERS.get(inv["supplier"] or "", {})
            for j, it in enumerate(inv["items"], start=1):
                wd = inv["write_date"]
                w.writerow([no, s.get("name", "?"), s.get("biz_no", "?"), wd or "?",
                            issue_deadline(wd) if wd else "?", inv["tax_type"], inv["kind"],
                            it["buyer_biz"], it["buyer_name"], it["buyer_ceo"], it["buyer_addr"],
                            it["buyer_type"], it["buyer_item"], it["buyer_email"], j,
                            wd.strftime("%m%d") if wd else "", it["item"], it["spec"],
                            it["qty"] if it["qty"] is not None else "",
                            it["price"] if it["price"] is not None else "",
                            it["supply"], it["tax"], it["note"], ""])

    total_supply = sum(it["supply"] for inv in invoices for it in inv["items"])
    total_tax = sum(it["tax"] for inv in invoices for it in inv["items"])
    lines = [f"# 매출 세금계산서 발행 대장 ({today} 기준)", "",
             f"- 입력 품목 {len(rows)}건 → 세금계산서 {len(invoices)}장",
             f"- 공급가액 합계 {total_supply:,}원 / 세액 합계 {total_tax:,}원 / 합계 {total_supply + total_tax:,}원",
             f"- 상태: {'발행 불가 — 오류 수정 필요' if all_err else '발행 준비 완료(대표 확인 후 홈택스 입력)'}", "",
             "| 장 | 공급자 | 작성일자 | 공급받는자 | 품목수 | 공급가액 | 세액 | 구분 |",
             "|---|---|---|---|---|---|---|---|"]
    for no, inv in enumerate(invoices, start=1):
        it0 = inv["items"][0]
        sname = SUPPLIERS.get(inv["supplier"] or "", {}).get("name", "?")
        lines.append(f"| {no} | {sname} | {inv['write_date'] or '?'} | {it0['buyer_name']} ({it0['buyer_biz']}) | "
                     f"{len(inv['items'])}{' (분할)' if inv['split'] else ''} | "
                     f"{sum(i['supply'] for i in inv['items']):,} | {sum(i['tax'] for i in inv['items']):,} | "
                     f"{inv['tax_type']}/{inv['kind']} |")
    lines += ["", "## 오류 (발행 전 반드시 수정)", *(f"- {e}" for e in all_err or ["없음"]),
              "", "## 확인 필요", *(f"- {w}" for w in all_warn or ["없음"]),
              "", "## 사람이 할 일",
              "- 공급자 업태·종목을 사업자등록증 기준으로 홈택스 입력 화면에서 확인",
              "- 홈택스 로그인(공동인증서) → 전자세금계산서 발급 → 대장 내용 입력 → 서명·발급",
              "- 발급 후 승인번호를 발행대장.csv 마지막 열에 기입하고 경리 에이전트에 알려 미수금 장부 반영"]
    summary = out_dir / "발행대장_요약.md"
    summary.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(summary.read_text(encoding="utf-8"))
    print(f"산출물: {ledger}\n        {summary}")
    return 1 if all_err else 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    t = sub.add_parser("template")
    t.add_argument("out", type=Path)
    b = sub.add_parser("build")
    b.add_argument("src", type=Path)
    b.add_argument("out_dir", type=Path)
    b.add_argument("--today", type=dt.date.fromisoformat, default=dt.date.today())
    a = p.parse_args()
    if a.cmd == "template":
        cmd_template(a.out)
        return 0
    return cmd_build(a.src, a.out_dir, a.today)


if __name__ == "__main__":
    sys.exit(main())
