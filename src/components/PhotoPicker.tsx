"use client";

import { useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// 사진을 1600px JPEG로 줄여 Supabase 스토리지(generated-media/<folder>/)에 올리고 공개 URL을 돌려준다.
export async function uploadPhoto(file: File, folder = "misc"): Promise<string | null> {
  if (!file.type.startsWith("image")) return null;
  let blob: Blob | null = null;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as any).catch(() => createImageBitmap(file));
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.85));
  } catch { /* HEIC 등 디코드 실패 → 원본 업로드 */ }
  const body: Blob | File = blob ?? file;
  const ext = blob ? "jpg" : ((file.name.split(".").pop() || "jpg").replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(0, 8) || "jpg");
  const supabase = createSupabaseBrowserClient();
  const safeFolder = folder.replace(/[^a-zA-Z0-9_-]/g, "") || "misc";
  const path = `${safeFolder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("generated-media").upload(path, body, { contentType: blob ? "image/jpeg" : file.type || undefined, upsert: true });
  if (error) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/generated-media/${path}`;
}

// 사진 촬영/앨범 업로드 + 썸네일(×제거) — 공용.
export default function PhotoPicker({
  label,
  folder,
  urls,
  onChange,
  onBusy,
  max = 20,
  compact,
}: {
  label: string;
  folder: string;
  urls: string[];
  onChange: (next: string[]) => void;
  onBusy?: (b: boolean) => void;
  max?: number;
  compact?: boolean;
}) {
  const camRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); onBusy?.(true);
    const added: string[] = [];
    for (const file of Array.from(files).slice(0, 10)) {
      const u = await uploadPhoto(file, folder);
      if (u) added.push(u);
    }
    setBusy(false); onBusy?.(false);
    if (added.length) onChange([...urls, ...added].slice(0, max));
  };

  const size = compact ? 64 : 84;
  return (
    <div style={{ marginTop: compact ? 0 : 10 }}>
      <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{label} {urls.length ? `(${urls.length})` : ""}</div>
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
      <input ref={albumRef} type="file" accept="image/*" multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn" style={compact ? { padding: "4px 10px", fontSize: 12.5 } : undefined} onClick={() => camRef.current?.click()} disabled={busy}>📷 사진 찍기</button>
        <button type="button" className="btn" style={compact ? { padding: "4px 10px", fontSize: 12.5 } : undefined} onClick={() => albumRef.current?.click()} disabled={busy}>🖼 앨범에서</button>
        {busy && <span className="muted" style={{ fontSize: 12.5, alignSelf: "center" }}>사진 올리는 중…</span>}
      </div>
      {urls.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {urls.map((u) => (
            <div key={u} style={{ position: "relative" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt={label} style={{ width: size, height: size, objectFit: "cover", borderRadius: 10, border: "1px solid var(--line)" }} />
              <button type="button" onClick={() => onChange(urls.filter((x) => x !== u))} title="사진 제거"
                style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 999, border: "1px solid var(--line-2)", background: "var(--surface)", color: "var(--owner)", fontSize: 12, lineHeight: 1, cursor: "pointer" }}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
