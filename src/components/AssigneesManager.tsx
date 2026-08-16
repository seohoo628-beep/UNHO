"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  listAddedAssignees,
  renameAssignee,
  deleteAssignee,
  createAssignee,
  createStaffAccount,
  resetStaffPassword,
  type AddedAssignee,
} from "@/app/(app)/assignees/actions";

export default function AssigneesManager({ isOwner = false, isCeo = false }: { isOwner?: boolean; isCeo?: boolean }) {
  const [items, setItems] = useState<AddedAssignee[] | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  // 직원 로그인 계정 만들기(대표 전용)
  const [acctOpen, setAcctOpen] = useState(false);
  const [acctName, setAcctName] = useState("");
  const [acctEmail, setAcctEmail] = useState("");
  const [acctPw, setAcctPw] = useState("");
  const [acctRole, setAcctRole] = useState("staff");
  const [acctMsg, setAcctMsg] = useState<string | null>(null);

  const createAccount = () => {
    setAcctMsg(null);
    setError(null);
    start(async () => {
      const r = await createStaffAccount({ name: acctName, email: acctEmail, password: acctPw, role: acctRole });
      if (!r.ok) { setError(r.error ?? "생성 실패"); return; }
      setAcctMsg(`✅ '${acctName}' 계정 생성 완료 — 이메일 ${acctEmail.trim().toLowerCase()} / 비밀번호를 본인에게 전달하세요.`);
      setAcctName(""); setAcctEmail(""); setAcctPw(""); setAcctRole("staff");
      load();
      router.refresh();
    });
  };

  const resetPw = (a: AddedAssignee) => {
    const pw = prompt(`'${a.name}'님의 새 비밀번호를 입력하세요 (6자 이상).`);
    if (pw === null) return;
    if (pw.length < 6) { alert("비밀번호는 6자 이상이어야 합니다."); return; }
    start(async () => {
      const r = await resetStaffPassword(a.id, pw);
      if (!r.ok) { setError(r.error ?? "실패"); return; }
      alert(`'${a.name}'님 비밀번호가 설정되었습니다. 본인에게 전달하세요.`);
      load();
      router.refresh();
    });
  };

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
    let msg = a.login
      ? `'${a.name}'님은 로그인 계정(실제 직원)입니다. 삭제하면 이 사람은 더 이상 플랫폼에 접속할 수 없습니다.\n`
      : "";
    msg += a.taskCount > 0
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

      {/* 직원 로그인 계정 만들기(대표 전용) */}
      {isOwner && (
        <div className="card" style={{ marginBottom: 14, borderLeft: "4px solid var(--accent)" }}>
          {!acctOpen ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontSize: 13.5 }}>🔑 직원이 <b>본인 이메일·비밀번호로 로그인</b>하게 하려면 계정을 만들어 주세요.</div>
              <button className="btn primary" onClick={() => setAcctOpen(true)}>+ 직원 계정 만들기</button>
            </div>
          ) : (
            <div>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>직원 로그인 계정 만들기</div>
              <div className="row">
                <label className="field" style={{ marginBottom: 0 }}>
                  <span>이름 *</span>
                  <input value={acctName} onChange={(e) => setAcctName(e.target.value)} placeholder="홍길동" />
                </label>
                <label className="field" style={{ marginBottom: 0 }}>
                  <span>이메일 *</span>
                  <input value={acctEmail} onChange={(e) => setAcctEmail(e.target.value)} placeholder="name@unocompany.net" />
                </label>
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <label className="field" style={{ marginBottom: 0 }}>
                  <span>초기 비밀번호 * (6자 이상)</span>
                  <input value={acctPw} onChange={(e) => setAcctPw(e.target.value)} placeholder="본인에게 전달할 임시 비밀번호" />
                </label>
                <label className="field" style={{ marginBottom: 0, maxWidth: 140 }}>
                  <span>권한</span>
                  <select value={acctRole} onChange={(e) => setAcctRole(e.target.value)}>
                    <option value="staff">직원</option>
                    <option value="owner">대표</option>
                    <option value="guest">게스트(파트너)</option>
                  </select>
                </label>
              </div>
              <div className="btn-row" style={{ marginTop: 10 }}>
                <button className="btn primary" disabled={pending} onClick={createAccount}>{pending ? "생성 중…" : "계정 생성"}</button>
                <button className="btn" onClick={() => { setAcctOpen(false); setAcctMsg(null); }}>닫기</button>
              </div>
              <p className="muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
                생성 후 <b>이메일과 초기 비밀번호를 본인에게 전달</b>하면, 각자 로그인 화면에서 그 정보로 접속합니다. 비밀번호는 본인이 로그인 후 바꿀 수 있게 안내하세요.
              </p>
            </div>
          )}
          {acctMsg && <div style={{ marginTop: 10, fontSize: 13, color: "var(--ok, #16a34a)" }}>{acctMsg}</div>}
        </div>
      )}

      {error && <div className="card" style={{ padding: 10, marginBottom: 12, color: "var(--owner)" }}>{error}</div>}

      {/* 계정 현황 요약 */}
      {items && items.length > 0 && (() => {
        const login = items.filter((i) => i.login);
        const linked = login.filter((i) => i.authLinked).length;
        const notLinked = login.length - linked;
        const tags = items.length - login.length;
        return (
          <div className="card" style={{ marginBottom: 12, fontSize: 13, display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span>🔑 로그인 계정 <b>{login.length}</b></span>
            <span style={{ color: "var(--ok, #16a34a)" }}>✅ 로그인 연결됨 <b>{linked}</b></span>
            <span style={{ color: "var(--warn, #b45309)" }}>⏳ 아직 로그인 안 함 <b>{notLinked}</b></span>
            <span className="muted">🏷 이름표 <b>{tags}</b></span>
          </div>
        );
      })()}

      {items === null ? (
        <div className="card"><div className="empty">불러오는 중…</div></div>
      ) : items.length === 0 ? (
        <div className="card"><div className="empty">담당자가 없습니다.</div></div>
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
                      <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ display: "inline-flex", flexDirection: "column" }}>
                          <span>
                            {a.name}
                            {a.role === "owner" && <span className="badge owner" style={{ fontSize: 10.5, marginLeft: 6 }}>대표</span>}
                            {a.login ? (
                              <span className="badge" style={{ fontSize: 10.5, marginLeft: 6 }}>로그인 계정</span>
                            ) : (
                              <span className="badge muted" style={{ fontSize: 10.5, marginLeft: 6 }}>이름표</span>
                            )}
                            {a.isSelf && <span className="badge accent" style={{ fontSize: 10.5, marginLeft: 6 }}>나</span>}
                            {a.login && (a.authLinked
                              ? <span className="badge ok" style={{ fontSize: 10.5, marginLeft: 6 }}>로그인함</span>
                              : <span className="badge warn" style={{ fontSize: 10.5, marginLeft: 6 }}>미로그인</span>)}
                          </span>
                          {a.email && <span className="muted" style={{ fontSize: 11 }}>{a.email}</span>}
                        </span>
                      </span>
                    )}
                  </td>
                  <td>{a.taskCount > 0 ? `${a.taskCount}개` : <span className="muted">-</span>}</td>
                  <td>
                    <span style={{ display: "inline-flex", gap: 5, whiteSpace: "nowrap" }}>
                      {editId !== a.id && (
                        <button className="btn sm" disabled={pending} onClick={() => { setEditId(a.id); setEditName(a.name); }}>이름변경</button>
                      )}
                      {isCeo && a.login && (
                        <button className="btn sm" disabled={pending} onClick={() => resetPw(a)} title="대표(최운호)님만 변경 가능">🔑 비번설정</button>
                      )}
                      {!a.isSelf && a.role !== "owner" && (
                        <button className="btn sm" disabled={pending} onClick={() => remove(a)} style={{ color: "var(--owner)" }}>삭제</button>
                      )}
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
