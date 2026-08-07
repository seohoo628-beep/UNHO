"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  listAddedAssignees,
  renameAssignee,
  deleteAssignee,
  createAssignee,
  type AddedAssignee,
} from "@/app/(app)/assignees/actions";

export default function AssigneesManager() {
  const [items, setItems] = useState<AddedAssignee[] | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const load = () => {
    start(async () => {
      const r = await listAddedAssignees();
      if (r.ok) { setItems(r.items ?? []); setError(null); }
      else setError(r.error ?? "불러오기 실패");
    });
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const add = () => {
    const nm = newName.trim();
    if (!nm) return;
    start(async () => {
      const r = await createAssignee(nm);
      if (!r.ok) { setError(r.error ?? "추가 실패"); return; }
      setNewName("");
      load();
      router.refresh();
    });
  };

  const saveRename = (id: string) => {
    const nm = editName.trim();
    if (!nm) return;
    start(async () => {
      const r = await renameAssignee(id, nm);
      if (!r.ok) { setError(r.error ?? "변경 실패"); return; }
      setEditId(null);
      setEditName("");
      load();
      router.refresh();
    });
  };

  const remove = (a: AddedAssignee) => {
    const msg = a.taskCount > 0
      ? `'${a.name}'님은 ${a.taskCount}개 업무에 배정돼 있습니다. 삭제하면 해당 업무의 담당자에서 빠집니다. 삭제할까요?`
      : `'${a.name}' 담당자를 삭제할까요?`;
    if (!confirm(msg)) return;
    start(async () => {
      const r = await deleteAssignee(a.id);
      if (!r.ok) { setError(r.error ?? "삭제 실패"); return; }
      load();
      router.refresh();
    });
  };

  return (
    <div>
      {/* 새 담당자 추가 */}
      <div className="card" style={{ marginBottom: 14, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="새 담당자 이름"
          style={{ flex: 1, minWidth: 160, padding: "8px 11px", border: "1px solid var(--line-2)", borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--ink)" }}
        />
        <button className="btn primary" disabled={pending || !newName.trim()} onClick={add}>+ 추가</button>
      </div>

      {error && <div className="card" style={{ padding: 10, marginBottom: 12, color: "var(--owner)" }}>{error}</div>}

      {items === null ? (
        <div className="card"><div className="empty">불러오는 중…</div></div>
      ) : items.length === 0 ? (
        <div className="card"><div className="empty">+ 버튼으로 추가한 담당자가 없습니다.</div></div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>담당자</th>
                <th style={{ whiteSpace: "nowrap" }}>배정된 업무</th>
                <th style={{ width: 1 }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <td>
                    {editId === a.id ? (
                      <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <input
                          autoFocus
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); saveRename(a.id); }
                            if (e.key === "Escape") { setEditId(null); setEditName(""); }
                          }}
                          style={{ padding: "5px 9px", border: "1px solid var(--line-2)", borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--ink)" }}
                        />
                        <button className="btn sm primary" disabled={pending} onClick={() => saveRename(a.id)}>저장</button>
                        <button className="btn sm" onClick={() => { setEditId(null); setEditName(""); }}>취소</button>
                      </span>
                    ) : (
                      a.name
                    )}
                  </td>
                  <td>{a.taskCount > 0 ? `${a.taskCount}개` : <span className="muted">-</span>}</td>
                  <td>
                    <span style={{ display: "inline-flex", gap: 5, whiteSpace: "nowrap" }}>
                      {editId !== a.id && (
                        <button className="btn sm" disabled={pending} onClick={() => { setEditId(a.id); setEditName(a.name); }}>이름변경</button>
                      )}
                      <button className="btn sm" disabled={pending} onClick={() => remove(a)} style={{ color: "var(--owner)" }}>삭제</button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
