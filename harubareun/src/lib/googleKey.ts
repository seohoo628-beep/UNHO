// 서비스계정 개인키(PEM) 정규화.
// Vercel 등에 붙여넣을 때 줄바꿈이 \n 이스케이프로 들어오거나, 모바일에서
// 복사하며 줄이 깨지거나, 따옴표가 섞이는 경우가 많다. 어떤 형태로 들어와도
// 유효한 PEM으로 복원한다(본문 base64 문자만 추출 → 64자 단위로 재구성).
export function normalizePrivateKey(raw: string): string {
  if (!raw) return "";
  let k = raw.trim();

  // 감싼 따옴표 제거
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
    k = k.slice(1, -1);
  }

  // 이스케이프된 \r \n \t 를 실제 문자로 (반드시 base64 추출 전에 수행 →
  // 이 단계를 건너뛰면 "\n"의 n 이 base64 본문에 섞여 키가 깨진다)
  k = k.replace(/\\r/g, "").replace(/\\n/g, "\n").replace(/\\t/g, "").trim();

  // BEGIN 헤더가 없으면: 통째로 base64 인코딩된 PEM일 수 있으니 디코드 시도(가장 안전한 입력 방식).
  if (!/-----BEGIN/.test(k) && /^[A-Za-z0-9+/=\s]+$/.test(k) && k.length > 100) {
    try {
      const decoded = Buffer.from(k.replace(/\s/g, ""), "base64").toString("utf8");
      if (/-----BEGIN/.test(decoded)) k = decoded.replace(/\\n/g, "\n");
    } catch { /* 무시 */ }
  }

  const header = k.match(/-----BEGIN ([A-Z0-9 ]+?)-----/);
  const both = k.match(/-----BEGIN [A-Z0-9 ]+?-----([\s\S]*?)-----END [A-Z0-9 ]+?-----/);
  if (header && both) {
    const label = header[1].trim();
    // 본문에서 base64 문자만 남긴다(공백·줄바꿈·잔여 이스케이프 제거)
    const body = both[1].replace(/[^A-Za-z0-9+/=]/g, "");
    const wrapped = body.match(/.{1,64}/g)?.join("\n") ?? body;
    return `-----BEGIN ${label}-----\n${wrapped}\n-----END ${label}-----\n`;
  }

  // 헤더가 없으면 원본을 그대로(최소한 개행만 정리) 반환
  return k;
}
