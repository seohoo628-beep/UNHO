// 현재 배포 버전(커밋 SHA)을 항상 최신으로 반환. 클라이언트가 이 값을 폴링해
// 배포가 바뀌면 자동 새로고침한다.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const v =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    "dev";
  return new Response(JSON.stringify({ v }), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store, max-age=0",
    },
  });
}
