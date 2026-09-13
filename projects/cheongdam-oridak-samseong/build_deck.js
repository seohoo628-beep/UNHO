/* 청담 오리닭 삼성동점 공동투자 제안서 — UI redesign, content preserved 1:1 */
const pptxgen = require("pptxgenjs");
const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5

const A = "deck_assets/";

// ---- palette (brand: ink black / gold / cream — extracted from existing VI) ----
const INK = "141414";
const INK_SOFT = "3A3630";
const MUTE = "7A7468";
const GOLD = "C9A227";
const GOLD_DEEP = "9A7B1E";
const GOLD_LIGHT = "E3C567";
const CREAM_CARD = "F6F2E9";
const CREAM_CARD2 = "FBF9F4";
const LINE = "E4DDCC";
const DARK_BG = "0E0E10";
const DARK_CARD = "1B1A17";
const DARK_LINE = "35322A";
const CREAM_TXT = "EFE7D4";
const CREAM_SUB = "B4AC99";

const F = "Pretendard";
const FSB = "Pretendard SemiBold";
const FXB = "Pretendard ExtraBold";
const FMD = "Pretendard Medium";

const W = 13.33, H = 7.5, MX = 0.72;
const CW = W - MX * 2;

let pageNo = 0;

function footer(s, dark) {
  pageNo += 1;
  if (pageNo === 1) return;
  s.addText("청담 오리닭 · 공동투자 제안서", {
    x: MX, y: H - 0.42, w: 4, h: 0.3, fontFace: F, fontSize: 8.5,
    color: dark ? CREAM_SUB : MUTE, margin: 0,
  });
  s.addText(String(pageNo).padStart(2, "0"), {
    x: W - MX - 1, y: H - 0.42, w: 1, h: 0.3, fontFace: FMD, fontSize: 8.5,
    color: dark ? CREAM_SUB : MUTE, align: "right", margin: 0,
  });
}

function eyebrow(s, num, label, dark, y = 0.52) {
  s.addText([
    { text: num, options: { fontFace: FXB, fontSize: 13, color: GOLD, charSpacing: 2 } },
    { text: "   " + label, options: { fontFace: FSB, fontSize: 12, color: dark ? CREAM_SUB : MUTE, charSpacing: 4 } },
  ], { x: MX, y, w: 8, h: 0.32, margin: 0 });
}

function title(s, text, dark, y = 0.92, size = 25, w = CW) {
  s.addText(text, {
    x: MX, y, w, h: 0.62, fontFace: FSB, fontSize: size,
    color: dark ? CREAM_TXT : INK, margin: 0, bold: false,
  });
}

function note(s, text, dark, y = H - 0.86, w = CW) {
  s.addText(text, {
    x: MX, y, w, h: 0.34, fontFace: F, fontSize: 9,
    color: dark ? CREAM_SUB : MUTE, margin: 0, valign: "middle",
  });
}

function card(s, x, y, w, h, opts = {}) {
  s.addShape("roundRect", {
    x, y, w, h, rectRadius: 0.07,
    fill: { color: opts.dark ? DARK_CARD : (opts.tint ? CREAM_CARD : CREAM_CARD2) },
    line: { color: opts.dark ? DARK_LINE : LINE, width: 0.75 },
    shadow: opts.noShadow ? undefined : { type: "outer", color: "3A3428", blur: 7, offset: 2, angle: 90, opacity: 0.10 },
  });
}

function infoCard(s, x, y, w, h, head, body, opts = {}) {
  card(s, x, y, w, h, opts);
  const dark = !!opts.dark;
  s.addText(head, {
    x: x + 0.24, y: y + 0.18, w: w - 0.48, h: 0.32, fontFace: FSB,
    fontSize: opts.headSize || 13, color: dark ? GOLD_LIGHT : GOLD_DEEP, margin: 0,
  });
  s.addText(body, {
    x: x + 0.24, y: y + 0.54, w: w - 0.48, h: h - 0.72, fontFace: F,
    fontSize: opts.bodySize || 10.5, color: dark ? CREAM_TXT : INK_SOFT,
    margin: 0, lineSpacingMultiple: 1.3, valign: "top",
  });
}

function statCard(s, x, y, w, h, big, unit, label, sub, opts = {}) {
  card(s, x, y, w, h, opts);
  const dark = !!opts.dark;
  s.addText([
    { text: big, options: { fontFace: FXB, fontSize: opts.bigSize || 34, color: dark ? GOLD_LIGHT : GOLD_DEEP } },
    { text: unit ? " " + unit : "", options: { fontFace: FSB, fontSize: 15, color: dark ? GOLD_LIGHT : GOLD_DEEP } },
  ], { x: x + 0.26, y: y + 0.22, w: w - 0.5, h: 0.62, margin: 0, valign: "middle" });
  s.addText(label, {
    x: x + 0.26, y: y + 0.92, w: w - 0.5, h: 0.3, fontFace: FSB, fontSize: 12,
    color: dark ? CREAM_TXT : INK, margin: 0,
  });
  s.addText(sub, {
    x: x + 0.26, y: y + 1.22, w: w - 0.5, h: h - 1.4, fontFace: F, fontSize: 9.5,
    color: dark ? CREAM_SUB : MUTE, margin: 0, lineSpacingMultiple: 1.25,
  });
}

/* ============ S1 · COVER ============ */
{
  const s = pres.addSlide();
  s.background = { color: DARK_BG };
  s.addImage({ path: A + "cover_hero.jpg", x: 0, y: 0, w: W, h: H });
  s.addImage({ path: A + "cover_grad.png", x: 0, y: 0, w: W, h: H });
  s.addText("공동투자 제안서", {
    x: MX, y: 4.62, w: 6, h: 0.34, fontFace: FSB, fontSize: 13.5, color: GOLD_LIGHT,
    charSpacing: 6, margin: 0,
  });
  s.addText("청담 오리닭 삼성동점", {
    x: MX - 0.04, y: 4.98, w: 11.9, h: 1.05, fontFace: FXB, fontSize: 47, color: "FFFFFF", margin: 0,
  });
  s.addText("청담오리닭 · CHUNGDAM ORI DAK · CHEONGDAM ORIDAK · FIRE ROAST DUCK & CHICKEN", {
    x: MX, y: 6.12, w: 11.9, h: 0.3, fontFace: FMD, fontSize: 10.5, color: CREAM_SUB, charSpacing: 1.5, margin: 0,
  });
  s.addShape("line", { x: MX, y: 6.56, w: 11.89, h: 0, line: { color: GOLD, width: 0.75, transparency: 40 } });
  s.addText("포스코센터 인근 대로변  ·  B1~3F 통임대 136평  ·  2026년 10월 오픈 예정", {
    x: MX, y: 6.68, w: 11.9, h: 0.32, fontFace: F, fontSize: 11.5, color: CREAM_TXT, margin: 0,
  });
  footer(s, true);
}

/* ============ S2 · 01 제안 요약 ============ */
{
  const s = pres.addSlide();
  s.background = { color: "FFFFFF" };
  eyebrow(s, "01", "제안 요약", false);
  title(s, "7.5억 규모 신규 출점, 기준안 월 영업이익 5,400만원", false);
  s.addText("삼성동 포스코센터 인근 대로변 지하 1층~지상 3층 통임대 136평. 지하를 주방으로 설계하고 더미웨이터로 3개 층을 전부 영업면적으로 전환하는 구조다. 총 자금 소요 7.5억, 운영 가치 포함 기업가치 10억 기준으로 지분 참여를 제안한다.", {
    x: MX, y: 1.62, w: CW, h: 0.72, fontFace: F, fontSize: 12, color: INK_SOFT,
    margin: 0, lineSpacingMultiple: 1.35,
  });
  const cw = (CW - 0.9) / 4, ch = 2.15, cy = 2.72;
  statCard(s, MX, cy, cw, ch, "10", "억", "제안 기업가치", "투자 1억 = 지분 10%");
  statCard(s, MX + (cw + 0.3), cy, cw, ch, "월 3", "억", "기준안 목표 매출", "180석 · 일 1.3회전 기준");
  statCard(s, MX + (cw + 0.3) * 2, cy, cw, ch, "20.0", "%", "기준안 EBITDA율", "감가상각 후 18.1%");
  statCard(s, MX + (cw + 0.3) * 3, cy, cw, ch, "1.87", "억", "손익분기 월매출", "목표 대비 62% 수준");
  note(s, "본 자료의 매출·손익은 좌석수와 객단가 가정에 기반한 추정치이며, 확정 실적이 아니다.", false, 5.3);
  footer(s, false);
}

/* ============ S3 · 02 입지 ============ */
{
  const s = pres.addSlide();
  s.background = { color: "FFFFFF" };
  eyebrow(s, "02", "입지", false);
  title(s, "포스코센터 인근 대로변, 강남권 최대 밀도의 법인 회식 상권", false);
  const colW = 6.6, ph = 4.35;
  // photo right
  s.addImage({ path: A + "terrace.jpg", x: 7.72, y: 1.78, w: 4.9, h: 3.68, rounding: false });
  s.addText("1층 테라스 다이닝. 대로변에 면한 통유리 구조", {
    x: 7.72, y: 5.54, w: 4.9, h: 0.28, fontFace: F, fontSize: 9, color: MUTE, margin: 0,
  });
  const cw2 = (colW - 0.26) / 2, chh = 1.62;
  const cards = [
    ["배후 수요", "포스코센터 · 무역센터 · 코엑스 오피스 밀집. 평일 저녁 법인 회식과 접대 수요가 상시 발생하는 구간이다."],
    ["가시성", "대로변 전면 노출. 통유리 파사드와 야간 사인으로 별도 광고 없이 인지가 형성된다."],
    ["경쟁 구도", "삼성동 회식 상권은 한우 · 중식이 주도한다. 오리구이 단일 카테고리는 대체재가 얇다."],
    ["접근성", "차량 진입 동선과 전용 주차 확보. 접대 목적 방문의 이탈 요인을 제거한다."],
  ];
  cards.forEach((c, i) => {
    const x = MX + (i % 2) * (cw2 + 0.26), y = 1.78 + Math.floor(i / 2) * (chh + 0.24);
    infoCard(s, x, y, cw2, chh, c[0], c[1], { bodySize: 10 });
  });
  card(s, MX, 5.62, colW, 0.62, { tint: true, noShadow: true });
  s.addText([
    { text: "임대 조건", options: { fontFace: FSB, fontSize: 10.5, color: GOLD_DEEP } },
    { text: "   월 임대료 2,500만원 / 보증금 3억 / B1~3F 4개 층 통임대", options: { fontFace: F, fontSize: 10.5, color: INK_SOFT } },
  ], { x: MX + 0.24, y: 5.62, w: colW - 0.4, h: 0.62, margin: 0, valign: "middle" });
  footer(s, false);
}

/* ============ S4 · 03 공간 구성 (dark + 3D iso) ============ */
{
  const s = pres.addSlide();
  s.background = { color: DARK_BG };
  eyebrow(s, "03", "공간 구성", true);
  title(s, "지하를 주방으로 내리고, 3개 층 120평을 전부 영업면적으로 쓴다", true);
  // right: isometric diagram
  s.addImage({ path: A + "iso_floors.png", x: 8.48, y: 1.62, w: 4.35, h: 5.30 });
  // left: floor rows
  const rows = [
    ["3F · 40평", "VIP 룸 8~10실", "접대 · 법인 예약 전담. 단가와 예약 안정성을 담당하는 층", "60석"],
    ["2F · 40평", "메인 홀 · 바 / 셀러", "메인 홀에 셀러 · 바를 붙여 주류 매출과 객단가를 끌어올린다", "60석"],
    ["1F · 40평", "테라스 다이닝 · 화로", "시그니처 화로 전면 배치. 유입과 브랜드 인지를 담당", "60석"],
    ["B1 · 16평", "중앙 주방 · 저장", "전 층 조리 집중. 더미웨이터로 1~3F 서빙 연결", ""],
  ];
  const rw = 7.35, rh = 1.06, gap = 0.16;
  rows.forEach((r, i) => {
    const y = 1.70 + i * (rh + gap);
    card(s, MX, y, rw, rh, { dark: true, noShadow: true });
    s.addText(r[0], { x: MX + 0.24, y: y + 0.14, w: 1.42, h: 0.3, fontFace: FXB, fontSize: 12.5, color: GOLD_LIGHT, margin: 0 });
    s.addText(r[1], { x: MX + 0.24, y: y + 0.5, w: 3.3, h: 0.42, fontFace: FSB, fontSize: 12.5, color: CREAM_TXT, margin: 0 });
    s.addText(r[2], { x: MX + 3.06, y: y + 0.14, w: rw - 3.36 - 0.72, h: rh - 0.26, fontFace: F, fontSize: 9.5, color: CREAM_SUB, margin: 0, lineSpacingMultiple: 1.28, valign: "middle" });
    if (r[3]) s.addText(r[3], { x: MX + rw - 0.86, y: y + 0.14, w: 0.66, h: rh - 0.28, fontFace: FSB, fontSize: 11, color: GOLD, align: "right", margin: 0, valign: "middle" });
  });
  note(s, "전용면적 합계 136평 · 영업 좌석 180석(가정) · 주방을 지하로 분리해 지상 3개 층의 좌석 손실을 없앤다", true, 6.62, 7.4);
  footer(s, true);
}

/* ============ S5 · 더미웨이터 리스크 ============ */
{
  const s = pres.addSlide();
  s.background = { color: "FFFFFF" };
  eyebrow(s, "03-1", "운영 구조", false);
  title(s, "이 구조의 성패는 더미웨이터 처리량이 결정한다", false);
  const cw2 = (CW - 0.3) / 2, chh = 1.66;
  const items = [
    ["중앙 주방 단일화", "지하 16평에 조리를 집중해 층별 주방 중복 투자를 제거한다. 인건비와 설비비가 동시에 줄어든다."],
    ["더미웨이터 2기 권장", "1기 운용 시 피크 타임 3개 층 동시 서빙에서 병목이 발생한다. 설계 단계에서 2기 또는 대용량 1기로 확정해야 한다."],
    ["층별 서비스 스테이션", "각 층에 반찬 · 주류 · 집기 스테이션을 두어 더미웨이터 호출 횟수를 본요리 중심으로 줄인다."],
    ["3층 예약 전용 운영", "룸은 예약제로만 열어 상시 인력 배치를 없애고, 예약분에 맞춰 인력을 투입한다."],
  ];
  items.forEach((c, i) => {
    const x = MX + (i % 2) * (cw2 + 0.3), y = 1.98 + Math.floor(i / 2) * (chh + 0.3);
    infoCard(s, x, y, cw2, chh, c[0], c[1], { headSize: 14, bodySize: 11.5 });
  });
  footer(s, false);
}

/* ============ S6 · 04 시그니처 화로 (photo break) ============ */
{
  const s = pres.addSlide();
  s.background = { color: DARK_BG };
  eyebrow(s, "04", "시그니처 화로", true);
  title(s, "1층 화로 시안 — 시그니처 로스터 · 제작 완료", true);
  const iw = 3.55, ih = 5.0, iy = 1.85;
  s.addImage({ path: A + "roaster_close.jpg", x: 2.62, y: iy, w: iw, h: ih });
  s.addImage({ path: A + "roaster_kiosk.jpg", x: 2.62 + iw + 0.5, y: iy, w: 3.1, h: ih });
  s.addText("장작 화덕과 브랜드 오브제를 결합한 시그니처 로스터. 1층 전면에 배치해 유입과 브랜드 인지를 만든다.", {
    x: 10.1, y: iy + 0.1, w: 2.5, h: 3.4, fontFace: F, fontSize: 11, color: CREAM_SUB,
    margin: 0, lineSpacingMultiple: 1.45, valign: "top",
  });
  footer(s, true);
}

/* ============ S7 · 05 메뉴 구성 ============ */
{
  const s = pres.addSlide();
  s.background = { color: "FFFFFF" };
  eyebrow(s, "05", "메뉴 구성", false);
  title(s, "객단가 5만원대는 메뉴 가격표에서 그대로 나온다", false);
  const cw2 = (CW - 0.3) / 2, chh = 1.44;
  const menu = [
    ["시그니처 화덕 오리구이 · 79,000~135,000원", "장작 · 참숯 · 불향 · 마라 4종과 예약제 능이 진흙 오리구이. 2인 이상 공유 메뉴로 테이블 단가의 중심을 잡는다"],
    ["화덕 통닭구이 · 38,000~45,000원", "오리와 병행 주문되는 서브 메인. 4인 이상 테이블에서 추가 주문이 발생한다"],
    ["전골 · 사이드 · 전통주 · 10,000~80,000원", "능이 오리전골 69,000원, 전통주 페어링. 접대 · 룸 수요의 단가를 결정한다"],
    ["점심 단품 · 16,000원", "오리곰탕 · 닭곰탕. 데이타임 회전을 확보하기 위한 별도 라인"],
  ];
  menu.forEach((c, i) => {
    const x = MX + (i % 2) * (cw2 + 0.3), y = 1.72 + Math.floor(i / 2) * (chh + 0.22);
    infoCard(s, x, y, cw2, chh, c[0], c[1], { headSize: 12, bodySize: 10 });
  });
  // spend band
  const sy = 5.1, sw2 = (CW - 0.9) / 4, sh = 1.42;
  const spend = [
    ["50,500원", "2인 표준", "오리구이 + 사이드 + 소주 2병"],
    ["59,000원", "4인 회식", "오리구이 + 통닭구이 + 전골 + 주류"],
    ["74,000원", "4인 룸 접대", "능이 진흙 오리구이 + 전골 + 전통주"],
    ["16,000원", "점심 1인", "오리곰탕 · 닭곰탕 단품"],
  ];
  spend.forEach((c, i) => {
    const x = MX + i * (sw2 + 0.3);
    card(s, x, sy, sw2, sh, { tint: true, noShadow: true });
    s.addText(c[0], { x: x + 0.22, y: sy + 0.14, w: sw2 - 0.44, h: 0.36, fontFace: FXB, fontSize: 16, color: GOLD_DEEP, margin: 0 });
    s.addText(c[1], { x: x + 0.22, y: sy + 0.52, w: sw2 - 0.44, h: 0.28, fontFace: FSB, fontSize: 11, color: INK, margin: 0 });
    s.addText(c[2], { x: x + 0.22, y: sy + 0.82, w: sw2 - 0.44, h: 0.52, fontFace: F, fontSize: 9, color: MUTE, margin: 0, lineSpacingMultiple: 1.2 });
  });
  note(s, "메뉴 구성안. 가격은 확정 전 시안 기준", false, 6.68);
  footer(s, false);
}

/* ============ S8 · 06 투자 구조 — 자금 소요 ============ */
{
  const s = pres.addSlide();
  s.background = { color: "FFFFFF" };
  eyebrow(s, "06", "투자 구조", false);
  title(s, "총 자금 소요 7.5억, 운영 가치 포함 기업가치 10억", false);
  // left: table rows
  const rows = [
    ["보증금", "3.0억", "임대 종료 시 회수 가능 자산"],
    ["인테리어", "3.0억", "4개 층 시공, 지하 급배기 · 소방 포함"],
    ["기물 및 집기", "0.5억", "시그니처 로스터(제작 완료), 주방 설비, 더미웨이터, 홀 집기"],
    ["예비비", "1.0억", "공기 지연 및 초기 운전자금"],
  ];
  const tw = 7.15, rh = 0.88, ty = 1.78;
  rows.forEach((r, i) => {
    const y = ty + i * (rh + 0.14);
    card(s, MX, y, tw, rh, { noShadow: true });
    s.addText(r[0], { x: MX + 0.24, y: y + 0.12, w: 1.7, h: 0.3, fontFace: FSB, fontSize: 12, color: INK, margin: 0 });
    s.addText(r[2], { x: MX + 0.24, y: y + 0.44, w: tw - 1.7, h: 0.34, fontFace: F, fontSize: 9.5, color: MUTE, margin: 0 });
    s.addText(r[1], { x: MX + tw - 1.45, y: y + 0.12, w: 1.2, h: 0.34, fontFace: FXB, fontSize: 16, color: GOLD_DEEP, align: "right", margin: 0 });
  });
  const sumY = ty + 4 * (rh + 0.14) + 0.04;
  s.addShape("roundRect", { x: MX, y: sumY, w: tw, h: 0.66, rectRadius: 0.07, fill: { color: INK }, line: { color: INK, width: 0 } });
  s.addText("현금 소요 합계", { x: MX + 0.24, y: sumY, w: 2.6, h: 0.66, fontFace: FSB, fontSize: 12.5, color: "FFFFFF", margin: 0, valign: "middle" });
  s.addText("7.5억", { x: MX + tw - 1.65, y: sumY, w: 1.4, h: 0.66, fontFace: FXB, fontSize: 18, color: GOLD_LIGHT, align: "right", margin: 0, valign: "middle" });
  // right: 운영 가치 block
  const rx = MX + tw + 0.42, rw2 = CW - tw - 0.42;
  card(s, rx, ty, rw2, 2.6, { tint: true });
  s.addText("운영 가치 2.5억", { x: rx + 0.26, y: ty + 0.22, w: rw2 - 0.5, h: 0.4, fontFace: FXB, fontSize: 17, color: GOLD_DEEP, margin: 0 });
  s.addText("브랜드, 상권 확보, 인허가와 시공 관리, 다점포 운영 조직. 현금 소요 7.5억에 더해 기업가치 10억을 구성한다.", {
    x: rx + 0.26, y: ty + 0.72, w: rw2 - 0.52, h: 1.7, fontFace: F, fontSize: 11, color: INK_SOFT, margin: 0, lineSpacingMultiple: 1.4,
  });
  // right-bottom: equation
  card(s, rx, ty + 2.84, rw2, 1.9, { noShadow: true });
  s.addText([
    { text: "현금 소요 7.5억\n", options: { fontFace: FSB, fontSize: 12.5, color: INK } },
    { text: "+ 운영 가치 2.5억\n", options: { fontFace: FSB, fontSize: 12.5, color: INK } },
    { text: "= 기업가치 10억 (Post-money)", options: { fontFace: FXB, fontSize: 13.5, color: GOLD_DEEP } },
  ], { x: rx + 0.26, y: ty + 3.0, w: rw2 - 0.5, h: 1.6, margin: 0, lineSpacingMultiple: 1.55, valign: "top" });
  footer(s, false);
}

/* ============ S9 · 지분 구조 ============ */
{
  const s = pres.addSlide();
  s.background = { color: "FFFFFF" };
  eyebrow(s, "06-1", "지분 구조", false);
  title(s, "기업가치 10억 기준, 1억 참여 시 지분 10%", false);
  const cw2 = (CW - 0.3) / 2;
  // two stat cards
  const inv = [
    ["투자금 1억", "지분율 10%", "기준안 연 귀속이익(세후) 5,130만원"],
    ["투자금 2억", "지분율 20%", "기준안 연 귀속이익(세후) 1억 260만원"],
  ];
  inv.forEach((c, i) => {
    const x = MX + i * (cw2 + 0.3), y = 1.72, h2 = 1.5;
    card(s, x, y, cw2, h2, { tint: true });
    s.addText(c[0], { x: x + 0.26, y: y + 0.18, w: 2.6, h: 0.36, fontFace: FSB, fontSize: 13, color: INK, margin: 0 });
    s.addText(c[1], { x: x + 0.26, y: y + 0.58, w: 3.2, h: 0.52, fontFace: FXB, fontSize: 24, color: GOLD_DEEP, margin: 0 });
    s.addText(c[2], { x: x + cw2 * 0.47, y: y + 0.18, w: cw2 * 0.5, h: h2 - 0.36, fontFace: F, fontSize: 10.5, color: INK_SOFT, margin: 0, valign: "middle", align: "right", lineSpacingMultiple: 1.3 });
  });
  const items = [
    ["투자 형태", "신설 운영법인 지분 인수 (Post-money 10억 기준)"],
    ["운영 주체", "(주)에스비제이컴퍼니가 운영 · 회계를 총괄, 투자자는 경영 비참여"],
    ["정산", "분기 손익 보고, 연 1회 배당 결의. 배당성향은 주주 협의로 결정"],
    ["안전장치", "투자금은 임대차 계약 체결 후 집행. 미계약 시 전액 반환"],
  ];
  items.forEach((c, i) => {
    const x = MX + (i % 2) * (cw2 + 0.3), y = 3.5 + Math.floor(i / 2) * (1.32 + 0.24);
    infoCard(s, x, y, cw2, 1.32, c[0], c[1], { headSize: 12.5, bodySize: 10.5 });
  });
  note(s, "귀속이익은 기준안 영업이익에서 법인세 실효세율 21%를 차감한 값이며, 실제 배당액은 유보 정책에 따라 달라진다.", false, 6.6);
  footer(s, false);
}

/* ============ S10 · 매출 계획 ============ */
{
  const s = pres.addSlide();
  s.background = { color: "FFFFFF" };
  eyebrow(s, "07", "매출 계획", false);
  title(s, "저녁 1.05회전에 점심 0.35회전을 더하면 월 3억이다", false);
  // top table: 저녁/점심
  const cols = ["구분", "좌석수", "일 회전율", "객단가", "월 영업일", "월 매출"];
  const t1 = [
    ["저녁", "180석", "1.05회전", "55,000원", "26일", "2.70억"],
    ["점심", "180석", "0.35회전", "18,000원", "26일", "0.29억"],
  ];
  const ty = 1.72, tw = CW, colWs = [1.5, 1.9, 2.0, 2.1, 1.9, 2.49];
  let cx = MX;
  const rowH = 0.46;
  // header
  cols.forEach((c, i) => {
    s.addText(c, { x: cx, y: ty, w: colWs[i], h: rowH, fontFace: FSB, fontSize: 10.5, color: MUTE, margin: 0.04, valign: "middle", align: i === 0 ? "left" : "right" });
    cx += colWs[i];
  });
  s.addShape("line", { x: MX, y: ty + rowH + 0.02, w: tw, h: 0, line: { color: INK, width: 1 } });
  t1.forEach((r, ri) => {
    let x = MX;
    const y = ty + rowH + 0.06 + ri * (rowH + 0.04);
    r.forEach((c, i) => {
      s.addText(c, { x, y, w: colWs[i], h: rowH, fontFace: i === 0 ? FSB : F, fontSize: 11, color: INK, margin: 0.04, valign: "middle", align: i === 0 ? "left" : "right" });
      x += colWs[i];
    });
    s.addShape("line", { x: MX, y: y + rowH + 0.02, w: tw, h: 0, line: { color: LINE, width: 0.75 } });
  });
  const sumY2 = ty + rowH + 0.06 + 2 * (rowH + 0.04);
  s.addText("기준안 월 매출", { x: MX, y: sumY2, w: 4, h: rowH, fontFace: FSB, fontSize: 11.5, color: GOLD_DEEP, margin: 0.04, valign: "middle" });
  s.addText("2.99억", { x: MX + tw - 2.49, y: sumY2, w: 2.49, h: rowH, fontFace: FXB, fontSize: 13, color: GOLD_DEEP, margin: 0.04, valign: "middle", align: "right" });
  // scenario cards
  const sy = 4.2, sw2 = (CW - 0.6) / 3, sh = 1.86;
  const scen = [
    ["안정안", "저녁 0.79 · 점심 0.26회전", "월 2.25억 · 일 866만원", "저녁 단일 피크만 가능한 경우", false],
    ["기준안", "저녁 1.05 · 점심 0.35회전", "월 3.00억 · 일 1,153만원", "점심 라인 정착 + 저녁 1회전 이상", true],
    ["확장안", "저녁 1.40 · 점심 0.47회전", "월 4.00억 · 일 1,539만원", "저녁 2부제 + 3층 룸 예약 상시 가능", false],
  ];
  scen.forEach((c, i) => {
    const x = MX + i * (sw2 + 0.3);
    card(s, x, sy, sw2, sh, { tint: c[4], noShadow: !c[4] });
    s.addText(c[0], { x: x + 0.24, y: sy + 0.16, w: sw2 - 0.48, h: 0.32, fontFace: FXB, fontSize: 14, color: c[4] ? GOLD_DEEP : INK, margin: 0 });
    s.addText(c[1], { x: x + 0.24, y: sy + 0.54, w: sw2 - 0.48, h: 0.28, fontFace: FMD, fontSize: 10.5, color: INK_SOFT, margin: 0 });
    s.addText(c[2], { x: x + 0.24, y: sy + 0.86, w: sw2 - 0.48, h: 0.3, fontFace: FSB, fontSize: 12, color: c[4] ? GOLD_DEEP : INK, margin: 0 });
    s.addText(c[3], { x: x + 0.24, y: sy + 1.22, w: sw2 - 0.48, h: 0.56, fontFace: F, fontSize: 9.5, color: MUTE, margin: 0, lineSpacingMultiple: 1.25 });
  });
  note(s, "객단가는 메뉴 가격표에서 산출했다. 저녁 55,000원은 2인 표준 50,500원과 4인 회식 59,000원 사이 값이며, 룸 접대 74,000원은 반영하지 않았다.", false, 6.5);
  footer(s, false);
}

/* ============ S11 · 손익 구조 (2D bar chart) ============ */
{
  const s = pres.addSlide();
  s.background = { color: "FFFFFF" };
  eyebrow(s, "08", "손익 구조", false);
  title(s, "기준안 월 3억에서 EBITDA 6,000만원, 20.0%", false);
  const cats = ["식자재비 35.0%", "인건비(4대보험 포함) 25.3%", "임대료+관리비 9.7%", "공과금 3.0%", "마케팅 3.0%", "카드수수료 2.0%", "소모품·기타 2.0%"];
  const vals = [10500, 7600, 2900, 900, 900, 600, 600];
  s.addChart("bar", [{ name: "월 비용 (만원)", labels: cats, values: vals }], {
    x: MX, y: 1.7, w: 7.3, h: 4.6,
    barDir: "bar",
    chartColors: [GOLD],
    showLegend: false, showTitle: false,
    showValue: true, dataLabelPosition: "outEnd",
    dataLabelColor: INK_SOFT, dataLabelFontFace: F, dataLabelFontSize: 9,
    dataLabelFormatCode: "#,##0",
    catAxisLabelColor: INK_SOFT, catAxisLabelFontFace: F, catAxisLabelFontSize: 10,
    valAxisHidden: true, valGridLine: { style: "none" }, catGridLine: { style: "none" },
    valAxisLabelColor: "FFFFFF", valAxisLineShow: false, catAxisLineShow: false,
    valAxisMaxVal: 12000,
    barGapWidthPct: 60,
  });
  s.addText("매출 30,000만원 = 100% 기준", { x: MX, y: 6.32, w: 5, h: 0.28, fontFace: F, fontSize: 9, color: MUTE, margin: 0 });
  // right: EBITDA / 영업이익 callouts
  const rx = 8.5, rw2 = W - MX - rx;
  statCard(s, rx, 1.7, rw2, 2.14, "6,000", "만원", "EBITDA", "매출 대비 20.0% · 월 영업일 26일 기준", { bigSize: 30 });
  statCard(s, rx, 4.06, rw2, 2.14, "5,417", "만원", "영업이익", "매출 대비 18.1% · 감가상각 583만원 차감", { bigSize: 30 });
  note(s, "감가상각은 인테리어 · 기물 3.5억을 5년 정액으로 배분했다. 목표 이익률 20%는 EBITDA 기준에서 성립하며, 감가상각 반영 시 18.1%다.", false, 6.62);
  footer(s, false);
}

/* ============ S12 · 손익분기 ============ */
{
  const s = pres.addSlide();
  s.background = { color: "FFFFFF" };
  eyebrow(s, "09", "손익분기", false);
  title(s, "하루 0.87회전이면 손실이 나지 않는다", false);
  const cw3 = (CW - 0.6) / 3, ch3 = 2.0, cy3 = 1.78;
  statCard(s, MX, cy3, cw3, ch3, "1.87", "억", "손익분기 월매출", "목표 매출의 62% 수준");
  statCard(s, MX + cw3 + 0.3, cy3, cw3, ch3, "720", "만원", "손익분기 일매출", "월 26일 영업 기준");
  statCard(s, MX + (cw3 + 0.3) * 2, cy3, cw3, ch3, "0.87", "회전", "손익분기 좌석회전", "180석 · 평균 객단가 45,750원 기준");
  // 고정비 구조
  const fy = 4.14;
  card(s, MX, fy, CW, 1.72, { tint: true });
  s.addText("고정비 구조", { x: MX + 0.26, y: fy + 0.2, w: 3, h: 0.32, fontFace: FSB, fontSize: 13, color: GOLD_DEEP, margin: 0 });
  s.addText("임대료 · 관리비 2,900만원  ·  정직원 인건비 5,500만원  ·  감가상각 583만원", {
    x: MX + 0.26, y: fy + 0.58, w: CW - 0.52, h: 0.32, fontFace: F, fontSize: 11.5, color: INK_SOFT, margin: 0,
  });
  s.addText([
    { text: "월 고정비 합계 8,983만원", options: { fontFace: FXB, fontSize: 14, color: INK } },
    { text: "  ·  공헌이익률 48%", options: { fontFace: FSB, fontSize: 14, color: GOLD_DEEP } },
  ], { x: MX + 0.26, y: fy + 0.98, w: CW - 0.52, h: 0.42, margin: 0 });
  s.addText("고정비가 목표 매출의 30.0%로, F&B 위험 구간인 35%를 밑돈다.\n임대료 2,500만원은 136평 4개 층 기준으로 평당 18만원 수준이다.", {
    x: MX, y: 6.1, w: CW, h: 0.62, fontFace: F, fontSize: 9.5, color: MUTE, margin: 0, lineSpacingMultiple: 1.35,
  });
  footer(s, false);
}

/* ============ S13 · 시나리오 (2D column chart) ============ */
{
  const s = pres.addSlide();
  s.background = { color: "FFFFFF" };
  eyebrow(s, "10", "시나리오", false);
  title(s, "매출이 기준안 대비 25% 빠져도 영업이익은 흑자를 유지한다", false);
  s.addChart("bar", [{ name: "월 영업이익 (만원)", labels: ["안정안 · 월 2.25억", "기준안 · 월 3.00억", "확장안 · 월 4.00억"], values: [1817, 5417, 10217] }], {
    x: MX, y: 1.78, w: 6.9, h: 4.3,
    barDir: "col",
    chartColors: ["B8AE94", GOLD, GOLD_LIGHT],
    chartColorsOpacity: 100,
    showLegend: false, showTitle: false,
    showValue: true, dataLabelPosition: "outEnd",
    dataLabelColor: INK, dataLabelFontFace: FSB, dataLabelFontSize: 11,
    dataLabelFormatCode: "#,##0",
    catAxisLabelColor: INK_SOFT, catAxisLabelFontFace: F, catAxisLabelFontSize: 10.5,
    valAxisHidden: true, valGridLine: { style: "none" }, catGridLine: { style: "none" },
    valAxisMaxVal: 11000,
    barGapWidthPct: 55,
    varyColors: true,
  });
  // right table
  const rows = [
    ["안정안", "2.25억", "1,817만원", "8.1%"],
    ["기준안", "3.00억", "5,417만원", "18.1%"],
    ["확장안", "4.00억", "10,217만원", "25.5%"],
  ];
  const rx = 8.1, rw3 = W - MX - rx, ry = 1.9;
  s.addText("구분", { x: rx, y: ry, w: 1.1, h: 0.32, fontFace: FSB, fontSize: 10, color: MUTE, margin: 0 });
  s.addText("월 매출", { x: rx + 1.1, y: ry, w: 1.2, h: 0.32, fontFace: FSB, fontSize: 10, color: MUTE, margin: 0, align: "right" });
  s.addText("월 영업이익", { x: rx + 2.3, y: ry, w: 1.5, h: 0.32, fontFace: FSB, fontSize: 10, color: MUTE, margin: 0, align: "right" });
  s.addText("이익률", { x: rx + 3.8, y: ry, w: rw3 - 3.8, h: 0.32, fontFace: FSB, fontSize: 10, color: MUTE, margin: 0, align: "right" });
  s.addShape("line", { x: rx, y: ry + 0.36, w: rw3, h: 0, line: { color: INK, width: 1 } });
  rows.forEach((r, i) => {
    const y = ry + 0.46 + i * 0.56;
    s.addText(r[0], { x: rx, y, w: 1.1, h: 0.42, fontFace: FSB, fontSize: 10.5, color: INK, margin: 0, valign: "middle" });
    s.addText(r[1], { x: rx + 1.1, y, w: 1.2, h: 0.42, fontFace: F, fontSize: 10.5, color: INK_SOFT, margin: 0, valign: "middle", align: "right" });
    s.addText(r[2], { x: rx + 2.3, y, w: 1.5, h: 0.42, fontFace: F, fontSize: 10.5, color: INK_SOFT, margin: 0, valign: "middle", align: "right" });
    s.addText(r[3], { x: rx + 3.8, y, w: rw3 - 3.8, h: 0.42, fontFace: FXB, fontSize: 11, color: GOLD_DEEP, margin: 0, valign: "middle", align: "right" });
    s.addShape("line", { x: rx, y: y + 0.5, w: rw3, h: 0, line: { color: LINE, width: 0.75 } });
  });
  s.addText("안정안은 기준안 대비 매출 25% 하회, 확장안은 33% 상회를 가정했다. 세 시나리오 모두 고정비 구조는 동일하다.", {
    x: rx, y: ry + 2.4, w: rw3, h: 0.9, fontFace: F, fontSize: 9.5, color: MUTE, margin: 0, lineSpacingMultiple: 1.35,
  });
  note(s, "고정비가 낮은 임대 조건 덕분에 하방이 막혀 있다. 점심 매출이 정착되면 기준안, 3층 룸 예약이 상시 가동되면 확장안 구간으로 올라선다.", false, 6.5);
  footer(s, false);
}

/* ============ S14 · 확장 로드맵 ============ */
{
  const s = pres.addSlide();
  s.background = { color: "FFFFFF" };
  eyebrow(s, "11", "확장 로드맵", false);
  title(s, "3개월 간격 연속 출점으로 프랜차이즈 본부까지 간다", false);
  const cw3 = (CW - 0.6) / 3, cy3 = 1.86, ch3 = 3.7;
  const phases = [
    ["1", "PHASE 1 · 1호점 검증", "2026.10 ~ 2026.12", ["BEP 조기 도달 후 월 3억 매출 안정화", "표준 레시피, 원가율, 운영 매뉴얼 확정", "지하 주방 · 3개 층 구조의 표준 모델화"]],
    ["2", "PHASE 2 · 직영 2·3호점", "2027.01 ~ 2027.04", ["1호점 BEP 확인 후 3개월 간격으로 연속 출점", "후보 상권: 압구정 · 신사 · 신용산 · 한남동", "중앙 공급 체계 구축, 원가율 추가 절감"]],
    ["3", "PHASE 3 · 프랜차이즈 본부", "2027 하반기 ~", ["정보공개서 등록 후 가맹 전개", "수익 구조 전환: 매장 영업이익 → 가맹비 · 로열티 · 식자재 공급마진", "출점 1건당 본부 이익이 누적되는 구조"]],
  ];
  phases.forEach((p, i) => {
    const x = MX + i * (cw3 + 0.3);
    card(s, x, cy3, cw3, ch3, { tint: i === 2 });
    s.addText(p[0], { x: x + 0.24, y: cy3 + 0.2, w: 0.62, h: 0.5, fontFace: FXB, fontSize: 26, color: GOLD, margin: 0 });
    s.addText(p[1], { x: x + 0.24, y: cy3 + 0.78, w: cw3 - 0.48, h: 0.34, fontFace: FSB, fontSize: 13, color: INK, margin: 0 });
    s.addText(p[2], { x: x + 0.24, y: cy3 + 1.12, w: cw3 - 0.48, h: 0.3, fontFace: FMD, fontSize: 10.5, color: GOLD_DEEP, margin: 0 });
    s.addText(p[3].map((t, j) => ({ text: t, options: { bullet: { code: "2022", indent: 10 }, breakLine: j < p[3].length - 1 } })), {
      x: x + 0.24, y: cy3 + 1.56, w: cw3 - 0.44, h: ch3 - 1.76, fontFace: F, fontSize: 10, color: INK_SOFT,
      margin: 0, paraSpaceAfter: 6, lineSpacingMultiple: 1.25, valign: "top",
    });
  });
  s.addText("1호점 손익만으로 판단하는 건이 아니다. 확장 단계에서 수익원이 매장 영업이익에서 본부 공급마진으로 옮겨가며, 출점 수에 비례해 이익 레버리지가 커진다.", {
    x: MX, y: 5.86, w: CW, h: 0.34, fontFace: F, fontSize: 10, color: INK_SOFT, margin: 0,
  });
  note(s, "가맹 전개는 가맹사업법상 정보공개서 등록을 선행 요건으로 한다. Phase 3 착수 시점에 등록 절차를 진행한다.", false, 6.3);
  footer(s, false);
}

/* ============ S15 · 본부 지분 옵션 ============ */
{
  const s = pres.addSlide();
  s.background = { color: "FFFFFF" };
  eyebrow(s, "12", "본부 지분 옵션", false);
  title(s, "1호점 투자자에게 본부 법인 지분 취득 우선권을 부여한다", false);
  const cw2 = (CW - 0.3) / 2, chh = 1.42;
  const items = [
    ["옵션 내용", "프랜차이즈 본부 법인 설립 시, 1호점 초기 투자자에게 신주 인수 우선권을 부여한다."],
    ["행사 요건", "1호점 3개월 연속 흑자로 BEP 안정 도달이 확인된 시점, 또는 2호점 출점 결의 시점 중 먼저 도래하는 때."],
    ["행사 한도", "1호점 지분율에 비례한 범위. 지분 10% 보유 시 본부 법인 지분 [   ]%까지 인수 가능."],
    ["행사 가격", "본부 법인 설립 당시 발행가 기준 [   ]. 후속 라운드 밸류와 무관하게 고정한다."],
    ["1호점 지분", "본부 지분 인수 후에도 1호점 지분은 유지한다. 스왑 방식은 적용하지 않는다."],
    ["이 옵션의 의미", "1호점 투자는 단일 매장에 대한 투자로 끝나지 않는다. 검증이 완료되면 확장 주체인 본부 법인에 초기 조건으로 참여할 수 있는 권리가 함께 따라온다."],
  ];
  items.forEach((c, i) => {
    const x = MX + (i % 2) * (cw2 + 0.3), y = 1.68 + Math.floor(i / 2) * (chh + 0.16);
    infoCard(s, x, y, cw2, chh, c[0], c[1], { headSize: 12.5, bodySize: 10 });
  });
  s.addText("본부 법인은 프랜차이즈 사업을 위해 별도 설립하는 신설 법인이다. SBJ컴퍼니의 기존 운영 사업 지분과는 무관하다.  ·  [   ] 표기 항목은 본부 법인 설립 시점에 확정한다. 옵션의 구체 조건은 투자계약서 부속 합의로 정한다.", {
    x: MX, y: 6.5, w: CW, h: 0.5, fontFace: F, fontSize: 9, color: MUTE, margin: 0, lineSpacingMultiple: 1.3,
  });
  footer(s, false);
}

/* ============ S16 · 리스크 관리 ============ */
{
  const s = pres.addSlide();
  s.background = { color: "FFFFFF" };
  eyebrow(s, "13", "리스크 관리", false);
  title(s, "성과를 좌우하는 네 가지 변수는 이미 관리 계획에 들어가 있다", false);
  const rows = [
    ["서빙 동선 설계", "지하 주방에서 3개 층을 서빙하는 구조다. 더미웨이터 처리량이 피크 타임 좌석 가동률을 결정한다.", "설계 단계에서 2기 또는 대용량 1기로 확정. 층별 서비스 스테이션을 두어 호출 빈도를 본요리 중심으로 축소."],
    ["원가 관리", "오리 원육은 시세 변동 폭이 있는 품목이다. 식자재율이 원가 구조의 핵심 변수다.", "산지 연간 물량 계약으로 단가를 고정. 사이드 메뉴 비중을 높여 원가 구성을 분산."],
    ["오픈 일정 관리", "지하 조리시설은 급배기 · 소방 · 정화 인허가 절차가 수반된다.", "예비비 1억을 별도 편성. 임대차 계약과 동시에 인허가를 선행 접수하고 착공 전 도면을 확정."],
    ["점심 수요 확보", "기준안 회전율은 점심 운영을 포함한 값이다. 데이타임 매출이 기준안 도달의 관건이다.", "오리 단품 점심 메뉴를 별도 구성. 인근 오피스 대상 예약 · 선결제 채널을 오픈 전 확보."],
  ];
  // header row
  const ty = 1.72, hL = 2.1, hM = 5.1, hR = CW - hL - hM;
  s.addText("관리 변수", { x: MX, y: ty, w: hL, h: 0.3, fontFace: FSB, fontSize: 10.5, color: MUTE, margin: 0 });
  s.addText("배경", { x: MX + hL, y: ty, w: hM, h: 0.3, fontFace: FSB, fontSize: 10.5, color: MUTE, margin: 0 });
  s.addText("관리 방안", { x: MX + hL + hM, y: ty, w: hR, h: 0.3, fontFace: FSB, fontSize: 10.5, color: MUTE, margin: 0 });
  s.addShape("line", { x: MX, y: ty + 0.34, w: CW, h: 0, line: { color: INK, width: 1 } });
  rows.forEach((r, i) => {
    const y = ty + 0.48 + i * 1.12;
    s.addText(r[0], { x: MX, y, w: hL - 0.2, h: 0.96, fontFace: FSB, fontSize: 12, color: GOLD_DEEP, margin: 0, valign: "top" });
    s.addText(r[1], { x: MX + hL, y, w: hM - 0.35, h: 0.96, fontFace: F, fontSize: 10, color: INK_SOFT, margin: 0, lineSpacingMultiple: 1.3, valign: "top" });
    s.addText(r[2], { x: MX + hL + hM, y, w: hR, h: 0.96, fontFace: F, fontSize: 10, color: INK, margin: 0, lineSpacingMultiple: 1.3, valign: "top" });
    if (i < 3) s.addShape("line", { x: MX, y: y + 1.0, w: CW, h: 0, line: { color: LINE, width: 0.75 } });
  });
  footer(s, false);
}

/* ============ S17 · 일정 ============ */
{
  const s = pres.addSlide();
  s.background = { color: "FFFFFF" };
  eyebrow(s, "14", "일정", false);
  title(s, "9월 계약, 10월 말 오픈. 연말 성수기 전 정상 가동", false);
  const steps = [
    ["9월 1주", "임대차 계약", "보증금 3억 집행. 투자금 납입 개시"],
    ["9월 2~3주", "설계 확정 · 인허가", "지하 급배기 · 소방 도면 확정, 영업신고 접수"],
    ["9월 중순~", "착공", "4개 층 동시 시공. 더미웨이터 설치 선행"],
    ["10월 1~3주", "설비 · 집기 반입", "로스터 · 주방 설비 반입, 홀 집기. 인력 채용 · 교육"],
    ["10월 말", "오픈", "시운전 후 정식 오픈. 11~12월 연말 회식 수요 흡수"],
  ];
  // horizontal timeline
  const ty2 = 2.6, dotY = ty2, n = steps.length;
  const span = CW - 0.8, step = span / (n - 1), x0 = MX + 0.4;
  s.addShape("line", { x: x0, y: dotY, w: span, h: 0, line: { color: LINE, width: 2 } });
  steps.forEach((st, i) => {
    const cx = x0 + i * step;
    const last = i === n - 1;
    s.addShape("ellipse", {
      x: cx - 0.09, y: dotY - 0.09, w: 0.18, h: 0.18,
      fill: { color: last ? GOLD : "FFFFFF" }, line: { color: GOLD, width: 1.5 },
    });
    s.addText(st[0], { x: cx - 1.05, y: dotY - 0.62, w: 2.1, h: 0.3, fontFace: FXB, fontSize: 11.5, color: GOLD_DEEP, align: "center", margin: 0 });
    s.addText(st[1], { x: cx - 1.05, y: dotY + 0.24, w: 2.1, h: 0.32, fontFace: FSB, fontSize: 12, color: INK, align: "center", margin: 0 });
    s.addText(st[2], { x: cx - 1.13, y: dotY + 0.6, w: 2.26, h: 1.15, fontFace: F, fontSize: 9.5, color: MUTE, align: "center", margin: 0, lineSpacingMultiple: 1.3, valign: "top" });
  });
  card(s, MX, 5.0, CW, 1.06, { tint: true, noShadow: true });
  s.addText("10월 말 오픈은 11~12월 연말 회식 시즌을 첫 두 달에 흡수한다는 뜻이다. 초기 현금흐름이 가장 빠르게 확보되는 시점에 오픈하는 일정이다.", {
    x: MX + 0.26, y: 5.0, w: CW - 0.52, h: 1.06, fontFace: F, fontSize: 11, color: INK_SOFT, margin: 0, valign: "middle", lineSpacingMultiple: 1.35,
  });
  footer(s, false);
}

/* ============ S18 · 운영 주체 ============ */
{
  const s = pres.addSlide();
  s.background = { color: "FFFFFF" };
  eyebrow(s, "15", "운영 주체", false);
  title(s, "청담 상권에서 매장을 운영해 온 회사가 직접 운영한다", false);
  // right photo
  s.addImage({ path: A + "vip_room.jpg", x: 7.72, y: 1.78, w: 4.9, h: 3.06 });
  s.addText("3층 VIP 프라이빗 룸 시안", { x: 7.72, y: 4.92, w: 4.9, h: 0.28, fontFace: F, fontSize: 9, color: MUTE, margin: 0 });
  const cw2 = 6.6, chh = 1.18;
  const items = [
    ["(주)에스비제이컴퍼니", "청담 새벽집, 새벽국밥을 운영하는 외식 전문 법인이다. 계약 당사자이자 삼성동점의 운영 주체다."],
    ["동일 상권 운영 경험", "강남 · 청담 상권에서 다점포를 운영해 왔다. 삼성동점이 겨냥하는 회식 · 접대 수요를 이미 다뤄온 조직이다."],
    ["브랜드 자산", "청담 오리닭은 사인 · 인테리어 · 집기까지 VI가 확정된 상태다. 삼성동점은 첫 실행이 아니라 확정된 모델의 전개다."],
    ["회계 투명성", "분기 손익을 표준 양식으로 보고한다. 매장별 매출 · 매입 원장을 분리 관리한다."],
  ];
  items.forEach((c, i) => {
    const y = 1.66 + i * (chh + 0.13);
    infoCard(s, MX, y, cw2, chh, c[0], c[1], { headSize: 11.5, bodySize: 9.5 });
  });
  footer(s, false);
}

/* ============ S19 · 제안 조건 요약 ============ */
{
  const s = pres.addSlide();
  s.background = { color: "FFFFFF" };
  eyebrow(s, "16", "제안 조건", false);
  title(s, "제안 조건 요약", false);
  const rows = [
    ["투자 대상", "(주)에스비제이컴퍼니가 설립하는 삼성동점 운영법인 (설립 예정)"],
    ["기업가치", "10억원 (Post-money). 현금 소요 7.5억 + 운영 가치 2.5억"],
    ["투자 규모", "1억원 = 지분 10%  /  2억원 = 지분 20%"],
    ["자금 사용처", "보증금 3억, 인테리어 3억, 기물 · 집기 5천만원, 예비비 1억"],
    ["집행 조건", "임대차 계약 체결을 선행 조건으로 투자금 납입. 미계약 시 전액 반환"],
    ["기대 성과", "기준안 월 매출 3억, EBITDA 6,000만원 (20.0%), 영업이익률 18.1%"],
    ["보고 체계", "월 매출 보고, 분기 손익계산서 제공, 연 1회 배당 결의"],
    ["본부 지분 옵션", "1호점 BEP 안정 도달 시 프랜차이즈 본부 법인 신주 인수 우선권 부여"],
  ];
  const ty = 1.72, rh = 0.54;
  rows.forEach((r, i) => {
    const y = ty + i * rh;
    if (i % 2 === 0) s.addShape("rect", { x: MX, y, w: CW, h: rh, fill: { color: "F8F5EE" }, line: { color: "F8F5EE", width: 0 } });
    s.addText(r[0], { x: MX + 0.2, y, w: 2.6, h: rh, fontFace: FSB, fontSize: 11.5, color: GOLD_DEEP, margin: 0, valign: "middle" });
    s.addText(r[1], { x: MX + 3.0, y, w: CW - 3.2, h: rh, fontFace: F, fontSize: 11, color: INK, margin: 0, valign: "middle" });
  });
  note(s, "본 제안서의 재무 수치는 명시된 가정에 기반한 추정치이며 수익을 보장하지 않는다. 최종 조건은 투자계약서에 따른다.", false, 6.5);
  footer(s, false);
}

/* ============ S20 · CLOSING ============ */
{
  const s = pres.addSlide();
  s.background = { color: DARK_BG };
  s.addImage({ path: A + "roaster_close.jpg", x: 8.13, y: 0, w: 5.2, h: 7.5 });
  s.addImage({ path: A + "left_grad.png", x: 6.6, y: 0, w: 6.73, h: 7.5 });
  s.addText("청담 오리닭 삼성동점", {
    x: MX, y: 2.5, w: 8, h: 0.85, fontFace: FXB, fontSize: 36, color: "FFFFFF", margin: 0,
  });
  s.addText("청담오리닭 · CHUNGDAM ORI DAK", {
    x: MX, y: 3.4, w: 8, h: 0.32, fontFace: FMD, fontSize: 11.5, color: CREAM_SUB, charSpacing: 2, margin: 0,
  });
  s.addShape("line", { x: MX, y: 4.02, w: 5.2, h: 0, line: { color: GOLD, width: 0.75, transparency: 30 } });
  s.addText("검토 후 회신 주시면 실사 자료와 도면을 제공하겠습니다.", {
    x: MX, y: 4.24, w: 7, h: 0.36, fontFace: FSB, fontSize: 13.5, color: CREAM_TXT, margin: 0,
  });
  s.addText("(주)에스비제이컴퍼니  |  대표 박경배\n서울 강남구 압구정로 73-2 4층\n청담 새벽집 · 새벽국밥 운영", {
    x: MX, y: 4.78, w: 7, h: 1.3, fontFace: F, fontSize: 11, color: CREAM_SUB, margin: 0, lineSpacingMultiple: 1.5,
  });
  footer(s, true);
}

pres.writeFile({ fileName: "cheongdam_oridak_coinvest_proposal_kr.pptx" }).then(() => {
  console.log("WROTE cheongdam_oridak_coinvest_proposal_kr.pptx, slides:", pageNo);
});
