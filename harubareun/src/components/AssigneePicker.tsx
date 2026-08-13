"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAssignee } from "@/app/(app)/assignees/actions";

type Opt = { id: string; name: string };

// 담당자 다중 선택 칩. 선택된 id는 name="assignee_ids" 히든 인풋으로 폼에 담긴다
// (native FormData.getAll("assignee_ids")로 서버 액션이 읽음).
// "+ 추가" 버튼으로 새 담당자를 즉석 등록할 수 있다(모든 폴더 목록에 공통 반영).
export default function AssigneePicker({
  users,
  value,
  onChange,
}: {
  users: Opt[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [extra, setExtra] = useState<Opt[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const all = [...users, ...extra.filter((e) => !users.some((u) => u.id === e.id))];

  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  const submitNew = () => {
    const nm = name.trim();
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
      if (!value.includes(opt.id)) onChange([...value, opt.id]); // 새로 추가한 담당자 자동 선택
      setName("");
      setAdding(false);
      router.refresh(); // 서버 목록도 갱신(다른 폴더에도 반영)
    });
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
      {all.map((u) => {
        const on = value.includes(u.id);
        return (
          <button
            type="button"
            key={u.id}
            onClick={() => toggle(u.id)}
            className="btn sm"
            style={{
              padding: "4px 10px",
              fontSize: 12.5,
              background: on ? "var(--accent)" : "var(--surface)",
              color: on ? "var(--accent-ink)" : "var(--ink-2)",
              borderColor: on ? "var(--accent)" : "var(--line-2)",
            }}
          >
            {on ? "✓ " : ""}
            {u.name}
          </button>
        );
      })}

      {adding ? (
        <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); submitNew(); }
              if (e.key === "Escape") { setAdding(false); setName(""); setErr(null); }
            }}
            placeholder="이름"
            style={{ width: 90, padding: "4px 8px", fontSize: 12.5, border: "1px solid var(--line-2)", borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--ink)" }}
          />
          <button type="button" className="btn sm primary" disabled={pending || !name.trim()} onClick={submitNew} style={{ padding: "4px 8px" }}>
            {pending ? "…" : "확인"}
          </button>
          <button type="button" className="btn sm" onClick={() => { setAdding(false); setName(""); setErr(null); }} style={{ padding: "4px 8px" }}>취소</button>
        </span>
      ) : (
        <button
          type="button"
          className="btn sm"
          onClick={() => setAdding(true)}
          title="새 담당자 추가"
          style={{ padding: "4px 10px", fontSize: 12.5, borderStyle: "dashed" }}
        >
          + 담당자
        </button>
      )}

      {err && <span style={{ color: "var(--owner)", fontSize: 12 }}>{err}</span>}

      {value.map((id) => (
        <input key={id} type="hidden" name="assignee_ids" value={id} />
      ))}
    </div>
  );
}
