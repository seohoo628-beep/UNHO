"use client";

type Opt = { id: string; name: string };

// 담당자 다중 선택 칩. 선택된 id는 name="assignee_ids" 히든 인풋으로 폼에 담긴다
// (native FormData.getAll("assignee_ids")로 서버 액션이 읽음).
export default function AssigneePicker({
  users,
  value,
  onChange,
}: {
  users: Opt[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {users.map((u) => {
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
      {value.map((id) => (
        <input key={id} type="hidden" name="assignee_ids" value={id} />
      ))}
    </div>
  );
}
