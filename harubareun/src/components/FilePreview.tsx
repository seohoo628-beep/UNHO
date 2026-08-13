"use client";

import { useEffect, useState } from "react";

export type PreviewFile = { url: string; name: string };

const VIDEO_RE = /\.(mp4|mov|webm|m4v|avi|mkv|ogv)$/i;
const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|bmp|heic|avif)$/i;
const PDF_RE = /\.pdf$/i;
const EXCEL_RE = /\.(xlsx|xls|xlsm|xlsb|csv|ods|tsv)$/i;
const key = (f: PreviewFile) => (f.name && f.name.includes(".") ? f.name : (f.url || "").split("?")[0]);
const isVideo = (f: PreviewFile) => VIDEO_RE.test(key(f));
const isImage = (f: PreviewFile) => IMAGE_RE.test(key(f));
const isPdf = (f: PreviewFile) => PDF_RE.test(key(f));
const isExcel = (f: PreviewFile) => EXCEL_RE.test(key(f));
const viewable = (f: PreviewFile) => isVideo(f) || isImage(f) || isPdf(f) || isExcel(f);

// 저장소 파일을 blob으로 받아 강제 저장(다운로드), 실패 시 새 탭.
async function downloadFile(f: PreviewFile) {
  try {
    const res = await fetch(f.url);
    if (!res.ok) throw new Error();
    const blob = await res.blob();
    const obj = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = obj; el.download = f.name || "download";
    document.body.appendChild(el); el.click(); el.remove();
    setTimeout(() => URL.revokeObjectURL(obj), 5000);
  } catch {
    window.open(f.url, "_blank", "noopener");
  }
}

// 첨부파일 칩 목록 + 클릭 시 앱 내 인라인 미리보기(이미지·영상·PDF). 그 외 형식은 새 탭.
export default function FilePreview({ files }: { files: PreviewFile[] | null | undefined }) {
  const [cur, setCur] = useState<PreviewFile | null>(null);
  if (!files || files.length === 0) return null;
  return (
    <>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
        {files.map((f, i) =>
          viewable(f) ? (
            <button key={i} type="button" className="btn sm" title={f.name} onClick={() => setCur(f)}>
              {isVideo(f) ? "🎬" : isPdf(f) ? "📄" : isExcel(f) ? "📊" : "🖼"} {f.name}
            </button>
          ) : (
            <a key={i} href={f.url} target="_blank" rel="noreferrer" className="btn sm" title={f.name}>📎 {f.name}</a>
          )
        )}
      </div>
      {cur && <PreviewModal f={cur} onClose={() => setCur(null)} />}
    </>
  );
}

function PreviewModal({ f, onClose }: { f: PreviewFile; onClose: () => void }) {
  const video = isVideo(f);
  const pdf = isPdf(f);
  const excel = isExcel(f);
  const image = !video && !pdf && !excel && isImage(f);
  const wide = video || pdf || excel;
  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, background: "rgba(6,8,12,0.86)", display: "grid", placeItems: "center", zIndex: 200, padding: 16 }}>
      <div onMouseDown={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: excel ? 1100 : wide ? 960 : 720, maxHeight: "92vh", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, color: "#fff" }}>
          <strong style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name || "미리보기"}</strong>
          <div style={{ display: "flex", gap: 6 }}>
            <a href={f.url} target="_blank" rel="noreferrer" className="btn sm" style={{ textDecoration: "none" }}>새 탭 ↗</a>
            <button type="button" className="btn sm" onClick={() => downloadFile(f)}>⬇ 저장</button>
            <button type="button" className="btn sm" onClick={onClose}>닫기 ✕</button>
          </div>
        </div>
        <div style={{ background: excel ? "#fff" : "#000", borderRadius: 10, overflow: "hidden", display: "grid", placeItems: excel ? "stretch" : "center", minHeight: 120 }}>
          {video ? (
            <video src={f.url} controls autoPlay playsInline style={{ width: "100%", maxHeight: "80vh", display: "block", background: "#000" }} />
          ) : pdf ? (
            <iframe src={f.url} title={f.name} style={{ width: "100%", height: "80vh", border: "none", background: "#fff" }} />
          ) : excel ? (
            <ExcelViewer url={f.url} />
          ) : image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={f.url} alt={f.name} style={{ width: "100%", maxHeight: "84vh", objectFit: "contain", display: "block" }} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

// 엑셀/CSV를 SheetJS로 파싱해 표로 렌더(브라우저가 xlsx를 못 열어 다운로드되는 문제 우회).
function ExcelViewer({ url }: { url: string }) {
  const [sheets, setSheets] = useState<{ name: string; html: string }[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const XLSX = await import("xlsx");
        const res = await fetch(url);
        if (!res.ok) throw new Error("파일을 불러오지 못했습니다.");
        const buf = await res.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const out = wb.SheetNames.map((n) => ({ name: n, html: XLSX.utils.sheet_to_html(wb.Sheets[n], { editable: false }) }));
        if (!cancel) setSheets(out.length ? out : [{ name: "(빈 파일)", html: "<div style='padding:20px'>내용이 없습니다.</div>" }]);
      } catch (e: any) {
        if (!cancel) setErr(e?.message || "엑셀 미리보기 실패");
      }
    })();
    return () => { cancel = true; };
  }, [url]);

  if (err) return <div style={{ padding: 24, color: "#b91c1c", fontSize: 13 }}>{err} — 우측 상단 &lsquo;저장&rsquo;으로 내려받아 열어주세요.</div>;
  if (!sheets) return <div style={{ padding: 24, color: "#334155", fontSize: 13 }}>표를 불러오는 중…</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "82vh", minHeight: 0 }}>
      {sheets.length > 1 && (
        <div style={{ display: "flex", gap: 4, padding: 6, borderBottom: "1px solid #e2e8f0", flexWrap: "wrap", flexShrink: 0 }}>
          {sheets.map((s, i) => (
            <button key={i} type="button" className={`btn sm${i === active ? " primary" : ""}`} onClick={() => setActive(i)}>{s.name}</button>
          ))}
        </div>
      )}
      <div className="xlsx-preview" style={{ overflow: "auto", padding: 8, flex: 1, minHeight: 0 }} dangerouslySetInnerHTML={{ __html: sheets[active].html }} />
      <style>{`.xlsx-preview table{border-collapse:collapse;font-size:12.5px;color:#0f172a}.xlsx-preview td,.xlsx-preview th{border:1px solid #cbd5e1;padding:3px 7px;white-space:nowrap}.xlsx-preview tr:first-child td{background:#f1f5f9;font-weight:700}`}</style>
    </div>
  );
}
