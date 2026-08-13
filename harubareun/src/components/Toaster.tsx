"use client";

import { useEffect, useState } from "react";
import type { ToastType } from "@/lib/toast";

type Item = { id: number; message: string; type: ToastType };

let seq = 1;

export default function Toaster() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const d = (e as CustomEvent).detail as { message: string; type?: ToastType };
      if (!d?.message) return;
      const id = seq++;
      setItems((prev) => [...prev, { id, message: d.message, type: d.type ?? "info" }]);
      setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 2800);
    };
    window.addEventListener("app-toast", onToast as EventListener);
    return () => window.removeEventListener("app-toast", onToast as EventListener);
  }, []);

  if (items.length === 0) return null;
  return (
    <div className="toast-wrap" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>
          <span className="tico">{t.type === "ok" ? "✅" : t.type === "err" ? "⚠️" : "💬"}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
