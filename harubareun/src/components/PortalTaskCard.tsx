"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reportProgress, uploadDeliverable } from "@/app/portal/actions";

const STATUSES = ["예정", "진행", "완료", "지연", "보류"];

export type PortalTask = {
  id: string;
  title: string;
  status: string;
  note: string | null;
  brandName: string | null;
  dueDate: string | null;
  attachments: { file_name: string | null; created_at: string }[];
};

export default function PortalTaskCard({ task }: { task: PortalTask }) {
  const [status, setStatus] = useState(task.status);
  const [note, setNote] = useState(task.note ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function save() {
    setMsg(null);
    setErr(null);
    start(async () => {
      const res = await reportProgress(task.id, status, note);
      if (!res.ok) setErr(res.error ?? "실패");
      else {
        setMsg("보고 저장됨");
        router.refresh();
      }
    });
  }

  function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    const fd = new FormData(e.currentTarget);
    fd.set("task_id", task.id);
    start(async () => {
      const res = await uploadDeliverable(fd);
      if (!res.ok) setErr(res.error ?? "업로드 실패");
      else {
        setMsg("업로드 완료");
        router.refresh();
      }
    });
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <strong>{task.title}</strong>
        {task.brandName && <span className="badge">{task.brandName}</span>}
      </div>

      <div className="row" style={{ marginTop: 12, alignItems: "end" }}>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>진행 상태</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ marginBottom: 0, flex: 2 }}>
          <span>진행 보고</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="진행 내용" />
        </label>
        <div style={{ flex: "0 0 auto" }}>
          <button className="btn primary" disabled={pending} onClick={save}>
            보고 저장
          </button>
        </div>
      </div>

      <div className="divider" />

      <form onSubmit={onUpload} className="row" style={{ alignItems: "end" }}>
        <label className="field" style={{ marginBottom: 0, flex: 2 }}>
          <span>산출물 업로드</span>
          <input type="file" name="file" />
        </label>
        <div style={{ flex: "0 0 auto" }}>
          <button className="btn" disabled={pending}>
            업로드
          </button>
        </div>
      </form>

      {task.attachments.length > 0 && (
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          업로드됨: {task.attachments.map((a) => a.file_name).join(", ")}
        </div>
      )}
      {msg && (
        <p className="badge ok" style={{ marginTop: 10, padding: "6px 10px" }}>
          {msg}
        </p>
      )}
      {err && <p style={{ color: "var(--owner)", fontSize: 13, marginTop: 10 }}>{err}</p>}
    </div>
  );
}
