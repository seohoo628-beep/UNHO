"use client";

import { useState } from "react";
import { useData, inScope } from "@fnb/lib/store";
import { Card, Badge, Modal, Field, Chips, Empty } from "@fnb/components/ui";
import { storeName, STORES } from "@fnb/lib/stores";
import { uid, today } from "@fnb/lib/format";
import type { Announcement, Priority } from "@fnb/lib/types";

const PRIO: Record<Priority, [string, string]> = {
  high: ["red", "중요"],
  mid: ["amber", "보통"],
  low: ["gray", "참고"],
};

export default function AnnouncementsPage() {
  const { data, scope, update, ready } = useData();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Announcement | null>(null);
  if (!ready) return null;

  const list = inScope(data.announcements, scope)
    .slice()
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));

  const save = (a: Announcement) =>
    update((d) => {
      const i = d.announcements.findIndex((x) => x.id === a.id);
      if (i >= 0) d.announcements[i] = a;
      else d.announcements.unshift(a);
      return d;
    });
  const remove = (id: string) =>
    update((d) => ({ ...d, announcements: d.announcements.filter((a) => a.id !== id) }));
  const togglePin = (id: string) =>
    update((d) => {
      const a = d.announcements.find((x) => x.id === id);
      if (a) a.pinned = !a.pinned;
      return d;
    });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>전달사항</h1>
          <p>본사·매장 간 공지와 전달사항 — {storeName(scope)}</p>
        </div>
        <button
          className="btn primary"
          onClick={() => {
            setEdit(null);
            setOpen(true);
          }}
        >
          + 전달사항 작성
        </button>
      </div>

      <div className="stack">
        {list.length === 0 && (
          <Card pad>
            <Empty>등록된 전달사항이 없습니다.</Empty>
          </Card>
        )}
        {list.map((a) => (
          <div
            key={a.id}
            className="card card-pad"
            style={a.pinned ? { borderColor: "var(--brand)", borderWidth: 1.5 } : undefined}
          >
            <div className="row between" style={{ alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div className="row" style={{ gap: 8, marginBottom: 6 }}>
                  <Badge tone={PRIO[a.priority][0] as any}>{PRIO[a.priority][1]}</Badge>
                  <span className="badge blue">{storeName(a.storeId)}</span>
                  {a.pinned && <span className="badge brand">📍 고정</span>}
                </div>
                <div style={{ fontWeight: 700, fontSize: 15.5, marginBottom: 4 }}>{a.title}</div>
                <div style={{ color: "var(--text-2)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{a.body}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                  {a.author} · {a.createdAt}
                </div>
              </div>
              <div className="row" style={{ gap: 4 }}>
                <button className="btn ghost sm" onClick={() => togglePin(a.id)} title="고정/해제">
                  {a.pinned ? "📌" : "📍"}
                </button>
                <button
                  className="btn ghost sm"
                  onClick={() => {
                    setEdit(a);
                    setOpen(true);
                  }}
                >
                  수정
                </button>
                <button className="btn danger sm" onClick={() => remove(a.id)}>
                  삭제
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {open && (
        <AnnModal
          initial={edit}
          onClose={() => setOpen(false)}
          onSave={(a) => {
            save(a);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function AnnModal({
  initial,
  onClose,
  onSave,
}: {
  initial: Announcement | null;
  onClose: () => void;
  onSave: (a: Announcement) => void;
}) {
  const [f, setF] = useState<Announcement>(
    initial ?? {
      id: uid("a"),
      storeId: "all",
      title: "",
      body: "",
      author: "본사 운영팀",
      priority: "mid",
      createdAt: today(),
      pinned: false,
    }
  );
  const set = (k: keyof Announcement, v: any) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Modal
      title={initial ? "전달사항 수정" : "전달사항 작성"}
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
        <Field label="대상 매장">
          <select className="field" value={f.storeId} onChange={(e) => set("storeId", e.target.value)}>
            <option value="all">공통(전 지점)</option>
            {STORES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="작성자">
          <input className="field" value={f.author} onChange={(e) => set("author", e.target.value)} />
        </Field>
        <Field label="내용" full>
          <textarea
            className="field"
            rows={5}
            value={f.body}
            onChange={(e) => set("body", e.target.value)}
            style={{ resize: "vertical" }}
          />
        </Field>
        <Field label="중요도" full>
          <Chips
            value={f.priority}
            onChange={(v) => set("priority", v)}
            options={[
              { value: "high" as Priority, label: "중요" },
              { value: "mid" as Priority, label: "보통" },
              { value: "low" as Priority, label: "참고" },
            ]}
          />
        </Field>
      </div>
    </Modal>
  );
}
