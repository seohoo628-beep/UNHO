// 이커머스/업계 뉴스 자동 수집 — 구글뉴스 RSS(무료·키 불필요, 실제 최신 기사 링크).
// 운호컴퍼니 사업군(이커머스·뷰티·건기식·외식)에 맞춘 검색어로 최신순 상위 기사를 모은다.

export type NewsItem = { title: string; link: string; source: string; ts: number };

const QUERIES = [
  "이커머스 마케팅",
  "화장품 뷰티 유통",
  "숙취해소제 건강기능식품",
  "외식업 트렌드",
];

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function pickTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? decodeEntities(m[1]) : "";
}

async function fetchQuery(q: string): Promise<NewsItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ko&gl=KR&ceid=KR:ko`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = xml.split("<item>").slice(1);
    const out: NewsItem[] = [];
    for (const raw of items.slice(0, 6)) {
      const block = raw.split("</item>")[0] ?? "";
      let title = pickTag(block, "title");
      const link = pickTag(block, "link");
      const source = pickTag(block, "source") || "구글뉴스";
      const pub = pickTag(block, "pubDate");
      const ts = pub ? Date.parse(pub) : 0;
      // 제목 끝의 " - 언론사" 정리
      title = title.replace(/\s*-\s*[^-]+$/, (m) => (source && m.includes(source) ? "" : m)).trim() || title;
      if (title && link) out.push({ title, link, source, ts: Number.isFinite(ts) ? ts : 0 });
    }
    return out;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchEcommerceNews(limit = 5): Promise<NewsItem[]> {
  const results = await Promise.all(QUERIES.map(fetchQuery));
  const flat = results.flat();
  // 제목 기준 중복 제거 후 최신순
  const seen = new Set<string>();
  const uniq: NewsItem[] = [];
  for (const n of flat.sort((a, b) => b.ts - a.ts)) {
    const key = n.title.slice(0, 24);
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(n);
  }
  return uniq.slice(0, limit);
}
