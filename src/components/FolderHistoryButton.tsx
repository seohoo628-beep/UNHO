"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { listFolderSnapshots, snapshotFolderNow, restoreFolderSnapshot, ensureFolderSnapshot, type FolderSnapMeta } from "@/lib/folderSnapshots";

function fmtDateTime(s: string) {
  try { return new Date(s).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  catch { return s; }
}

// 폴더(테이블) 전체를 한 시점으로 통째로 되돌리는 "노션식 전체 복원" 버튼+모달.
// entity=테이블명, label=사람이 읽는 폴더 이름.
export default function FolderHistoryButton({ entity, label, className = "btn" }: { entity: string; label: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} onClick={() => setOpen(true)} title={`${label} 전체를 특정 시점으로 되돌리기`}>🕘 전체 되돌리기</button>
      {open && <FolderHistoryModal entity={entity} label={label} onClose={() => setOpen(false)} />}
    </>
  );
}

function FolderHistoryModal({ entity, label, onClose }: { entity: string; label: string; onClose: () => void }) {
  const [items, setItems] = useState<FolderSnapMeta[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const load = async () => {
    const r = await listFolderSnapshots(entity);
    if (r.ok) setItems(r.items ?? []);
    else setErr(r.error ?? "불러오기 실패");
  };

  useEffect(() => {
    (async () => {
      // 열 때 현재 상태를 자동 백업 지점으로 확보(오래됐거나 없으면).
      await ensureFolderSnapshot(entity);
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity]);

  const backupNow = () => {
    setErr(null); setMsg(null);
    start(async () => {
      const r = await snapshotFolderNow(entity);
      if (r.ok) { setMsg(`✅ 지금 상태를 백업했어요 (${r.count ?? 0}건).`); await load(); }
      else setErr(r.error ?? "백업 실패");
    });
  };

  const restore = (snapId: string, at: string) => {
    if (!confirm(`「${label}」 폴더 전체를 ${fmtDateTime(at)} 시점으로 되돌릴까요?\n\n그 시점 이후의 추가·수정·삭제가 모두 그때 상태로 바뀝니다. (되돌리기 직전 상태도 자동 백업되어 다시 복구할 수 있습니다)`)) return;
    setErr(null); setMsg(null);
    start(async () => {
      const r = await restoreFolderSnapshot(entity, snapId);
      if (r.ok) { setMsg(`✅ ${fmtDateTime(at)} 시점으로 복원했어요 (복구 ${r.restored ?? 0}건${r.deleted ? `, 이후 추가분 ${r.deleted}건 삭제` : ""}).`); await load(); router.refresh(); }
      else setErr(r.error ?? "복원 실패");
    });
  };

  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, background: "rgba(16,20,24,0.5)", display: "grid", placeItems: "center", zIndex: 160, padding: 16 }}>
      <div className="card" onMouseDown={(e) => e.stopPropagation()} style={{ padding: 18, width: "100%", maxWidth: 560, maxHeight: "88vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>🕘 전체 되돌리기 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>· {label}</span></h3>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn sm" onClick={backupNow} disabled={pending}>＋ 지금 백업</button>
            <button className="btn sm" onClick={onClose}>닫기 ✕</button>
          </div>
        </div>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>노션처럼 폴더 전체를 원하는 시점으로 되돌립니다. 3시간마다 자동 백업되고, 필요할 때 「지금 백업」으로 지점을 남길 수 있어요.</div>
        {msg && <div style={{ color: "var(--accent)", fontSize: 12.5, marginBottom: 8 }}>{msg}</div>}
        {err && <div style={{ color: "var(--owner)", fontSize: 12.5, marginBottom: 8 }}>{err}</div>}
        {!items ? <div className="muted" style={{ fontSize: 13 }}>불러오는 중…</div> :
          items.length === 0 ? <div className="card muted" style={{ padding: 20, textAlign: "center" }}>아직 백업 지점이 없습니다. 「지금 백업」을 누르거나, 잠시 후 자동 백업이 쌓입니다.</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map((r) => (
                <div key={r.id} className="card" style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>🕒 {fmtDateTime(r.createdAt)}
                    <span className="muted" style={{ fontWeight: 400 }}> · {r.rowCount}건{r.note ? ` · ${r.note}` : ""}</span>
                  </div>
                  <button className="btn sm primary" onClick={() => restore(r.id, r.createdAt)} disabled={pending}>이 시점으로 전체 복원</button>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
