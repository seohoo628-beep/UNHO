import { ImageResponse } from "next/og";

// UNO 앱 아이콘 동적 생성(PNG). /api/uno/icon?size=512
// 미들웨어에서 /api/uno 는 공개 처리됨.
export const runtime = "edge";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const size = Math.min(1024, Math.max(48, Number(searchParams.get("size") || 512)));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #6b4fc0, #4a2f92)",
          color: "#ffffff",
        }}
      >
        <div
          style={{
            fontSize: size * 0.34,
            fontWeight: 800,
            letterSpacing: -size * 0.01,
            fontFamily: "sans-serif",
          }}
        >
          UNO
        </div>
      </div>
    ),
    {
      width: size,
      height: size,
      headers: { "Cache-Control": "public, max-age=31536000, immutable" },
    },
  );
}
