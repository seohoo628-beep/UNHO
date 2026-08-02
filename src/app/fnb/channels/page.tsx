import { Card } from "@fnb/components/ui";

export const metadata = { title: "채널 바로가기" };

// 외부 관리자 페이지 바로가기. 각 서비스 계정으로 로그인해 사용합니다.
const GROUPS: { title: string; items: { name: string; url: string; desc: string; emoji: string }[] }[] = [
  {
    title: "📣 검색광고",
    items: [
      { emoji: "🟢", name: "네이버 검색광고", url: "https://searchad.naver.com/", desc: "파워링크·키워드 광고 관리" },
      { emoji: "🔵", name: "구글 검색광고 (Google Ads)", url: "https://ads.google.com/", desc: "구글 검색·디스플레이 광고" },
    ],
  },
  {
    title: "⭐ 리뷰·예약",
    items: [
      { emoji: "📝", name: "네이버 스마트플레이스 (리뷰관리)", url: "https://smartplace.naver.com/", desc: "플레이스 정보·리뷰 관리" },
      { emoji: "📅", name: "네이버 예약 현황", url: "https://partner.booking.naver.com/", desc: "네이버 예약 파트너센터" },
      { emoji: "🍽️", name: "캐치테이블 매니저", url: "https://ceo.catchtable.co.kr/", desc: "캐치테이블 예약 관리" },
    ],
  },
  {
    title: "🛵 배달",
    items: [
      { emoji: "🛵", name: "배달의민족 셀프서비스", url: "https://self.baemin.com/", desc: "배민 매장·메뉴·주문 관리" },
      { emoji: "🟡", name: "쿠팡이츠 스토어", url: "https://store.coupangeats.com/", desc: "쿠팡이츠 매장 관리" },
    ],
  },
];

export default function ChannelsPage() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>채널 바로가기</h1>
          <p>검색광고·리뷰·예약·배달 관리자 페이지로 바로 이동합니다. (각 서비스 계정으로 로그인)</p>
        </div>
      </div>

      <div className="stack">
        {GROUPS.map((g) => (
          <Card key={g.title} title={g.title} pad>
            <div className="grid grid-3" style={{ gap: 12 }}>
              {g.items.map((it) => (
                <a
                  key={it.name}
                  href={it.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "flex", gap: 12, alignItems: "center",
                    border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px",
                    textDecoration: "none", color: "var(--text)", background: "var(--surface)",
                  }}
                >
                  <span style={{ fontSize: 26, lineHeight: 1 }}>{it.emoji}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: 700, fontSize: 14 }}>{it.name} ↗</span>
                    <span className="muted" style={{ fontSize: 12 }}>{it.desc}</span>
                  </span>
                </a>
              ))}
            </div>
          </Card>
        ))}

        <Card pad>
          <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
            링크는 각 서비스의 공식 관리자 페이지입니다. 로그인 계정은 매장별로 다를 수 있으니, 처음이면 본사에 계정을 문의하세요.
            (특정 매장 전용 주소가 있으면 알려주시면 매장별로 연결해 드립니다.)
          </div>
        </Card>
      </div>
    </>
  );
}
