"use client";

import { useEffect, useRef, useState } from "react";

// ── 페이지 데이터 ─────────────────────────────────────────
// 수치·주소·소개 문구는 회사 확정값으로 교체해 쓰는 자리표시 값이다.
const STATS: { label: string; value: number; suffix: string }[] = [
  { label: "운영 브랜드", value: 8, suffix: "개" },
  { label: "사업 부문", value: 4, suffix: "개" },
  { label: "온·오프라인 유통 채널", value: 30, suffix: "+" }, // 실제 수치로 교체
  { label: "함께하는 파트너", value: 100, suffix: "+" }, // 실제 수치로 교체
];

type Brand = {
  name: string;
  en: string;
  category: string;
  tagline: string;
  desc: string;
  grad: [string, string];
};

// 브랜드 소개는 표시광고 규제(효능·치료 표현 금지)를 고려해 포지셔닝 서술만 담았다.
const BRANDS: Brand[] = [
  {
    name: "리앤밤",
    en: "LEE&BALM",
    category: "BEAUTY",
    tagline: "피부 본연의 편안함",
    desc: "일상의 피부 루틴을 단순하고 편안하게 만드는 스킨케어 브랜드입니다.",
    grad: ["#2E6FB0", "#16B6C7"],
  },
  {
    name: "뷰티밤",
    en: "BEAUTYBALM",
    category: "BEAUTY",
    tagline: "매일의 아름다움",
    desc: "매일 손이 가는 데일리 뷰티를 제안하는 코스메틱 브랜드입니다.",
    grad: ["#6a5ae0", "#a06be8"],
  },
  {
    name: "주당의비결",
    en: "JUDANG'S SECRET",
    category: "HEALTH FOOD",
    tagline: "즐거운 자리, 가벼운 내일",
    desc: "즐거운 자리를 사랑하는 사람들의 라이프스타일을 생각하는 헬스푸드 브랜드입니다.",
    grad: ["#0f7a5c", "#3dbf8a"],
  },
  {
    name: "슈퍼릴라",
    en: "SUPERILLA",
    category: "HEALTH FOOD",
    tagline: "매일의 건강한 식습관",
    desc: "매일 즐기는 건강한 식습관을 제안하는 푸드 브랜드입니다.",
    grad: ["#c77c1e", "#e8b04b"],
  },
  {
    name: "대운목장",
    en: "DAEUN RANCH",
    category: "F&B",
    tagline: "푸짐하고 신선한 한 끼",
    desc: "신선한 재료를 푸짐하게, 정직한 가격으로 선보이는 외식 브랜드입니다.",
    grad: ["#8a3b2a", "#c2643f"],
  },
  {
    name: "신미집",
    en: "SINMIJIP",
    category: "F&B",
    tagline: "오래 두고 찾는 맛",
    desc: "오래 두고 다시 찾게 되는 정성의 맛을 잇는 외식 브랜드입니다.",
    grad: ["#41506b", "#6b7f9e"],
  },
  {
    name: "청담 오리닭",
    en: "CHEONGDAM ORIDAK",
    category: "F&B",
    tagline: "오리와 닭의 새로운 해석",
    desc: "오리와 닭 요리를 새로운 방식으로 풀어내는 외식 브랜드입니다.",
    grad: ["#2d6a4f", "#52a675"],
  },
  {
    name: "엣지라인의원",
    en: "EDGELINE CLINIC",
    category: "MEDICAL",
    tagline: "한 분 한 분에 집중",
    desc: "고객 한 분 한 분에 집중하는 메디컬 클리닉입니다.",
    grad: ["#1d3557", "#457b9d"],
  },
];

const AREAS = [
  {
    en: "BEAUTY",
    ko: "뷰티",
    desc: "일상에 스며드는 스킨케어와 코스메틱 브랜드를 만듭니다.",
  },
  {
    en: "HEALTH FOOD",
    ko: "헬스푸드",
    desc: "건강한 식습관을 제안하는 푸드·헬스케어 브랜드를 키웁니다.",
  },
  {
    en: "F&B",
    ko: "외식",
    desc: "다시 찾게 되는 공간과 맛으로 외식 브랜드를 운영합니다.",
  },
  {
    en: "MEDICAL",
    ko: "메디컬",
    desc: "신뢰를 바탕으로 한 메디컬 서비스 영역으로 확장합니다.",
  },
];

// 다크 배경용 로고 — public/unho-logo.svg 의 모노그램을 흰 워드마크로 재구성했다.
function Logo({ dark = true, size = 34 }: { dark?: boolean; size?: number }) {
  const ink = dark ? "#ffffff" : "#101418";
  return (
    <span className="co-logo" style={{ height: size }}>
      <svg viewBox="0 0 520 520" height={size} width={size} aria-hidden="true">
        <defs>
          <linearGradient id="co-uh" x1="120" y1="90" x2="420" y2="440" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#2E6FB0" />
            <stop offset="1" stopColor="#16B6C7" />
          </linearGradient>
        </defs>
        <g stroke="url(#co-uh)" strokeWidth="42" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <rect x="95" y="80" width="330" height="350" rx="104" />
          <path d="M188 158 V290 a62 62 0 0 0 62 62 h20 a62 62 0 0 0 62 -62 V158" />
        </g>
      </svg>
      <span className="co-logo-word" style={{ color: ink }}>
        UNHO <em>COMPANY</em>
      </span>
    </span>
  );
}

const NAV = [
  { href: "#about", label: "회사소개" },
  { href: "#brand", label: "브랜드" },
  { href: "#business", label: "사업영역" },
  { href: "#contact", label: "CONTACT" },
];

export default function HomeClient() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);

  // 스크롤 시 헤더 배경 전환
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // [data-reveal] 등장 애니메이션 + [data-count] 숫자 카운트업
  useEffect(() => {
    const revealEls = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-in");
          const counter = (e.target as HTMLElement).querySelector<HTMLElement>("[data-count]");
          if (counter && !counter.dataset.done) {
            counter.dataset.done = "1";
            const target = Number(counter.dataset.count || "0");
            const t0 = performance.now();
            const dur = 1400;
            const tick = (t: number) => {
              const p = Math.min(1, (t - t0) / dur);
              const eased = 1 - Math.pow(1 - p, 3);
              counter.textContent = String(Math.round(target * eased));
              if (p < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          }
          io.unobserve(e.target);
        }
      },
      { threshold: 0.25 }
    );
    revealEls.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const slide = (dir: 1 | -1) => {
    const rail = railRef.current;
    if (!rail) return;
    const card = rail.querySelector<HTMLElement>(".co-brand-card");
    const step = card ? card.offsetWidth + 24 : 360;
    rail.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  return (
    <main className="co-main">
      {/* ── 헤더 ── */}
      <header className={`co-header ${scrolled ? "is-scrolled" : ""}`}>
        <div className="co-wrap co-header-in">
          <a href="#top" aria-label="운호컴퍼니 홈">
            <Logo />
          </a>
          <nav className="co-nav">
            {NAV.map((n) => (
              <a key={n.href} href={n.href}>
                {n.label}
              </a>
            ))}
            <a className="co-nav-login" href="/login">
              임직원 로그인
            </a>
          </nav>
          <button className="co-burger" aria-label="메뉴 열기" onClick={() => setMenuOpen(true)}>
            <span />
            <span />
            <span />
          </button>
        </div>
      </header>

      {/* ── 모바일 메뉴 ── */}
      <div className={`co-sheet ${menuOpen ? "is-open" : ""}`} onClick={() => setMenuOpen(false)}>
        <div className="co-sheet-panel" onClick={(e) => e.stopPropagation()}>
          <div className="co-sheet-top">
            <Logo dark={false} size={28} />
            <button aria-label="메뉴 닫기" className="co-sheet-close" onClick={() => setMenuOpen(false)}>
              ×
            </button>
          </div>
          <nav className="co-sheet-nav">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} onClick={() => setMenuOpen(false)}>
                {n.label}
              </a>
            ))}
            <a href="/login" onClick={() => setMenuOpen(false)}>
              임직원 로그인
            </a>
          </nav>
        </div>
      </div>

      {/* ── 히어로 ── */}
      <section className="co-hero" id="top">
        <div className="co-hero-bg" aria-hidden="true">
          <span className="co-blob b1" />
          <span className="co-blob b2" />
          <span className="co-blob b3" />
          <span className="co-grid" />
        </div>
        <div className="co-wrap co-hero-in">
          <p className="co-hero-kicker" data-reveal>
            UNHO COMPANY
          </p>
          <h1 className="co-hero-title" data-reveal>
            브랜드로
            <br />
            일상을 채우다<span className="co-dot">.</span>
          </h1>
          <p className="co-hero-sub" data-reveal>
            뷰티 · 헬스푸드 · 외식 · 메디컬 — 운호컴퍼니는 삶의 가까운 곳에서
            <br className="co-br-lg" /> 오래 사랑받는 브랜드를 만들고 키웁니다.
          </p>
        </div>
        <a className="co-hero-scroll" href="#about" aria-label="아래로 스크롤">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </a>
      </section>

      {/* ── 회사 소개 문장 ── */}
      <section className="co-section co-about" id="about">
        <div className="co-wrap">
          <p className="co-eyebrow" data-reveal>
            <span>WHO WE ARE</span>
          </p>
          <h2 className="co-h2" data-reveal>
            좋은 브랜드는 하루아침에 만들어지지 않습니다.
            <br />
            운호컴퍼니는 만들고, 알리고, 유통하는
            <br />
            전 과정을 직접 해내는 브랜드 컴퍼니입니다.
          </h2>
        </div>
      </section>

      {/* ── 성장 지표 ── */}
      <section className="co-section co-stats">
        <div className="co-wrap">
          <p className="co-eyebrow" data-reveal>
            <span>OUR GROWTH</span>
          </p>
          <h2 className="co-h2" data-reveal>
            제품에서 매장까지, 채널에서 고객까지 —<br />
            운호컴퍼니는 오늘도 성장합니다.
          </h2>
          <dl className="co-stat-list">
            {STATS.map((s) => (
              <div className="co-stat" key={s.label} data-reveal>
                <dt>{s.label}</dt>
                <dd>
                  <span data-count={s.value}>0</span>
                  <em>{s.suffix}</em>
                </dd>
              </div>
            ))}
          </dl>
          <p className="co-stat-note" data-reveal>
            * 위 수치는 회사 기준 자료로 업데이트됩니다.
          </p>
        </div>
      </section>

      {/* ── 브랜드 캐러셀 ── */}
      <section className="co-section co-brands" id="brand">
        <div className="co-wrap co-brands-head">
          <div>
            <p className="co-eyebrow" data-reveal>
              <span>OUR BRANDS</span>
            </p>
            <h2 className="co-h2 dark" data-reveal>
              운호컴퍼니의 8개 브랜드를
              <br />
              소개합니다.
            </h2>
          </div>
          <div className="co-arrows" data-reveal>
            <button aria-label="이전 브랜드" onClick={() => slide(-1)}>
              ←
            </button>
            <button aria-label="다음 브랜드" onClick={() => slide(1)}>
              →
            </button>
          </div>
        </div>
        <div className="co-brand-rail" ref={railRef} data-reveal>
          {BRANDS.map((b) => (
            <article
              className="co-brand-card"
              key={b.name}
              style={{ background: `linear-gradient(145deg, ${b.grad[0]}, ${b.grad[1]})` }}
            >
              <p className="co-brand-cat">{b.category}</p>
              <p className="co-brand-tag">{b.tagline}</p>
              <div className="co-brand-foot">
                <h3>{b.name}</h3>
                <p className="co-brand-en">{b.en}</p>
                <p className="co-brand-desc">{b.desc}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ── 사업영역 ── */}
      <section className="co-section co-areas" id="business">
        <div className="co-wrap">
          <p className="co-eyebrow" data-reveal>
            <span>BUSINESS AREAS</span>
          </p>
          <h2 className="co-h2" data-reveal>
            네 개의 부문이 서로를 키웁니다.
          </h2>
          <div className="co-area-grid">
            {AREAS.map((a, i) => (
              <div className="co-area" key={a.en} data-reveal>
                <span className="co-area-num">0{i + 1}</span>
                <h3>
                  {a.en} <em>{a.ko}</em>
                </h3>
                <p>{a.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CONTACT CTA ── */}
      <section className="co-section co-cta" id="contact">
        <div className="co-wrap">
          <h2 className="co-h2" data-reveal>
            운호컴퍼니와 다음 브랜드를
            <br />
            함께 만들 분을 기다립니다.
          </h2>
          <div className="co-cta-btns" data-reveal>
            <a className="co-btn" href="mailto:uc@unocompany.net">
              입점·제휴 문의
            </a>
            <a className="co-btn ghost" href="mailto:uc@unocompany.net?subject=%EC%B1%84%EC%9A%A9%20%EB%AC%B8%EC%9D%98">
              채용 문의
            </a>
          </div>
        </div>
      </section>

      {/* ── 푸터 ── */}
      <footer className="co-footer">
        <div className="co-wrap">
          <Logo size={26} />
          <p className="co-footer-name">주식회사 운호컴퍼니</p>
          {/* 사업자등록번호·주소 확정값은 아래 dl 에 채워 넣는다. */}
          <dl className="co-footer-meta">
            <dd>contact: uc@unocompany.net</dd>
          </dl>
          <p className="co-footer-copy">© UNHO COMPANY Inc. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
