"use client";

import { useState } from "react";
import { uploadAttachment } from "@/lib/uploadAttachment";

// 파일 업로드 + 숨은 인풋(file_url/file_name)으로 폼에 값 전달. native FormData가 읽는다.
export default function AttachmentPicker({
  initialUrl,
  initialName,
}: {
  initialUrl?: string | null;
  initialName?: string | null;
}) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [name, setName] = useState(initialName ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    setErr(null);
    const r = await uploadAttachment(f, "todo-files");
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? "업로드 실패");
      return;
    }
    setUrl(r.url ?? "");
    setName(r.name ?? "");
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input type="file" onChange={onFile} disabled={busy} style={{ fontSize: 13 }} />
        {busy && <span className="muted" style={{ fontSize: 12 }}>업로드 중…</span>}
        {name && !busy && (
          <span className="badge" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            📎 {name}
            <button
              type="button"
              onClick={() => {
                setUrl("");
                setName("");
              }}
              style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--owner)" }}
              title="첨부 제거"
            >
              ✕
            </button>
          </span>
        )}
      </div>
      {err && <div style={{ color: "var(--owner)", fontSize: 12, marginTop: 4 }}>{err}</div>}
      <input type="hidden" name="file_url" value={url} />
      <input type="hidden" name="file_name" value={name} />
    </div>
  );
}
