"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// 주요 테이블 변경을 실시간 감지해 현재 화면을 자동 새로고침(디바운스).
// Supabase에서 해당 테이블의 Realtime이 켜져 있어야 동작(안 켜져도 기존 폴링으로 동작).
const TABLES = ["todos", "todo_comments", "notifications", "approval_requests", "ai_outputs"];

export default function RealtimeRefresh() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let supabase;
    try {
      supabase = createSupabaseBrowserClient();
    } catch {
      return;
    }

    const trigger = () => {
      window.dispatchEvent(new CustomEvent("realtime-change"));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 500);
    };

    let channel = supabase.channel("app-realtime");
    for (const table of TABLES) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, trigger);
    }
    channel.subscribe();

    return () => {
      if (timer.current) clearTimeout(timer.current);
      try {
        supabase.removeChannel(channel);
      } catch {
        /* ignore */
      }
    };
  }, [router]);

  return null;
}
