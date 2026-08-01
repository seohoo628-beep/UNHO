"use client";

import { useState } from "react";
import { useData, inScope } from "@/lib/store";
import { Card, Badge, Bar, Modal, Field, Chips } from "@/components/ui";
import { storeName, STORES } from "@/lib/stores";
import { manwon, num, pct, ratio, uid, today } from "@/lib/format";
import type { OpsTask, Priority, TaskStatus, StoreId } from "@/lib/types";

const STATUS: { value: TaskStatus; label: string; tone: string }[] = [
  { value: "todo", label: "예정", tone: "gray" },
  { value: "doing", label: "진행중", tone: "blue" },
  { value: "done", label: "완료", tone: "green" },
];
const PRIO: Record<Priority, [string, string]> = {
  high: ["red", "높음"],
  mid: ["amber", "보통"],
  low: ["gray", "낮음"],
};

export default function OperationsPage() {
  const { data, scope, update, ready } = useData();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<OpsTask | null>(null);
  if (!ready) return null;

  const goals = inScope(data.goals, scope);
  const tasks = inScope(data.tasks, scope);

  const setStatus = (id: string, status: TaskStatus) =>
    update((d) => {
      const t = d.tasks.find((x) => x.id === id);
      if (t) t.status = status;
      return d;
    });

  const remove = (id: string) =>
    update((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== id) }));

  const save = (t: OpsTask) =>
    update((d) => {
      const i = d.tasks.findIndex((x) => x.id === t.id);
      if (i >= 0) d.tasks[i] = t;
      else d.tasks.unshift(t);
      return d;
    });

  const byStatus = (s: TaskStatus) => tasks.filter((t) => t.status === s);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>운영기획</h1>
          <p>월간 목표 관리와 매장 운영 액션플랜 — {storeName(scope)}</p>
        </div>
        <button
          className="btn primary"
          onClick={() => {
            setEdit(null);
            setOpen(true);
          }}
        >
          + 액션 추가
        </button>
      </div>

      {/* 목표 */}
      <Card title="🎯 이달의 목표" pad={false}>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                {scope === "all" && <th>매장</th>}
                <th>목표</th>
                <th>지표</th>
                <th className="num">현재</th>
                <th className="num">목표치</th>
                <th style={{ width: 180 }}>달성률</th>
              </tr>
            </thead>
            <tbody>
              {goals.map((g) => {
                const r = ratio(g.actual, g.target);
                const color = r >= 90 ? "var(--green)" : r >= 60 ? "var(--amber)" : "var(--red)";
                const fmt = (n: number) =>
                  g.unit === "원" ? manwon(n) : g.unit.startsWith("점") ? (n / 10).toFixed(1) : num(n);
                return (
                  <tr key={g.id}>
                    {scope === "all" && <td className="muted">{storeName(g.storeId)}</td>}
                    <td style={{ fontWeight: 600 }}>{g.title}</td>
                    <td className="muted">{g.metric}</td>
                    <td className="num" style={{ fontWeight: 700 }}>
                      {fmt(g.actual)}
                    </td>
                    <td className="num muted">{fmt(g.target)}</td>
                    <td>
                      <div className="row" style={{ gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <Bar value={r} color={color} />
                        </div>
                        <span style={{ fontWeight: 700, color, minWidth: 42, textAlign: "right" }}>
                          {pct(r, 0)}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 액션 보드 */}
      <div className="grid grid-3 mt-24" style={{ alignItems: "start" }}>
        {STATUS.map((col) => (
          <Card key={col.value} title={<span>{col.label} <span className="muted">· {byStatus(col.value).length}</span></span>}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {byStatus(col.value).length === 0 && <div className="muted" style={{ fontSize: 13 }}>없음</div>}
              {byStatus(col.value).map((t) => (
                <div
                  key={t.id}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    padding: 12,
                    background: "var(--surface-2)",
                  }}
                >
                  <div className="row between" style={{ marginBottom: 6 }}>
                    <Badge tone={PRIO[t.priority][0] as any}>{PRIO[t.priority][1]}</Badge>
                    <span className="badge gray">{t.category}</span>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 6 }}>{t.title}</div>
                  <div className="muted" style={{ fontSize: 11.5, marginBottom: 8 }}>
                    {scope === "all" && `${storeName(t.storeId)} · `}
                    {t.owner} · 마감 {t.due}
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <select
                      className="field"
                      style={{ padding: "4px 8px", fontSize: 12, width: "auto" }}
                      value={t.status}
                      onChange={(e) => setStatus(t.id, e.target.value as TaskStatus)}
                    >
                      {STATUS.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    <button
                      className="btn ghost sm"
                      onClick={() => {
                        setEdit(t);
                        setOpen(true);
                      }}
                    >
                      수정
                    </button>
                    <button className="btn danger sm" onClick={() => remove(t.id)}>
                      삭제
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      {open && (
        <TaskModal
          initial={edit}
          defaultStore={scope === "all" ? "chdo" : scope}
          onClose={() => setOpen(false)}
          onSave={(t) => {
            save(t);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function TaskModal({
  initial,
  defaultStore,
  onClose,
  onSave,
}: {
  initial: OpsTask | null;
  defaultStore: StoreId;
  onClose: () => void;
  onSave: (t: OpsTask) => void;
}) {
  const [f, setF] = useState<OpsTask>(
    initial ?? {
      id: uid("t"),
      storeId: defaultStore,
      title: "",
      owner: "",
      due: today(),
      priority: "mid",
      status: "todo",
      category: "매장운영",
    }
  );
  const set = (k: keyof OpsTask, v: any) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Modal
      title={initial ? "액션 수정" : "액션 추가"}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            취소
          </button>
          <button className="btn primary" disabled={!f.title.trim()} onClick={() => onSave(f)}>
            저장
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="제목" full>
          <input className="field" value={f.title} onChange={(e) => set("title", e.target.value)} />
        </Field>
        <Field label="매장">
          <select className="field" value={f.storeId} onChange={(e) => set("storeId", e.target.value)}>
            {STORES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="담당자">
          <input className="field" value={f.owner} onChange={(e) => set("owner", e.target.value)} />
        </Field>
        <Field label="카테고리">
          <select className="field" value={f.category} onChange={(e) => set("category", e.target.value)}>
            {["매장운영", "메뉴", "시설", "CS", "위생", "마케팅", "인사"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="마감일">
          <input type="date" className="field" value={f.due} onChange={(e) => set("due", e.target.value)} />
        </Field>
        <Field label="우선순위" full>
          <Chips
            value={f.priority}
            onChange={(v) => set("priority", v)}
            options={[
              { value: "high" as Priority, label: "높음" },
              { value: "mid" as Priority, label: "보통" },
              { value: "low" as Priority, label: "낮음" },
            ]}
          />
        </Field>
      </div>
    </Modal>
  );
}
