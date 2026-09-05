"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  listMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  savePushSubscription,
  deletePushSubscription,
  type AppNotification,
} from "@/app/(app)/notifications/actions";
import { toast } from "@/lib/toast";

function fmtWhen(iso: string): string {
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return "방금";
    if (min < 60) return `${min}분 전`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}시간 전`;
    return d.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" });
  } catch {
    return "";
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

const TYPE_ICON: Record<string, string> = {
  todo_assigned: "📋",
  mention: "💬",
  todo_due: "⏰",
  leave: "🌴",
  general: "🔔",
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [missing, setMissing] = useState(false);
  const [pushState, setPushState] = useState<"unknown" | "on" | "off" | "unsupported">("unknown");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const r = await listMyNotifications();
    if (r.ok) {
      setItems(r.items ?? []);
      setUnread(r.unread ?? 0);
      setMissing(false);
    } else if (r.tableMissing) {
      setMissing(true);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    const onRealtime = () => load();
    window.addEventListener("realtime-change", onRealtime);
    return () => {
      clearInterval(t);
      window.removeEventListener("realtime-change", onRealtime);
    };
  }, [load]);

  // 현재 푸시 구독 상태 파악
  useEffect(() => {
    (async () => {
      if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        setPushState("unsupported");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setPushState(sub ? "on" : "off");
      } catch {
        setPushState("off");
      }
    })();
  }, []);

  // 바깥 클릭 닫기
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const onItem = async (n: AppNotification) => {
    if (!n.readAt) {
      await markNotificationRead(n.id);
      setUnread((u) => Math.max(0, u - 1));
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
    }
    setOpen(false);
    if (n.link) router.push(n.link);
  };

  const markAll = async () => {
    await markAllNotificationsRead();
    setUnread(0);
    setItems((prev) => prev.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })));
  };

  const enablePush = async () => {
    const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapid) {
      toast("모바일 알림 발송 키(VAPID)가 아직 설정되지 않았습니다. 관리자에게 요청하세요.", "err");
      return;
    }
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        toast("알림 권한이 거부되었습니다. 브라우저 설정에서 허용해 주세요.", "err");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid) as unknown as BufferSource,
      });
      const json = sub.toJSON();
      const r = await savePushSubscription({
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
      });
      if (!r.ok) {
        toast(r.tableMissing ? "알림 저장소가 아직 준비되지 않았습니다." : r.error ?? "구독 실패", "err");
        return;
      }
      setPushState("on");
      toast("모바일 알림이 켜졌습니다. 이제 업무 배정·멘션 시 폰으로 알림이 옵니다.", "ok");
    } catch (e) {
      toast("모바일 알림 설정에 실패했습니다: " + (e instanceof Error ? e.message : ""), "err");
    } finally {
      setBusy(false);
    }
  };

  const disablePush = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await deletePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setPushState("off");
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        className="btn sm"
        onClick={() => setOpen((o) => !o)}
        title="알림"
        style={{ position: "relative", padding: "5px 9px" }}
      >
        🔔
        {unread > 0 && (
          <span
            style={{
              position: "absolute",
              top: -5,
              right: -5,
              background: "var(--owner, #ef4444)",
              color: "#fff",
              borderRadius: 10,
              fontSize: 10,
              fontWeight: 700,
              minWidth: 16,
              height: 16,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 4px",
            }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="card"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 6px)",
            width: 320,
            maxWidth: "90vw",
            maxHeight: 440,
            overflowY: "auto",
            zIndex: 1000,
            padding: 10,
            boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <b style={{ fontSize: 14 }}>알림</b>
            {unread > 0 && (
              <button className="btn sm" onClick={markAll}>모두 읽음</button>
            )}
          </div>

          {/* 모바일 알림 토글 */}
          {pushState !== "unsupported" && (
            <div style={{ marginBottom: 8 }}>
              {pushState === "on" ? (
                <button className="btn sm" disabled={busy} onClick={disablePush} style={{ width: "100%" }}>
                  🔕 모바일 알림 끄기
                </button>
              ) : (
                <button className="btn sm primary" disabled={busy} onClick={enablePush} style={{ width: "100%" }}>
                  🔔 이 기기로 모바일 알림 받기
                </button>
              )}
            </div>
          )}

          {missing ? (
            <div className="muted" style={{ fontSize: 12.5, padding: "8px 2px" }}>
              알림 저장소가 아직 준비되지 않았습니다. 관리자에게 DB 설정(0044) 실행을 요청하세요.
            </div>
          ) : items.length === 0 ? (
            <div className="empty" style={{ fontSize: 13 }}>새 알림이 없습니다.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => onItem(n)}
                  style={{
                    textAlign: "left",
                    border: "none",
                    borderRadius: 8,
                    padding: "8px 10px",
                    cursor: "pointer",
                    background: n.readAt ? "transparent" : "var(--accent-bg, #eef2ff)",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: n.readAt ? 400 : 600, display: "flex", gap: 6 }}>
                    <span>{TYPE_ICON[n.type] ?? "🔔"}</span>
                    <span style={{ flex: 1 }}>{n.title}</span>
                  </div>
                  {n.body && (
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 2, whiteSpace: "pre-wrap", maxHeight: 40, overflow: "hidden" }}>
                      {n.body}
                    </div>
                  )}
                  <div className="muted" style={{ fontSize: 10.5, marginTop: 2 }}>{fmtWhen(n.createdAt)}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
