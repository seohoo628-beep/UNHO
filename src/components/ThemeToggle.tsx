"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = (() => {
      try {
        return localStorage.getItem("theme");
      } catch {
        return null;
      }
    })();
    const isDark =
      saved === "dark" ||
      (saved !== "light" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
    setDark(!!isDark);
    setReady(true);
  }, []);

  const toggle = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* ignore */
    }
    setDark(!dark);
  };

  if (!ready) return null;
  return (
    <button className="theme-toggle" onClick={toggle} title="라이트/다크 전환" aria-label="테마 전환">
      {dark ? "☀️ 라이트" : "🌙 다크"}
    </button>
  );
}
