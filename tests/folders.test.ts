import { test } from "node:test";
import assert from "node:assert/strict";
import { FOLDER_GROUPS, ARCHIVE_GROUP } from "../src/lib/folders";

test("메뉴 단순화: 핵심 묶음 6개 + 보관함, 주소 중복 없음", () => {
  const titles = FOLDER_GROUPS.map((g) => g.title);
  assert.equal(titles.length, 7);
  assert.equal(titles[titles.length - 1], ARCHIVE_GROUP);
  const hrefs = FOLDER_GROUPS.flatMap((g) => g.items.map((i) => i.href));
  assert.equal(new Set(hrefs).size, hrefs.length);
  // 기존 메뉴는 지우지 않고 보관함으로 옮겼다(주소 접근 유지).
  for (const h of ["/focus", "/commerce-lectures", "/commerce-framework", "/revenue-plans", "/dashboard", "/food-places", "/expense-plans"]) assert.ok(hrefs.includes(h), h);
  for (const g of FOLDER_GROUPS.filter((g) => g.title !== ARCHIVE_GROUP)) assert.ok(g.items.length <= 11, `${g.title} ${g.items.length}개`);
});
