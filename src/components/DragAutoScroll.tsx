"use client";

import { useEffect } from "react";

// HTML5 드래그 중 화면 가장자리에 커서가 가까우면 자동 스크롤(위/아래).
// 브라우저 기본 자동스크롤이 동작하지 않는 경우(긴 목록에서 상단으로 못 올라감) 보완.
export default function DragAutoScroll() {
  useEffect(() => {
    const EDGE = 90;      // 가장자리 감지 범위(px)
    const MAX_SPEED = 22; // 최대 스크롤 속도(px/frame)
    let vy = 0;
    let raf = 0;

    const scroller = (): HTMLElement | null => {
      const m = document.querySelector(".main") as HTMLElement | null;
      if (m && m.scrollHeight > m.clientHeight + 4) return m;
      return null; // null이면 window 스크롤
    };

    const step = () => {
      if (!vy) { raf = 0; return; }
      const el = scroller();
      if (el) el.scrollTop += vy;
      else window.scrollBy(0, vy);
      raf = requestAnimationFrame(step);
    };

    const onDragOver = (e: DragEvent) => {
      const y = e.clientY;
      if (y <= 0) return;
      const h = window.innerHeight;
      if (y < EDGE) vy = -Math.ceil(((EDGE - y) / EDGE) * MAX_SPEED);
      else if (y > h - EDGE) vy = Math.ceil(((y - (h - EDGE)) / EDGE) * MAX_SPEED);
      else vy = 0;
      if (vy && !raf) raf = requestAnimationFrame(step);
    };
    const stop = () => { vy = 0; if (raf) { cancelAnimationFrame(raf); raf = 0; } };

    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", stop, true);
    document.addEventListener("dragend", stop, true);
    return () => {
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", stop, true);
      document.removeEventListener("dragend", stop, true);
      stop();
    };
  }, []);

  return null;
}
