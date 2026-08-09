"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStartupBriefing, type Briefing } from "@/app/(app)/briefing/actions";

const SESSION_KEY = "briefing-shown-v1";

export default function StartupBriefing() {
  const [brief, setBrief] = useState<Briefing | null>(null);
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let shown = false;
    try {
      shown = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      /* ignore */
    }
    if (shown) return;
    (async () => {
      try {
        const b = await getStartupBriefing();
        if (b.count > 0) {
          setBrief(b);
          setOpen(true);
        }
        try { sessionStorage.setItem(SESSION_KEY, "1"); } catch { /* ignore */ }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  if (!open || !brief) return null;

  const go = (link: string) => {
    setOpen(false);
    if (link && link !== "/") router.push(link);
  };

  const Section = ({ icon, title, items, tone }: { icon: string; title: string; items: Briefing["dueSoon"]; tone?: string }) => {
    if (items.length === 0) return null;
    return (
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6, color: tone || "var(--ink)" }}>
          {icon} {title} <span className="muted" style={{ fontWeight: 400 }}>{items.length}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {items.map((it, i) => (
            <button
              key={i}
              onClick={() => go(it.link)}
              style={{ textAlign: "left", border: "none", borderRadius: 8, padding: "8px 10px", cursor: "pointer", background: "var(--surface-2, #f5f6f8)" }}
            >
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>{it.title}</div>
              {it.sub && <div className="muted" style={{ fontSize: 11.5, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.sub}</div>}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div
      onClick={() => setOpen(false)}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ width: "100%", maxWidth: 460, maxHeight: "85vh", overflowY: "auto", padding: 18 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>👋 오늘의 브리핑</div>
          <button className="btn sm" onClick={() => setOpen(false)}>닫기</button>
        </div>

        <Section icon="🎂" title="오늘 생일" items={brief.birthdays} tone="#db2777" />
        <Section icon="🔒" title="CEO 투두 (당장실행·리마인드·고정)" items={brief.ceoTodos} tone="var(--accent)" />
        <Section icon="⏰" title="마감 임박 업무" items={brief.dueSoon} tone="var(--owner, #b91c1c)" />
        <Section icon="📧" title="새 이메일" items={brief.emails} tone="var(--accent)" />
        <Section icon="🔔" title="새 알림" items={brief.notifications} />

        {brief.emailMore && <div className="muted" style={{ fontSize: 12, marginTop: -6, marginBottom: 10 }}>· 안 읽은 이메일이 더 있습니다.</div>}

        <div className="btn-row">
          <button className="btn primary" style={{ width: "100%" }} onClick={() => setOpen(false)}>확인</button>
        </div>
      </div>
    </div>
  );
}
