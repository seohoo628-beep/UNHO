"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAssignee } from "@/app/(app)/assignees/actions";

type Opt = { id: string; name: string };

// 단일 담당자 선택 + "+ 담당자" 즉석 추가. name으로 FormData에 담긴다.
export default function UserSelectAdd({
  name,
  users,
  defaultValue,
  placeholder = "(미지정)",
}: {
  name: string;
  users: Opt[];
  defaultValue?: string;
  placeholder?: string;
}) {
  const [extra, setExtra] = useState<Opt[]>([]);
  const [value, setValue] = useState<string>(defaultValue ?? "");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const all = [...users, ...extra.filter((e) => !users.some((u) => u.id === e.id))];

  const submitNew = () => {
    const nm = newName.trim();
    if (!nm) return;
    setErr(null);
    start(async () => {
      const r = await createAssignee(nm);
      if (!r.ok || !r.id) {
        setErr(r.error ?? "추가 실패");
        return;
      }
      const opt = { id: r.id, name: r.name ?? nm };
      setExtra((prev) => (prev.some((x) => x.id === opt.id) ? prev : [...prev, opt]));
      setValue(opt.id);
      setNewName("");
      setAdding(false);
      router.refresh();
    });
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <select name={name} value={value} onChange={(e) => setValue(e.target.value)} style={{ flex: 1, minWidth: 120 }}>
          <option value="">{placeholder}</option>
          {all.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        {!adding && (
          <button type="button" className="btn sm" onClick={() => setAdding(true)} title="새 담당자 추가" style={{ borderStyle: "dashed" }}>
            + 담당자
          </button>
        )}
      </div>
      {adding && (
        <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 6 }}>
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); submitNew(); }
              if (e.key === "Escape") { setAdding(false); setNewName(""); setErr(null); }
            }}
            placeholder="새 담당자 이름"
            style={{ flex: 1, minWidth: 120, padding: "5px 9px", fontSize: 13, border: "1px solid var(--line-2)", borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--ink)" }}
          />
          <button type="button" className="btn sm primary" disabled={pending || !newName.trim()} onClick={submitNew}>{pending ? "…" : "확인"}</button>
          <button type="button" className="btn sm" onClick={() => { setAdding(false); setNewName(""); setErr(null); }}>취소</button>
        </div>
      )}
      {err && <div style={{ color: "var(--owner)", fontSize: 12, marginTop: 4 }}>{err}</div>}
    </div>
  );
}
