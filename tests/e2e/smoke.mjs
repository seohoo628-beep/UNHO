/**
 * 커머스 마케팅 플랜 화면 스모크 테스트.
 *
 * 이 화면(public/commerce-interview/index.html)은 2,700줄짜리 단일 HTML 이라
 * 단위 테스트가 닿지 않는다. 그동안 회귀가 실제로 두 번 났고(두 낱말 키워드,
 * 예시 채우기), 둘 다 브라우저를 손으로 돌려서야 잡았다. 그 손 검증을 여기에
 * 고정해 CI 가 매 PR 마다 돌린다.
 *
 * 외부 API(11번가·네이버·어시스턴트)는 전부 가로채서 응답만 넣는다 —
 * 여기서 검증하는 것은 서버가 아니라 화면의 동작이다.
 *
 * 실행: node tests/e2e/smoke.mjs
 * 크로미움 경로를 지정하려면 PW_EXECUTABLE=/path/to/chrome
 */
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

/* CI 는 npm 으로 받은 playwright 를 쓰고, 로컬 샌드박스는 전역 설치를 경로로 준다. */
const pwMod = await import(process.env.PW_MODULE || "playwright");
const { chromium } = pwMod.default ?? pwMod;

const ROOT = new URL("../../public", import.meta.url).pathname;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };

const server = http.createServer(async (req, res) => {
  try {
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
    const file = join(ROOT, path || "index.html");
    if (!file.startsWith(ROOT)) throw new Error("traversal");
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const BASE = `http://127.0.0.1:${server.address().port}/commerce-interview/index.html`;

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};

const browser = await chromium.launch({ executablePath: process.env.PW_EXECUTABLE || undefined });

/** 페이지를 열고 콘솔 오류를 모은다. 어떤 시나리오든 오류 0개가 전제다. */
async function open(url = BASE) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mockApis(page);
  await page.goto(url);
  await page.waitForTimeout(300);
  return { page, errors };
}

/** 시장조사·어시스턴트 API 모킹. 11번가 응답은 중복 1건을 섞어 접힘도 함께 검증한다. */
async function mockApis(page) {
  await page.route("**/api/commerce-interview/market", (r) => {
    const b = JSON.parse(r.request().postData());
    if (b.action === "shop") {
      const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
      const items = Array.from({ length: 11 }, (_, i) => ({
        title: `${b.query} ${"가나다라마바사아자차카"[i]}브랜드 ${(i + 1) * 10}정 3개월분`,
        price: 9900 + i * 2500, mall: `몰${i % 5}`, brand: "",
        link: `https://www.11st.co.kr/p/${i}`, category: "", reviews: i % 3 === 0 ? (i + 1) * 37 : 0, rating: 4.5,
      }));
      // 서버가 붙여 주는 이전 스냅샷 — 10일 전 리뷰 310 → 오늘 370 (리뷰작성률 5% 면 월 3,600건)
      items[9].prev = { d: daysAgo(10), r: 310 };
      items.push({ ...items[0] }); // 같은 제품이 다른 몰에 또 잡힌 경우
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, query: b.query, items }) });
    }
    if (b.action === "keywords")
      return r.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ ok: true, stats: (b.keywords ?? []).map((k, i) => ({ keyword: k, total: 500 + ((k.length * 971 + i * 137) % 40000) })) }) });
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: false, error: "unknown" }) });
  });
  await page.route("**/api/commerce-interview/assistant", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      ok: true, reply: "판가를 올리는 쪽을 권합니다.",
      fields: [
        { id: "pPrice", label: "판가", value: "39000", why: "경쟁 평균 상단" },
        { id: "margin", label: "마진율", value: "40", why: "원가 기준" },
        { id: "nope", label: "없는칸", value: "1" },
      ],
      rows: [{ index: 2, col: "s", label: "판매건수", value: "210", why: "추정" }],
    }) }));
}

// ── 1. 기본 로드 · 계산 ──────────────────────────────────────────────
{
  const { page, errors } = await open();
  console.log("[기본 로드]");
  await page.fill("#pName", "스모크 제품");
  await page.fill("#pPrice", "29900");
  await page.waitForTimeout(200);
  check("판가 입력이 행사가에 반영", (await page.textContent("#pE1v")).includes("원"));
  check("콘솔 오류 없음", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ── 2. 경쟁제품 검색 → 키워드 도출 → 조회량 ─────────────────────────
{
  const { page, errors } = await open();
  console.log("[경쟁제품 검색]");
  await page.fill("#pSpec", "헛개+밀크씨슬 · 개별포장 · 20포");
  await page.click('button:has-text("스펙으로 경쟁제품 검색")');
  await page.waitForTimeout(800);
  const rows = await page.$$eval("#kwBody tr", (trs) =>
    trs.filter((tr) => tr.querySelector(".kwP").value).map((tr) => ({
      k: tr.querySelector(".kwK").value, v: tr.querySelector(".kwV").value, link: tr.dataset.link,
    })));
  check("중복이 접혀 10행", rows.length === 10, `${rows.length}행`);
  check("키워드가 전부 채워짐", rows.every((r) => r.k));
  // 표 이름이 '판매량 TOP10'이다 — 리뷰 많은 것(= 많이 팔린 것)부터 와야 한다.
  const reviews = await page.$$eval("#kwBody tr", (trs) =>
    trs.filter((tr) => tr.querySelector(".kwP").value).map((tr) => Number(tr.querySelector(".kwR").value.replace(/,/g, "")) || 0));
  check("리뷰 많은 순으로 정렬", reviews[0] === 370 && reviews[1] === 259, reviews.join(","));
  // 서버 스냅샷(prev)이 있으면 첫 검색부터 판매건수가 추정으로 찬다.
  const est = await page.$$eval("#kwBody tr", (trs) => {
    const tr = trs[0]; // 리뷰 370짜리가 1행이다
    return { s: tr.querySelector(".kwS").value, marked: tr.dataset.est === "1" };
  });
  check("서버 스냅샷으로 판매건수 추정", est.s === "3,600", est.s);
  check("추정값에 표시가 붙음", est.marked);
  // 회귀 방어: 두 낱말을 붙이면 아무도 안 치는 말이 돼 조회량이 죽는다 (#149)
  check("키워드에 두 낱말 없음", rows.every((r) => !r.k.includes(" ")), rows.map((r) => r.k).join(","));
  check("조회량이 채워짐", rows.every((r) => r.v !== "" && r.v !== "0"));
  check("상세 링크가 행에 저장됨", rows.every((r) => /^https:/.test(r.link)));
  // 판매건수는 첫 검색엔 비는 게 맞다(리뷰 기준선만 저장). 리뷰수는 API 가 주므로
  // ① 시장 평균 보유리뷰가 자동으로 붙어야 한다.
  const avg = await page.textContent("#mReviewAuto");
  check("① 평균 보유리뷰가 ② 표에서 자동", avg.includes("자동"), avg);
  check("콘솔 오류 없음", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ── 3. 어시스턴트: 미리보기 → 선택 반영 ─────────────────────────────
{
  const { page, errors } = await open();
  console.log("[어시스턴트]");
  await page.fill("#pPrice", "29900");
  await page.click("#aiFab");
  await page.fill("#aiMsg", "판가 어때?");
  await page.click("#aiSendBtn");
  await page.waitForSelector(".aiPatch", { timeout: 5000 });
  const items = await page.$$eval(".aiChg .cn", (e) => e.map((x) => x.textContent));
  check("허용 목록 밖 칸은 미리보기에 없음", !items.some((t) => t.includes("없는칸")), items.join(","));
  await page.uncheck('.aiChg input[data-i="1"]'); // 마진율은 빼고
  await page.click(".aiPatch .act .btn.accent");
  await page.waitForTimeout(200);
  check("체크한 값만 반영 (판가)", (await page.inputValue("#pPrice")) === "39,000");
  check("체크 뺀 값은 그대로 (마진율)", (await page.inputValue("#margin")) === "25");
  check("표 셀 반영 (2행 판매건수)",
    (await page.$$eval("#kwBody tr", (t) => t[1].querySelector(".kwS").value)) === "210");
  check("콘솔 오류 없음", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ── 4. 기본/세부 모드 · 인쇄 ────────────────────────────────────────
{
  const { page, errors } = await open();
  console.log("[기본/세부 모드]");
  const cards = () => page.$$eval(".card[data-sec]", (cs) => cs.filter((c) => c.checkVisibility()).map((c) => c.dataset.sec).sort().join(""));
  check("기본 모드 카드 ①②④⑤⑥", (await cards()) === "12456", await cards());
  // 회귀 방어: 상단 버튼은 '하는 일'이라 접으면 안 된다 (#155)
  check("예시 채우기 버튼 보임", await page.isVisible('button:has-text("예시 채우기")'));
  await page.click("#advBtn");
  await page.waitForTimeout(200);
  check("세부 모드 카드 전부", (await cards()) === "12345679", await cards());
  await page.click("#advBtn");
  await page.emulateMedia({ media: "print" });
  check("인쇄에는 ③⑦⑨도 나옴",
    (await Promise.all(["3", "7", "9"].map((n) => page.isVisible(`[data-sec="${n}"]`)))).every(Boolean));
  await page.emulateMedia({ media: "screen" });
  check("콘솔 오류 없음", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ── 5. 저장/복원 왕복 ───────────────────────────────────────────────
{
  const { page, errors } = await open();
  console.log("[저장/복원]");
  await page.fill("#pName", "왕복 제품");
  await page.fill("#pPrice", "19900");
  await page.fill("#pSpec", "헛개 · 20포");
  await page.click('button:has-text("스펙으로 경쟁제품 검색")');
  await page.waitForTimeout(800);
  const kept = await page.evaluate(() => {
    const s = collectState();
    applyState(JSON.parse(JSON.stringify(s))); // 직렬화를 거쳐야 저장과 같은 경로다
    return { name: document.getElementById("pName").value,
      rows: [...document.querySelectorAll("#kwBody tr")].filter((tr) => tr.querySelector(".kwP").value).length };
  });
  check("입력값 유지", kept.name === "왕복 제품");
  check("② 표 유지", kept.rows === 10, `${kept.rows}행`);
  check("콘솔 오류 없음", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ── 6. 외부 요청 모드 ───────────────────────────────────────────────
{
  const { page, errors } = await open(BASE + "?req=1");
  console.log("[외부 요청 모드]");
  check("내부 버튼 숨김 (카탈로그)", !(await page.isVisible('button:has-text("제품 카탈로그")')));
  check("어시스턴트 숨김", !(await page.isVisible("#aiFab")));
  check("작성 내용 링크 복사 보임", await page.isVisible('button:has-text("작성 내용 링크 복사")'));
  check("콘솔 오류 없음", errors.length === 0, errors.join(" | "));
  await page.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures}개 실패` : "\n전부 통과");
process.exit(failures ? 1 : 0);
