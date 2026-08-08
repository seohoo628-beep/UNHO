"use client";

import { useEffect } from "react";

// 대운목장 전용 진입 URL. 다이닝 앱 스코프를 대운목장(dwmc)으로 지정 후 이동.
export default function DaeunEntry() {
  useEffect(() => {
    try {
      localStorage.setItem("unho-dining-store-v1", "dwmc");
    } catch {
      /* ignore */
    }
    window.location.replace("/dining");
  }, []);
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "70vh", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 40 }}>🐄</div>
        <div style={{ marginTop: 8, fontWeight: 700 }}>대운목장 관리로 이동 중…</div>
      </div>
    </div>
  );
}
