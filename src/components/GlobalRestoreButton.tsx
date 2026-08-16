"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { listAllSnapshots, snapshotAllNow, restoreAllSnapshot, ensureAllSnapshot, type FolderSnapMeta } from "@/lib/folderSnapshots";

function fmtDateTime(s: string) {
  try { return new Date(s).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  catch { return s; }
}

// 홈화면 전용: 플랫폼 전체(모든 폴더 내용)를 한 시점으로 되돌리는 버튼+모달. 대표만.
export default function GlobalRestoreButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)} title="모든 폴더의 내용을 특정 시점으로 되돌리기" style={{ fontSize: 13 }}>🕘 전체 되돌리기</button>
      {open && <GlobalRestoreModal onClose={() => setOpen(false)} />}
    </>
  );
}

function GlobalRestoreModal({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<FolderSnapMeta[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const load = async () => {
    const r = await listAllSnapshots();
    if (r.ok) setItems(r.items ?? []);
    else setErr(r.error ?? "불러오기 실패");
  };

  useEffect(() => {
    (async () => { await ensureAllSnapshot(); await load(); })();
  }, []);

  const backupNow = () => {
    setErr(null); setMsg(null);
    start(async () => {
      const r = await snapshotAllNow();
      if (r.ok) { setMsg(`✅ 지금 전체 상태를 백업했어요 (총 ${r.count ?? 0}건).`); await load(); }
      else setErr(r.error ?? "백업 실패");
    });
  };

  const restore = (snapId: string, at: string) => {
    if (!confirm(`플랫폼 전체(모든 폴더)를 ${fmtDateTime(at)} 시점으로 되돌릴까요?\n\n모든 폴더의 그 시점 이후 추가·수정·삭제가 전부 그때 상태로 바뀝니다. (되돌리기 직전 전체 상태도 자동 백업되어 다시 복구할 수 있습니다)`)) return;
    setErr(null); setMsg(null);
    start(async () => {
      const r = await restoreAllSnapshot(snapId);
      if (r.ok) { setMsg(`✅ ${fmtDateTime(at)} 시점으로 전체 복원했어요 (폴더 ${r.folders ?? 0}개 · 복구 ${r.restored ?? 0}건${r.deleted ? ` · 이후 추가분 ${r.deleted}건 삭제` : ""}).`); await load(); router.refresh(); }
      else setErr(r.error ?? "복원 실패");
    });
  };

  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, background: "rgba(16,20,24,0.5)", display: "grid", placeItems: "center", zIndex: 160, padding: 16 }}>
      <div className="card" onMouseDown={(e) => e.stopPropagation()} style={{ padding: 18, width: "100%", maxWidth: 580, maxHeight: "88vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>🕘 전체 되돌리기 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>· 모든 폴더</span></h3>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn sm" onClick={backupNow} disabled={pending}>＋ 지금 전체 백업</button>
            <button className="btn sm" onClick={onClose}>닫기 ✕</button>
          </div>
        </div>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>노션처럼 플랫폼 전체를 원하는 시점으로 되돌립니다. CEO 투두·리마인드·아이디어·인적자산·틱톡·명함·미팅·업무투두·미수금·미지급 등 등록된 모든 폴더가 한꺼번에 복원됩니다. 6시간마다 자동 백업됩니다.</div>
        {msg && <div style={{ color: "var(--accent)", fontSize: 12.5, marginBottom: 8 }}>{msg}</div>}
        {err && <div style={{ color: "var(--owner)", fontSize: 12.5, marginBottom: 8 }}>{err}</div>}
        {!items ? <div className="muted" style={{ fontSize: 13 }}>불러오는 중…</div> :
          items.length === 0 ? <div className="card muted" style={{ padding: 20, textAlign: "center" }}>아직 전체 백업 지점이 없습니다. 「지금 전체 백업」을 누르거나, 잠시 후 자동 백업이 쌓입니다.</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map((r) => (
                <div key={r.id} className="card" style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>🕒 {fmtDateTime(r.createdAt)}
                    <span className="muted" style={{ fontWeight: 400 }}> · 총 {r.rowCount}건{r.note ? ` · ${r.note}` : ""}</span>
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
