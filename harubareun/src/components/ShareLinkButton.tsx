"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { copyText } from "@/lib/clipboard";
import { toast } from "@/lib/toast";

// 현재 플랫폼(첫 경로 세그먼트) 루트 링크를 공유/복사하는 버튼.
//  • 모바일: navigator.share 로 카톡·문자 등으로 바로 전달.
//  • 데스크톱/미지원: 클립보드에 복사 후 '복사됨!' 표시.
export default function ShareLinkButton({ label = "링크 전달" }: { label?: string }) {
  const pathname = usePathname();
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const seg = (pathname || "/").split("/")[1] || "";
    const url = `${window.location.origin}/${seg}`;
    const title = typeof document !== "undefined" ? document.title : "매장관리";

    // 모바일 공유 시트(카톡·문자 등) 우선.
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({ title, url });
        return;
      } catch (e: any) {
        if (e && e.name === "AbortError") return; // 사용자가 취소 → 아무 것도 안 함
        // 그 외 오류는 복사로 폴백
      }
    }
    const r = await copyText(url);
    if (r) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } else {
      toast("복사에 실패했습니다. 주소창의 링크를 직접 복사해 주세요.", "err");
    }
  };

  return (
    <button
      className="btn ghost sm"
      title="이 플랫폼 링크를 공유/복사"
      onClick={share}
    >
      {copied ? "✅ 복사됨!" : `🔗 ${label}`}
    </button>
  );
}
