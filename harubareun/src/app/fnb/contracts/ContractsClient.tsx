"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@fnb/components/ui";
import { STORES, storeName } from "@fnb/lib/stores";
import { uploadAsset, deleteAsset } from "@/lib/storeAssets";
import type { AssetFileRow } from "@/lib/storeSharedRead";

const PLATFORM = "fnb" as const;
const TEMPLATE_URL = "/standard-labor-contract.html";

export default function ContractsClient({ files, dbReady, publicBase }: {
  files: AssetFileRow[]; dbReady: boolean; publicBase: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const [upOpen, setUpOpen] = useState(false);

  const run = (p: Promise<{ ok: boolean; error?: string }>) =>
    start(async () => { const r = await p; if (r.ok) { setErr(""); router.refresh(); } else setErr(r.error ?? "오류"); });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>근로계약서</h1>
          <p>직원별 작성한 근로계약서 파일을 보관 · 표준양식 다운로드{pending ? " · 처리 중…" : ""}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a className="btn" href={TEMPLATE_URL} target="_blank" rel="noreferrer">📄 표준근로계약서 양식</a>
          <button className="btn primary" style={{ flex: "0 0 auto" }} disabled={!dbReady || pending} onClick={() => setUpOpen(true)} title={dbReady ? "" : "DB 설정 필요"}>+ 계약서 올리기</button>
        </div>
      </div>

      {err && <div className="card card-pad" style={{ marginBottom: 12, color: "var(--red)" }}>{err}</div>}

      {!dbReady && (
        <Card pad>
          <div className="muted" style={{ fontSize: 13 }}>파일 보관을 켜려면 DB 테이블이 필요합니다. 자료실과 동일한 <code>0025_store_assets.sql</code>을 Supabase에 실행해 주세요.</div>
        </Card>
      )}

      <Card title="🧾 표준근로계약서 양식" pad>
        <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.7 }}>
          고용노동부 표준근로계약서를 기준으로 한 양식입니다. <a href={TEMPLATE_URL} target="_blank" rel="noreferrer" style={{ color: "var(--brand)", fontWeight: 600 }}>양식 열기 →</a> 후 인쇄/PDF 저장하여 작성하시고, 서명본을 스캔·촬영해 아래에 올려 보관하세요.
        </div>
      </Card>

      <div className="mt-24">
        <Card title={`📂 보관된 근로계약서 (${files.length})`} pad={files.length === 0}>
          {files.length === 0 ? (
            <div className="muted" style={{ fontSize: 13.5 }}>아직 올린 계약서가 없습니다. ‘+ 계약서 올리기’로 직원별 서명본을 보관하세요.</div>
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr><th>직원/제목</th><th>매장</th><th>파일</th><th></th></tr>
                </thead>
                <tbody>
                  {files.map((f) => (
                    <tr key={f.id}>
                      <td style={{ fontWeight: 600 }}>{f.title || f.fileName}</td>
                      <td className="muted">{f.store === "all" ? "-" : storeName(f.store as any)}</td>
                      <td className="muted" style={{ fontSize: 12 }}>{f.fileName}</td>
                      <td>
                        <div className="row" style={{ gap: 6 }}>
                          <a className="btn primary sm" href={publicBase + f.filePath} download target="_blank" rel="noreferrer">⬇ 다운로드</a>
                          <button className="btn sm" style={{ color: "var(--red)" }} disabled={pending} onClick={() => run(deleteAsset(f.id, PLATFORM, f.filePath))}>삭제</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {upOpen && (
        <UploadModal
          pending={pending}
          onClose={() => setUpOpen(false)}
          onSubmit={(fd) => {
            fd.set("platform", PLATFORM);
            fd.set("section", "contract");
            run(uploadAsset(fd));
            setUpOpen(false);
          }}
        />
      )}
    </>
  );
}

function UploadModal({ onClose, onSubmit, pending }: { onClose: () => void; onSubmit: (fd: FormData) => void; pending: boolean }) {
  const [store, setStore] = useState<string>(STORES[0].id);
  const submit = () => {
    const form = document.getElementById("contract-up-form") as HTMLFormElement;
    const fd = new FormData(form);
    fd.set("store", store);
    onSubmit(fd);
  };
  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, background: "rgba(16,24,40,0.5)", display: "grid", placeItems: "center", zIndex: 100, padding: 20 }}>
      <div className="card card-pad" onMouseDown={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 460 }}>
        <h3 style={{ marginTop: 0 }}>근로계약서 올리기</h3>
        <form id="contract-up-form" onSubmit={(e) => e.preventDefault()}>
          <div className="stack">
            <div><div className="form-label">매장</div>
              <select className="field" value={store} onChange={(e) => setStore(e.target.value)}>
                {STORES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div><div className="form-label">직원명/제목</div><input className="field" name="title" placeholder="예: 김영일 근로계약서" /></div>
            <div><div className="form-label">파일 (스캔·사진·PDF · 50MB 이하)</div><input type="file" name="file" /></div>
          </div>
        </form>
        <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn primary" disabled={pending} onClick={submit}>업로드</button>
        </div>
      </div>
    </div>
  );
}
