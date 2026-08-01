"use client";

import { useEffect, useMemo, useState } from "react";
import { LockGate } from "@/components/LockGate";

interface Emp {
  id: string;
  name: string;
  position: string; // 직책
  hireDate: string; // 입사일 YYYY-MM-DD
  salary: number; // 연봉(원)
  phone: string; // 연락처
  note: string; // 특이사항
}

const KEY = "hr-staff-v1";

const SEED: Emp[] = [
  { id: "e1", name: "김직원", position: "매니저", hireDate: "2024-03-02", salary: 46_000_000, phone: "010-1234-0001", note: "정규직 · 예시 데이터" },
  { id: "e2", name: "이사원", position: "마케터", hireDate: "2025-01-15", salary: 38_000_000, phone: "010-1234-0002", note: "수습 종료" },
];

const won = (n: number) => (n ? n.toLocaleString("ko-KR") + "원" : "-");
const uid = () => "e_" + Math.random().toString(36).slice(2, 9);
const emptyEmp = (): Emp => ({ id: uid(), name: "", position: "", hireDate: "", salary: 0, phone: "", note: "" });

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  border: "1px solid var(--line-2)",
  borderRadius: "var(--radius)",
  background: "var(--surface)",
  color: "var(--ink)",
};

export default function StaffDirectoryPage() {
  return (
    <LockGate storageKey="hr-staff-unlock-v1" password="1233" heading="직원관리">
      {(lock) => <Board lock={lock} />}
    </LockGate>
  );
}

function Board({ lock }: { lock: () => void }) {
  const [items, setItems] = useState<Emp[]>(SEED);
  const [hydrated, setHydrated] = useState(false);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Emp | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
    } catch {
      /* ignore */
    }
  }, [items, hydrated]);

  const list = useMemo(
    () => items.filter((e) => !q || (e.name + e.position + e.phone + e.note).toLowerCase().includes(q.toLowerCase())),
    [items, q]
  );
  const payroll = items.reduce((s, e) => s + (e.salary || 0), 0);

  const save = (e: Emp) =>
    setItems((prev) => {
      const i = prev.findIndex((x) => x.id === e.id);
      if (i >= 0) {
        const cp = [...prev];
        cp[i] = e;
        return cp;
      }
      return [e, ...prev];
    });
  const remove = (id: string) => setItems((prev) => prev.filter((e) => e.id !== id));

  return (
    <>
      <div className="page-head" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>🔒 직원관리</h1>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
            총 {items.length}명 · 연봉 합계 {won(payroll)}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => { setEdit(null); setOpen(true); }} style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}>+ 직원 추가</button>
          <button className="btn" onClick={lock} title="다시 잠그기">🔒 잠금</button>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·직책·연락처 검색…" style={{ ...inputStyle, maxWidth: 280 }} />
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 760 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--ink-2)" }}>
              <th style={th}>이름</th>
              <th style={th}>직책</th>
              <th style={th}>입사일</th>
              <th style={{ ...th, textAlign: "right" }}>연봉</th>
              <th style={th}>연락처</th>
              <th style={th}>특이사항</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr><td colSpan={7} className="muted" style={{ padding: 24, textAlign: "center" }}>등록된 직원이 없습니다.</td></tr>
            )}
            {list.map((e) => (
              <tr key={e.id} style={{ borderTop: "1px solid var(--line)" }}>
                <td style={{ ...td, fontWeight: 600 }}>{e.name}</td>
                <td style={td}>{e.position || "-"}</td>
                <td style={td}>{e.hireDate || "-"}</td>
                <td style={{ ...td, textAlign: "right" }}>{won(e.salary)}</td>
                <td style={td}>{e.phone || "-"}</td>
                <td style={{ ...td, color: "var(--ink-2)", maxWidth: 260 }}>{e.note || "-"}</td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>
                  <button className="btn" style={smBtn} onClick={() => { setEdit(e); setOpen(true); }}>수정</button>{" "}
                  <button className="btn" style={{ ...smBtn, color: "var(--owner)" }} onClick={() => remove(e.id)}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <EmpModal
          initial={edit}
          onClose={() => setOpen(false)}
          onSave={(e) => { save(e); setOpen(false); }}
        />
      )}
    </>
  );
}

function EmpModal({ initial, onClose, onSave }: { initial: Emp | null; onClose: () => void; onSave: (e: Emp) => void }) {
  const [f, setF] = useState<Emp>(initial ?? emptyEmp());
  const set = (k: keyof Emp, v: any) => setF((p) => ({ ...p, [k]: v }));
  return (
    <div onMouseDown={onClose} style={backdrop}>
      <div className="card" onMouseDown={(e) => e.stopPropagation()} style={{ padding: 20, width: "100%", maxWidth: 480 }}>
        <h3 style={{ marginTop: 0 }}>{initial ? "직원 수정" : "직원 추가"}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="이름"><input style={inputStyle} value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="직책"><input style={inputStyle} value={f.position} onChange={(e) => set("position", e.target.value)} /></Field>
          <Field label="입사일"><input type="date" style={inputStyle} value={f.hireDate} onChange={(e) => set("hireDate", e.target.value)} /></Field>
          <Field label="연봉(원)"><input type="number" style={inputStyle} value={f.salary} onChange={(e) => set("salary", Number(e.target.value))} /></Field>
          <Field label="연락처"><input style={inputStyle} value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
          <div />
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="특이사항"><textarea rows={2} style={{ ...inputStyle, resize: "vertical" }} value={f.note} onChange={(e) => set("note", e.target.value)} /></Field>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn" disabled={!f.name.trim()} onClick={() => onSave(f)} style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}>저장</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginBottom: 4, fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

const th: React.CSSProperties = { padding: "10px 12px", fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.03em", fontWeight: 700 };
const td: React.CSSProperties = { padding: "10px 12px", verticalAlign: "top" };
const smBtn: React.CSSProperties = { padding: "3px 9px", fontSize: 12 };
const backdrop: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(16,20,24,0.5)", display: "grid", placeItems: "center", zIndex: 100, padding: 20 };
