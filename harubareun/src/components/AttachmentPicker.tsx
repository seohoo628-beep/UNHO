"use client";

import { useState } from "react";
import { uploadAttachment } from "@/lib/uploadAttachment";

export type Attachment = { url: string; name: string };

// 여러 파일 업로드 + 숨은 인풋(files_json)으로 폼에 전달. native FormData가 읽는다.
export default function AttachmentPicker({ initial }: { initial?: Attachment[] }) {
  const [files, setFiles] = useState<Attachment[]>(initial ?? []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    if (!list.length) return;
    setBusy(true);
    setErr(null);
    const added: Attachment[] = [];
    for (const f of list) {
      const r = await uploadAttachment(f, "todo-files");
      if (!r.ok) {
        setErr(r.error ?? "업로드 실패");
        break;
      }
      added.push({ url: r.url ?? "", name: r.name ?? "file" });
    }
    setFiles((prev) => [...prev, ...added]);
    setBusy(false);
    e.target.value = ""; // 같은 파일 재선택 허용
  };

  const remove = (url: string) => setFiles((prev) => prev.filter((f) => f.url !== url));

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input type="file" multiple onChange={onFiles} disabled={busy} style={{ fontSize: 13 }} />
        {busy && <span className="muted" style={{ fontSize: 12 }}>업로드 중…</span>}
      </div>
      {files.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
          {files.map((f) => (
            <span key={f.url} className="badge" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              📎 {f.name}
              <button
                type="button"
                onClick={() => remove(f.url)}
                style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--owner)" }}
                title="첨부 제거"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      {err && <div style={{ color: "var(--owner)", fontSize: 12, marginTop: 4 }}>{err}</div>}
      <input type="hidden" name="files_json" value={JSON.stringify(files)} />
    </div>
  );
}
