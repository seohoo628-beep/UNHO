"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getCeoRevisions, applyCeoRevision, type CeoRevision } from "@/lib/ceoRevisions";

function fmtDateTime(s: string) {
  try { return new Date(s).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  catch { return s; }
}

// 대표 전용 폴더 공용 버전 기록·복원 모달.
// entity=테이블명, recordId=행 id, preview=스냅샷 → 한 줄 미리보기.
export default function RevisionHistoryModal({
  entity, recordId, title, preview, onClose, onRestored,
}: {
  entity: string; recordId: string; title?: string;
  preview: (snapshot: any) => string;
  onClose: () => void; onRestored?: () => void;
}) {
  const [items, setItems] = useState<CeoRevision[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const r = await getCeoRevisions(entity, recordId);
      if (r.ok) setItems(r.items ?? []);
      else setErr(r.error ?? "불러오기 실패");
    })();
  }, [entity, recordId]);

  const restore = (revId: string) => {
    if (!confirm("이 버전으로 복원할까요? (현재 내용은 기록에 자동 저장됩니다)")) return;
    start(async () => {
      const r = await applyCeoRevision(entity, recordId, revId);
      if (r.ok) { onRestored?.(); router.refresh(); onClose(); }
      else setErr(r.error ?? "복원 실패");
    });
  };

  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, background: "rgba(16,20,24,0.5)", display: "grid", placeItems: "center", zIndex: 160, padding: 16 }}>
      <div className="card" onMouseDown={(e) => e.stopPropagation()} style={{ padding: 18, width: "100%", maxWidth: 560, maxHeight: "88vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>🕘 버전 기록 · 복원</h3>
          <button className="btn sm" onClick={onClose}>닫기 ✕</button>
        </div>
        {title && <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>날짜·시간을 눌러 그 시점으로 복원합니다. &ldquo;{title}&rdquo;</div>}
        {err && <div style={{ color: "var(--owner)", fontSize: 12.5, marginBottom: 8 }}>{err}</div>}
        {!items ? <div className="muted" style={{ fontSize: 13 }}>불러오는 중…</div> :
          items.length === 0 ? <div className="card muted" style={{ padding: 20, textAlign: "center" }}>아직 저장 기록이 없습니다. 내용을 수정·저장하면 이전 버전이 여기에 쌓입니다.</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map((r) => (
                <div key={r.id} className="card" style={{ padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>🕒 {fmtDateTime(r.createdAt)}{r.note && <span className="muted" style={{ fontWeight: 400 }}> · {r.note}</span>}</div>
                    <button className="btn sm primary" onClick={() => restore(r.id)} disabled={pending}>이 버전으로 복원</button>
                  </div>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 6, whiteSpace: "pre-wrap", maxHeight: 90, overflow: "hidden" }}>{preview(r.snapshot).slice(0, 260)}</div>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
