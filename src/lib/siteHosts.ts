// 별도 사이트로 분리된 화면의 호스트 판별. 미들웨어(엣지)·매니페스트·브라우저 공용 — 의존성 없음.

/** 호스트의 첫 라벨(서브도메인). "mudangtea.unho.co.kr:443" → "mudangtea" */
export function hostLabel(host: string | null | undefined): string {
  return (host || "").toLowerCase().split(":")[0].split(".")[0];
}

/**
 * 무당티 유통 관리 전용 도메인인지. 첫 라벨에 "mudang"(mudangtea·mudang·unho-mudangtea 등)이 들어가면 그렇다.
 * Vercel 브랜치 프리뷰(…-git-<브랜치>-….vercel.app)는 브랜치 이름에 mudang 이 들어가도 제외한다.
 */
export function isMudangteaHost(host: string | null | undefined): boolean {
  const label = hostLabel(host);
  return label.includes("mudang") && !label.includes("-git-");
}

/** 무당티 전용 도메인에서 그대로 열어 두는 경로. 나머지(운영 플랫폼 화면)는 /mudangtea 로 보낸다. */
export function isMudangteaSitePath(path: string): boolean {
  return (
    path === "/mudangtea" ||
    path.startsWith("/mudangtea/") ||
    path.startsWith("/login") ||
    path.startsWith("/auth") ||
    path.startsWith("/api/") ||
    path.startsWith("/store-manifest/") ||
    path.startsWith("/icons/") ||
    /\.[a-z0-9]+$/i.test(path) // sw.js·favicon 등 정적 파일
  );
}
