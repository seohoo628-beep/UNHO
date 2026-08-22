// 클립보드 복사 + 모바일 네이티브 공유 공용 헬퍼.
// (12곳에 흩어져 있던 textarea 폴백 복사 로직을 한곳으로)
"use client";

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

// 모바일: 네이티브 공유 시트(카톡 선택 가능). 미지원·취소 시 복사로 폴백.
export async function shareOrCopy(text: string, title?: string): Promise<"shared" | "copied" | "failed"> {
  try {
    const nav = navigator as any;
    if (nav.share) {
      await nav.share(title ? { title, text } : { text });
      return "shared";
    }
  } catch (e: any) {
    if (e?.name === "AbortError") return "shared"; // 사용자가 시트 닫음 — 폴백 안 함
  }
  return (await copyText(text)) ? "copied" : "failed";
}
