"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTodo } from "@/app/(app)/todos/actions";
import AssigneePicker from "@/components/AssigneePicker";

type Opt = { id: string; name: string };
const PRIORITIES = ["높음", "보통", "낮음"];

export default function QuickTodoAdd({ brands, users }: { brands: Opt[]; users: Opt[] }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [brandId, setBrandId] = useState("");
  const [assignees, setAssignees] = useState<string[]>([]);
  const [priority, setPriority] = useState("보통");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function submit() {
    if (!title.trim()) return;
    setError(null);
    const fd = new FormData();
    fd.set("title", title.trim());
    fd.set("brand_id", brandId);
    assignees.forEach((id) => fd.append("assignee_ids", id));
    fd.set("priority", priority);
    fd.set("status", "예정");
    start(async () => {
      const r = await createTodo(fd);
      if (!r.ok) setError(r.error ?? "추가 실패");
      else {
        setTitle("");
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <button
        className="btn"
        style={{ width: "100%", justifyContent: "center", borderRadius: 0 }}
        onClick={() => setOpen(true)}
      >
        + 빠른 추가
      </button>
    );
  }

  return (
    <div style={{ padding: 10, borderTop: "1px solid var(--line-2)", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      <input
        type="text"
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="할 일을 입력하고 Enter"
        style={{ flex: "2 1 240px" }}
        disabled={pending}
      />
      <select value={brandId} onChange={(e) => setBrandId(e.target.value)} style={{ flex: "1 1 120px", maxWidth: 160 }} disabled={pending}>
        <option value="">브랜드(선택)</option>
        {brands.map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>
      <select value={priority} onChange={(e) => setPriority(e.target.value)} style={{ maxWidth: 96 }} disabled={pending}>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
      <div style={{ flexBasis: "100%", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span className="muted" style={{ fontSize: 12 }}>담당(여러 명):</span>
        <AssigneePicker users={users} value={assignees} onChange={setAssignees} />
      </div>
      <button className="btn primary" onClick={submit} disabled={pending || !title.trim()}>
        {pending ? "추가 중..." : "추가"}
      </button>
      <button className="btn" onClick={() => setOpen(false)} disabled={pending}>
        닫기
      </button>
      {error && <span style={{ color: "var(--owner)", fontSize: 13, width: "100%" }}>{error}</span>}
    </div>
  );
}
