"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBackup, restoreBackup, type BackupMeta } from "@/lib/backup";

const KIND_LABEL: Record<string, string> = {
  manual: "수동",
  auto: "자동",
  "pre-restore": "복원 전",
};

function fmt(iso: string) {
  try {
    const d = new Date(iso);
    const kst = new Date(d.getTime() + 9 * 3600 * 1000);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${kst.getUTCFullYear()}.${p(kst.getUTCMonth() + 1)}.${p(kst.getUTCDate())} ${p(kst.getUTCHours())}:${p(kst.getUTCMinutes())}`;
  } catch {
    return iso;
  }
}

// 홈(대표 전용) 전체 되돌리기 패널.
// - '지금 백업 만들기'로 현재 상태 스냅샷 저장
// - 저장된 시점(최대 1년) 목록에서 '이 시점으로 되돌리기'
export default function GlobalRestore({ backups }: { backups: BackupMeta[] }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<BackupMeta[]>(backups);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const doBackup = () => {
    setMsg(null); setErr(null);
    start(async () => {
      const r = await createBackup();
      if (!r.ok) { setErr(r.error || "백업 실패"); return; }
      if (r.warning) setErr(`⚠ ${r.warning}`);
      setMsg("현재 상태를 백업했습니다.");
      router.refresh();
    });
  };

  const doRestore = (id: string) => {
    setMsg(null); setErr(null); setConfirmId(null);
    start(async () => {
      const r = await restoreBackup(id);
      if (!r.ok) { setErr(r.error || "되돌리기 실패"); return; }
      if (r.warning) setErr(`⚠ ${r.warning}`);
      setMsg(`이 시점으로 되돌렸습니다 (${r.restored ?? 0}건 복원).`);
      router.refresh();
    });
  };

  return (
    <div style={{ marginTop: 24 }}>
      <button
        className="btn"
        onClick={() => setOpen((v) => !v)}
        style={{ fontWeight: 700 }}
        title="플랫폼 전체를 이전 시점으로 되돌리기 (대표 전용)"
      >
        🕘 전체 되돌리기 {open ? "▲" : "▼"}
      </button>

      {open && (
        <div className="card" style={{ padding: 14, marginTop: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14 }}>전체 백업 & 되돌리기</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
                업무·런칭·매출·직원 등 운영 데이터 전체를 스냅샷으로 보관합니다. 매일 자동 백업되며 최대 1년까지 보관됩니다.
              </div>
            </div>
            <button className="btn primary" disabled={pending} onClick={doBackup} style={{ flexShrink: 0 }}>
              {pending ? "처리 중…" : "＋ 지금 백업 만들기"}
            </button>
          </div>

          {msg && <div style={{ marginTop: 10, fontSize: 13, color: "#16a34a", fontWeight: 600 }}>✓ {msg}</div>}
          {err && <div style={{ marginTop: 10, fontSize: 13, color: "#dc2626", fontWeight: 600 }}>⚠ {err}</div>}

          <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
            {items.length === 0 && (
              <div className="muted" style={{ fontSize: 13 }}>아직 백업이 없습니다. ‘지금 백업 만들기’로 첫 스냅샷을 저장하세요.</div>
            )}
            {items.map((b) => (
              <div
                key={b.id}
                className="card"
                style={{ padding: "9px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", background: "rgba(148,163,184,.05)" }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>
                    {fmt(b.createdAt)}
                    <span
                      style={{
                        marginLeft: 8, fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 999,
                        background: b.kind === "manual" ? "rgba(99,102,241,.14)" : b.kind === "pre-restore" ? "rgba(245,158,11,.16)" : "rgba(148,163,184,.16)",
                        color: b.kind === "manual" ? "#6366f1" : b.kind === "pre-restore" ? "#d97706" : "var(--ink-2)",
                      }}
                    >
                      {KIND_LABEL[b.kind] ?? b.kind}
                    </span>
                  </div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                    {b.label || "백업"} · 총 {b.total.toLocaleString("ko-KR")}건
                    {b.failedTables?.length > 0 && (
                      <span style={{ marginLeft: 6, color: "#dc2626", fontWeight: 700 }}>⚠ {b.failedTables.join(" · ")}</span>
                    )}
                  </div>
                </div>
                {confirmId === b.id ? (
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button className="btn sm" disabled={pending} onClick={() => doRestore(b.id)} style={{ background: "#dc2626", color: "#fff", fontWeight: 700 }}>
                      정말 되돌리기
                    </button>
                    <button className="btn sm" disabled={pending} onClick={() => setConfirmId(null)}>취소</button>
                  </div>
                ) : (
                  <button className="btn sm" disabled={pending} onClick={() => { setConfirmId(b.id); setMsg(null); setErr(null); }} style={{ flexShrink: 0, fontWeight: 600 }}>
                    이 시점으로 되돌리기
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="muted" style={{ fontSize: 11, marginTop: 10 }}>
            ※ 되돌리기 전 현재 상태가 자동으로 한 번 더 백업되므로, 되돌린 뒤에도 다시 원래대로 돌아올 수 있습니다.
          </div>
        </div>
      )}
    </div>
  );
}
