/**
 * 미수금 장부(receivables)에서 해당 월의 매출 세금계산서 발행 대상을 뽑아
 * tax_invoice.py 입력 CSV를 만든다. DB는 읽기만 한다.
 *
 *   node --env-file=.env.local --import tsx \
 *     .claude/skills/tax-invoice/scripts/export_receivables.ts 2026-11 projects/tax-invoice/2026-11/입력.csv
 *
 * 대상: 공급일이 그 달이고 승인번호가 없는 건. 면세 건은 CSV에서 빼고 따로 출력한다.
 * 필요 환경변수: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { monthRange, toCsv, toInputRows, type LedgerRow } from "../../../../src/lib/taxInvoice";

const [ym, out] = process.argv.slice(2);
if (!ym || !out) {
  console.error("사용법: export_receivables.ts YYYY-MM OUT.csv");
  process.exit(2);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || url.includes("your-project")) {
  console.error(".env.local 에 실제 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.");
  process.exit(2);
}

async function main() {
  const { from, to } = monthRange(ym);
  const supabase = createClient(url!, key!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await supabase
    .from("receivables")
    .select(
      "id,counterparty,item,supplier,supply_date,quantity,unit_price,supply_amount,tax_type,invoice_kind,invoice_no,note," +
        "vendors(name,business_no,ceo,address,biz_type,biz_item,tax_email,email)"
    )
    .gte("supply_date", from)
    .lte("supply_date", to)
    .is("invoice_no", null)
    .order("supplier")
    .order("supply_date");
  if (error) {
    console.error(`조회 실패: ${error.message}`);
    if (/column|supplier|supply_date/.test(error.message)) {
      console.error("마이그레이션 0097_tax_invoice_ledger.sql 적용이 필요합니다.");
    }
    process.exit(2);
  }

  const { rows, exempt, gaps } = toInputRows((data ?? []) as unknown as LedgerRow[]);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, toCsv(rows), "utf-8");

  console.log(`${ym} 발행 대상 ${rows.length}건 → ${out}`);
  if (exempt.length) {
    console.log(`\n면세 ${exempt.length}건(세금계산서 아님, 계산서로 별도 발행):`);
    for (const r of exempt) console.log(`- ${r.counterparty} / ${r.item ?? "-"} (receivable:${r.id})`);
  }
  if (gaps.length) {
    console.log(`\n장부 정보 부족 ${gaps.length}건(앱에서 보완 후 다시 실행):`);
    for (const g of gaps) console.log(`- ${g.counterparty}: ${g.missing.join(", ")} (receivable:${g.id})`);
  }
  // 누락 방지: 공급일 없는 미발행 건은 어느 달인지 몰라 빠진다. 개수만 알린다.
  const { count } = await supabase
    .from("receivables")
    .select("id", { count: "exact", head: true })
    .not("supplier", "is", null)
    .is("supply_date", null)
    .is("invoice_no", null);
  if (count) console.log(`\n참고: 공급일이 비어 이번 추출에서 빠진 미발행 건 ${count}건`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
