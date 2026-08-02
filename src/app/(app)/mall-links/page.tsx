import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Link = { name: string; sub?: string; url: string; emoji: string };
type Group = { title: string; links: Link[] };

const GROUPS: Group[] = [
  {
    title: "자사몰 · 홈페이지",
    links: [
      { name: "리앤밤", sub: "자사몰", url: "https://reandbomb.com/", emoji: "💧" },
      { name: "운호컴퍼니", sub: "공식 홈페이지", url: "https://unocompany.net/", emoji: "🏢" },
      { name: "뷰티밤", sub: "자사몰", url: "https://beautybomb.co.kr/", emoji: "💄" },
      { name: "주당의비결", sub: "자사몰", url: "https://m.jubi.co.kr/", emoji: "🍶" },
    ],
  },
  {
    title: "스마트스토어",
    links: [
      { name: "뷰티밤", sub: "스마트스토어", url: "https://m.smartstore.naver.com/daon200", emoji: "🛍" },
      { name: "주당의비결", sub: "스마트스토어", url: "https://m.smartstore.naver.com/judangbi", emoji: "🛍" },
    ],
  },
];

export default async function Page() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");

  return (
    <div>
      <div className="page-head">
        <h1 style={{ margin: 0 }}>🛍 자사몰 바로가기</h1>
        <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>운영 중인 자사몰·스마트스토어를 새 탭으로 엽니다.</p>
      </div>

      {GROUPS.map((g) => (
        <div key={g.title} style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--ink-2)", margin: "4px 2px 10px", letterSpacing: "0.02em" }}>{g.title}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {g.links.map((l) => (
              <a
                key={l.url}
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className="card"
                style={{ padding: 16, textDecoration: "none", color: "var(--ink)", display: "flex", alignItems: "center", gap: 12 }}
              >
                <span style={{ fontSize: 26, lineHeight: 1 }}>{l.emoji}</span>
                <span style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                  <strong style={{ fontSize: 15 }}>{l.name}</strong>
                  <span className="muted" style={{ fontSize: 12 }}>{l.sub}</span>
                  <span style={{ fontSize: 11.5, color: "var(--accent)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {l.url.replace(/^https?:\/\//, "")} ↗
                  </span>
                </span>
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
