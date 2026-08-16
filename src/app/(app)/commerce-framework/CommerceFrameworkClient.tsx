"use client";

import { useEffect, useMemo, useState } from "react";

// 외부 강의 프레임을 자사 운영에 맞춰 재구성한 내부 도구.
// 저장은 전부 기기 localStorage(개인용 계산·체크). 서버 저장 없음.

const won = (n: number) => (Number.isFinite(n) ? Math.round(n).toLocaleString("ko-KR") : "-");
const eok = (n: number) => {
  if (!Number.isFinite(n) || n === 0) return "";
  const e = Math.floor(n / 100_000_000);
  const m = Math.round((n % 100_000_000) / 10_000);
  return `${e ? e + "억 " : ""}${m ? m + "만" : e ? "" : ""}`.trim();
};

const TABS = [
  { key: "revenue", label: "📉 매출 역산" },
  { key: "product", label: "✅ 제품 채택 심사" },
  { key: "fourp", label: "🧩 4P 인덱스" },
  { key: "checklist", label: "📋 실행 체크리스트" },
  { key: "priority", label: "🚀 우선 실행" },
] as const;

const BRANDS = ["리앤밤", "주당의비결", "슈퍼릴라"] as const;

function useLocal<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(initial);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setV(JSON.parse(raw));
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const set = (nv: T) => {
    setV(nv);
    try { localStorage.setItem(key, JSON.stringify(nv)); } catch { /* ignore */ }
  };
  return [v, set];
}

const card: React.CSSProperties = { padding: 16, marginBottom: 14 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 11px", border: "1px solid var(--line-2)", borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--ink)", fontSize: 14 };
const label: React.CSSProperties = { display: "block", fontSize: 12, color: "var(--ink-2)", fontWeight: 600, marginBottom: 4 };

// ── 1. 매출 목표 역산 ─────────────────────────────────────────
type RevInput = { annual: number; staff: number; fixed: number; margin: number; weekendMult: number };
const REV_DEFAULT: RevInput = { annual: 0, staff: 1, fixed: 0, margin: 20, weekendMult: 1.3 };

function RevenueCalc() {
  const [brand, setBrand] = useState<(typeof BRANDS)[number]>("리앤밤");
  const [all, setAll] = useLocal<Record<string, RevInput>>("cf:rev", {});
  const f = all[brand] ?? REV_DEFAULT;
  const set = (patch: Partial<RevInput>) => setAll({ ...all, [brand]: { ...f, ...patch } });

  const WD = 22, WE = 8; // 월 평일/주말 수(근사)
  const monthly = f.annual / 12;
  const daily = monthly / 30;
  const weekdayDaily = monthly / (WD + WE * f.weekendMult);
  const weekendDaily = weekdayDaily * f.weekendMult;
  const perStaff = f.staff > 0 ? monthly / f.staff : 0;
  const annualProfit = f.annual * (f.margin / 100);
  const monthlyProfit = annualProfit / 12;
  const fixedRatio = monthly > 0 ? (f.fixed / monthly) * 100 : 0;

  const Num = ({ v, on, suffix }: { v: number; on: (n: number) => void; suffix?: string }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input type="number" value={v || ""} onChange={(e) => on(Number(e.target.value) || 0)} style={inputStyle} />
      {suffix && <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{suffix}</span>}
    </div>
  );

  const Out = ({ t, v, sub, strong }: { t: string; v: string; sub?: string; strong?: boolean }) => (
    <div className="card" style={{ padding: "12px 14px", margin: 0 }}>
      <div className="muted" style={{ fontSize: 11.5, fontWeight: 700 }}>{t}</div>
      <div style={{ fontSize: strong ? 20 : 17, fontWeight: 800, marginTop: 3, color: strong ? "var(--accent)" : "var(--ink)" }}>{v}</div>
      {sub && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {BRANDS.map((b) => (
          <button key={b} className={`btn sm${brand === b ? " primary" : ""}`} onClick={() => setBrand(b)}>{b}</button>
        ))}
      </div>

      <div className="card" style={card}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>입력 — {brand}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
          <div><span style={label}>연 매출 목표 (원)</span><Num v={f.annual} on={(n) => set({ annual: n })} suffix={eok(f.annual)} /></div>
          <div><span style={label}>인원 수</span><Num v={f.staff} on={(n) => set({ staff: n })} suffix="명" /></div>
          <div><span style={label}>월 고정 판관비 (원)</span><Num v={f.fixed} on={(n) => set({ fixed: n })} suffix={eok(f.fixed)} /></div>
          <div><span style={label}>기대 수익률 (%)</span><Num v={f.margin} on={(n) => set({ margin: n })} suffix="%" /></div>
          <div><span style={label}>주말 일매출 가중치 (×평일)</span><Num v={f.weekendMult} on={(n) => set({ weekendMult: n })} suffix="배" /></div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 14 }}>
        <Out t="① 연 매출" v={won(f.annual)} sub={eok(f.annual)} />
        <Out t="② 월 매출" v={won(monthly)} sub="연 ÷ 12" strong />
        <Out t="③ 일평균" v={won(daily)} sub="월 ÷ 30" />
        <Out t="④ 평일 일매출" v={won(weekdayDaily)} sub={`주말 ${won(weekendDaily)}`} />
        <Out t="⑤ 인당 월매출" v={won(perStaff)} sub={`${f.staff}명 기준`} />
        <Out t="⑥ 연 목표이익" v={won(annualProfit)} sub={`월 ${won(monthlyProfit)} · 수익률 ${f.margin}%`} strong />
      </div>

      <div className="card" style={{ padding: "12px 14px", borderLeft: `4px solid ${fixedRatio > 0 && fixedRatio < 100 ? "var(--ok,#16a34a)" : "var(--owner,#b91c1c)"}` }}>
        <div style={{ fontSize: 13 }}>
          월 고정판관비가 월 매출의 <b>{fixedRatio ? fixedRatio.toFixed(1) : "-"}%</b>.
          {fixedRatio >= 100 && " ⚠️ 고정비가 월 매출을 초과 — 목표를 다시 잡거나 비용 구조를 손봐야 합니다."}
        </div>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
          목표를 연 단위로만 잡으면 실행으로 안 내려온다. 6단계로 쪼개야 인력·재고·광고 예산이 자동으로 결정된다.
        </div>
      </div>
    </div>
  );
}

// ── 2. 제품 채택 심사 ─────────────────────────────────────────
const PRODUCT_CRITERIA = [
  "객단가 3만원 이상, 1인 구매액 5만원 이상이 나오는가",
  "재구매가 발생하는가 (주기 2주~2개월 이내가 이상적)",
  "재구매가 없다면 SKU 확장(색상·맛·용량·사이즈)이 가능한가",
  "메인 쇼핑 키워드 검색량이 월 10만 이상인가",
  "카테고리 1~3위가 프리미엄인가 (가격이 깨진 시장은 진입 안 함)",
  "대형 키워드 외 중·소형 키워드로도 확장 가능한가",
  "유통기한 1~2년·상온·파손 낮음·부피 작음 (수출 전제)",
  "패키지 디자인이 경쟁 상품 대비 눈에 띄는가",
];
const DIFF_BASES = ["최초", "최다", "최고", "최저", "특허", "독점", "제조공법", "주원료", "주요소재", "원산지", "색상", "맛의 종류", "패키지", "인증", "논문", "공신력 있는 인물", "디자인"];

function ProductScreen() {
  const [name, setName] = useState("");
  const [checks, setChecks] = useState<boolean[]>(Array(8).fill(false));
  const [diffs, setDiffs] = useState<string[]>([]);
  const passCount = checks.filter(Boolean).length;
  const pass = passCount === 8 && diffs.length >= 1;

  const toggleDiff = (d: string) => setDiffs((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]));

  return (
    <div>
      <div className="card" style={{ ...card, borderLeft: `4px solid ${pass ? "var(--ok,#16a34a)" : "var(--warn,#f59e0b)"}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="심사할 제품명" style={{ ...inputStyle, maxWidth: 260 }} />
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: pass ? "var(--ok,#16a34a)" : "var(--warn,#b45309)" }}>{pass ? "✅ 통과" : "⏳ 보류"}</div>
            <div className="muted" style={{ fontSize: 12 }}>기준 {passCount}/8 · 차별화 {diffs.length}개</div>
          </div>
        </div>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>8개 기준 전부 + 차별화 근거 1개 이상이면 통과. 통과 못 하면 만들지 않는다.</div>
      </div>

      <div className="card" style={card}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>채택 기준 (8)</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {PRODUCT_CRITERIA.map((c, i) => (
            <label key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13.5, cursor: "pointer" }}>
              <input type="checkbox" checked={checks[i]} onChange={() => setChecks((p) => p.map((v, j) => (j === i ? !v : v)))} style={{ marginTop: 3 }} />
              <span>{c}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="card" style={card}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>차별화 근거 <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>(최소 1개 — 없으면 가격 경쟁으로 밀린다)</span></div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          {DIFF_BASES.map((d) => (
            <button key={d} className={`btn sm${diffs.includes(d) ? " primary" : ""}`} onClick={() => toggleDiff(d)}>{d}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 3. 4P 인덱스 ─────────────────────────────────────────────
const FOURP = [
  { key: "product", title: "Product", hint: "카테고리 / 형태(고체·액체·파우더) / 유통기한 / 파손 위험 / 수출 규격 / 재구매 주기 / 색상·용량 확장성" },
  { key: "place", title: "Place", hint: "자사몰 / 스마트스토어 / 오픈마켓 / 폐쇄몰 / 공동구매 / B2B / 해외 플랫폼 / 수출" },
  { key: "price", title: "Price", hint: "원가율 / 판매가대 / 미끼·메인·기획 구분" },
  { key: "promotion", title: "Promotion", hint: "적립금 / 쿠폰 / 1+1 / 즉시할인 / 사은품 / 기획전 코드" },
] as const;

function FourP() {
  const [all, setAll] = useLocal<Record<string, string>>("cf:4p", {});
  return (
    <div>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>제품을 만들기 전에 4P를 채워 시작한다. 만들고 나서 파는 방법을 고민하면 늦는다.</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>
        {FOURP.map((p) => (
          <div key={p.key} className="card" style={{ padding: 14 }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 2 }}>{p.title}</div>
            <div className="muted" style={{ fontSize: 11, marginBottom: 8 }}>{p.hint}</div>
            <textarea rows={4} value={all[p.key] ?? ""} onChange={(e) => setAll({ ...all, [p.key]: e.target.value })} style={{ ...inputStyle, resize: "vertical" }} placeholder="입력…" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 4. 실행 체크리스트 (참고) ─────────────────────────────────
const CHECKLISTS: { title: string; note?: string; items: string[] }[] = [
  {
    title: "상세페이지 체크리스트",
    note: "리앤밤(화장품)·슈퍼릴라(건기식)은 효능·기능성 표현 규제 대상. 비포·애프터는 브랜드별 가부가 다르므로 확정 전 검수.",
    items: [
      "타겟을 뾰족하게 (범용 타겟은 전환 안 됨)",
      "제품 자랑이 아니라 고객 베네핏으로",
      "페인포인트 → 자사 솔루션 구조 반드시 포함",
      "USP 최소 1개 명시",
      "일상 언어로 (전문용어 늘어놓으면 이탈)",
      "육하원칙으로 정보 배치",
      "동류 찾기 — 타겟이 자기와 같은 부류로 볼 모델·사진",
      "비포·애프터 가능하면 전면 배치 (규제 확인)",
      "Q&A 반복 질문을 상단으로",
      "사진·영상·상세 제작비는 줄이지 않는다",
    ],
  },
  {
    title: "이벤트 기획 3요소 = 명분 × 기간 × 수량",
    note: '셋 중 하나라도 빠지면 이벤트가 아니라 그냥 할인. 예) 신학기 기념 → 3일 한정 → 선착순 200개.',
    items: [
      "4~6주치 이벤트 캘린더 미리 편성",
      "성과 난 이벤트는 주·월·분기 정례로 고정",
      "객단가 내리는 이벤트 금지 — 2개 이상 구성으로",
      "강한 펀치·약한 펀치 섞기 (할인 일변도 금지)",
      "매월 1일 시즌 이슈에 맞춰 디자인·문구 교체",
      "잘 나온 실적은 MD 영업자료 ('최초 런칭'·'매출 레퍼런스')",
      "노출가 팁: 즉시할인❌(정가 붕괴) / 쿠폰·적립·1+1✅(정가 유지)",
    ],
  },
  {
    title: "리뷰 자산화",
    note: "자가구매·우호아이디 리뷰는 미채택(법 위반). 포인트·한달리뷰·체험단 등 합법 수단만.",
    items: [
      "리뷰 포인트는 허들 넘길 만큼 (5만원↑ 상품에서)",
      "포인트 자동지급 세팅 (구매·확정·작성 시점 반복 노출)",
      "썸네일·제목에 포인트 혜택 표기",
      "한달리뷰 이벤트 (즉시 1 + 한달 1 → 리뷰 2배)",
      "조건 지정 ('사진 첨부·100자·사용 전후')",
      "스토어픽으로 한달 사용기·재구매 리뷰 상단 배치",
      "베스트 리뷰 주간 선정 + 배너·공지 노출",
      "악성 리뷰는 즉시 환불 + 재구매 쿠폰 (삭제 요청❌)",
    ],
  },
  {
    title: "검색 자산 확보 (네이버)",
    items: [
      "이름부터 — 검색 시 결과 없는 이름으로",
      "개발 착수 전 상표권 출원 (우선심사 3개월)",
      "자사 콘텐츠를 주요 영역에 먼저 깔고 유입",
      "브랜디드 콘텐츠로 인플루언서 탭 → VIEW 탭",
      "브랜드 검색량 일정 수준↑ 시 브랜드검색 광고",
      "모든 광고의 최종 목표 = 자사 브랜드 검색량 증가",
    ],
  },
  {
    title: "OEM 공장 선정·협상",
    items: [
      "대표가 직접 영업하는 공장 (MOQ 조정 여지)",
      "반드시 방문 (화장실 청결 = 관리 수준)",
      "배합·포장·수정 요청에 부담스러워하면 진행❌",
      "성공 레퍼런스 제품 확인",
      "타사 기밀 이야기하는 곳❌ (우리 정보도 샌다)",
      "계약서 먼저 안 꺼내는 곳❌",
      "금형비: 수량 분할 상각 + 미달 시 프리몰드 전환(계약서)",
      "MOQ: 부자재 100% 선결제 / 라인 인건비 부담 조건 / 첫 생산 1천만원 전후",
    ],
  },
  {
    title: "객단가 인상 — 기획전 코드 실험",
    items: [
      "단일 상품에 여러 구성(5·10·15·20만원대) 동시 노출",
      "구성별 가격 메리트·사은품 차등",
      "메리트 존 탐색 (1,000원씩 올리며 반응 끊기는 지점)",
      "승리한 코드만 남기고 정리",
      "리뷰 쌓인 코드는 상품 교체❌(어뷰징) → 다른 이벤트로 전환",
      "전환율 3% 안정 시 기획전 코드 → 평시 코드",
      "사은품 힌트는 포토리뷰 소품에서 → 다음 SKU 후보",
    ],
  },
];

function ChecklistRef() {
  return (
    <div>
      {CHECKLISTS.map((c) => (
        <div key={c.title} className="card" style={card}>
          <div style={{ fontWeight: 800, fontSize: 14.5 }}>{c.title}</div>
          {c.note && <div className="muted" style={{ fontSize: 11.5, marginTop: 4, marginBottom: 6 }}>⚠️ {c.note}</div>}
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 5 }}>
            {c.items.map((i, k) => <li key={k} style={{ fontSize: 13.5, lineHeight: 1.5 }}>{i}</li>)}
          </ul>
        </div>
      ))}

      <div className="card" style={{ ...card, borderLeft: "4px solid var(--owner,#b91c1c)" }}>
        <div style={{ fontWeight: 800, fontSize: 14.5, color: "var(--owner,#b91c1c)" }}>⛔ 채택하지 않는 전술 (법적 리스크)</div>
        <ul style={{ margin: "8px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 5 }}>
          <li style={{ fontSize: 13.5 }}>런칭 초기 우호 아이디 자가구매·리뷰 작성 — 표시광고법 위반, 상품 삭제·계정 제재</li>
          <li style={{ fontSize: 13.5 }}>카페 침투용 아이디 육성·대행 — 약관 위반·뒷광고 규제, 법인 리스크</li>
          <li style={{ fontSize: 13.5 }}>최상급 표현(최고·최초·최대·최저)은 실증자료 있는 항목에만. '한정'·명분·기간·수량 구조는 자유</li>
        </ul>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>리앤밤(화장품)·슈퍼릴라(건기식)은 적발 시 제재가 제조·판매 단계까지 번진다. 리뷰는 합법 수단으로만.</div>
      </div>
    </div>
  );
}

// ── 5. 우선 실행 항목 ────────────────────────────────────────
const PRIORITY = [
  { t: "리앤밤 소모품 라인(전용 앰플·젤) 기획 착수", why: "재구매 없는 디바이스 단품 구조가 광고 효율을 구조적으로 잠식" },
  { t: "슈퍼릴라 3개월·6개월 정기구독 구성 설계", why: "1개월 재구매 주기로 정기구독 적합도 최상" },
  { t: "브랜드 3축 상표권 등록 상태 전수 점검", why: "네이버 브랜드 심사·쿠팡 화이트리스트 진입 전제" },
  { t: "기획전 코드 실험 세팅 (5·10·15만원 구성)", why: "객단가 인상이 수익률 개선의 최단 경로" },
  { t: "브랜드별 6주 이벤트 캘린더 수립", why: "명분·기간·수량 없는 단발 할인 반복 차단" },
  { t: "리뷰 포인트 자동지급 + 한달리뷰 이벤트 도입", why: "리뷰 자산이 광고비 의존도를 낮추는 유일한 축적 자산" },
];

function Priority() {
  const [done, setDone] = useLocal<Record<number, boolean>>("cf:priority", {});
  return (
    <div>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>강의 프레임에서 뽑은 우선 실행 6가지. 체크는 기기에 저장됩니다.</div>
      {PRIORITY.map((p, i) => (
        <label key={i} className="card" style={{ ...card, display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", marginBottom: 10, opacity: done[i] ? 0.6 : 1 }}>
          <input type="checkbox" checked={!!done[i]} onChange={() => setDone({ ...done, [i]: !done[i] })} style={{ marginTop: 3, width: 18, height: 18 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, textDecoration: done[i] ? "line-through" : "none" }}>{i + 1}. {p.t}</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>{p.why}</div>
          </div>
        </label>
      ))}
    </div>
  );
}

export default function CommerceFrameworkClient() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("revenue");

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 style={{ margin: 0 }}>📚 커머스 운영 프레임</h1>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>강의 프레임을 자사(리앤밤·주당의비결·슈퍼릴라 D2C)에 맞춰 재구성 · 내부용</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {TABS.map((t) => (
          <button key={t.key} className={`btn sm${tab === t.key ? " primary" : ""}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {tab === "revenue" && <RevenueCalc />}
      {tab === "product" && <ProductScreen />}
      {tab === "fourp" && <FourP />}
      {tab === "checklist" && <ChecklistRef />}
      {tab === "priority" && <Priority />}
    </div>
  );
}
