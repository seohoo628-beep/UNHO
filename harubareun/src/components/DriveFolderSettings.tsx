"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveDriveFolder } from "@/app/(app)/settings/drive-actions";

export default function DriveFolderSettings({
  folderId,
  saEmail,
}: {
  folderId: string;
  saEmail: string;
}) {
  const [url, setUrl] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="card">
      <div className="lbl" style={{ fontSize: 13, color: "var(--ink-2)", marginBottom: 8 }}>
        현재 연동 폴더: <span className="mono">{folderId || "(미설정)"}</span>
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 10, lineHeight: 1.8 }}>
        1) 구글 드라이브에서 대상 폴더를 <b>서비스계정 이메일</b>
        {saEmail ? (
          <> (<span className="mono">{saEmail}</span>)</>
        ) : (
          <> (환경변수 <span className="mono">GOOGLE_SA_CLIENT_EMAIL</span>)</>
        )}
        에 <b>뷰어</b>로 공유하세요.
        <br />
        2) 그 폴더의 URL을 아래에 붙여넣고 저장하면, 폴더 파일이 &ldquo;업무 진행시트&rdquo;에 뜹니다.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          type="text"
          style={{ flex: 1, minWidth: 260 }}
          placeholder="https://drive.google.com/drive/folders/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button
          className="btn primary"
          disabled={pending || !url.trim()}
          onClick={() => {
            setMsg(null);
            setErr(null);
            start(async () => {
              const r = await saveDriveFolder(url.trim());
              if (!r.ok) setErr(r.error ?? "실패");
              else {
                setMsg(r.info ?? "저장됨");
                router.refresh();
              }
            });
          }}
        >
          {pending ? "확인 중..." : "폴더 저장"}
        </button>
      </div>
      {msg && (
        <div className="flag" style={{ marginTop: 10, borderLeftColor: "var(--ok)", background: "var(--ok-bg)" }}>
          {msg}
        </div>
      )}
      {err && <div className="flag" style={{ marginTop: 10 }}>{err}</div>}
    </div>
  );
}
