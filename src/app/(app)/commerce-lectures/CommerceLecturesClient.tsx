"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import AttachmentPicker from "@/components/AttachmentPicker";
import { createLecture, updateLecture, deleteLecture } from "./actions";

export type Lecture = {
  id: string;
  title: string;
  category: string;
  note: string;
  link: string;
  files: { url: string; name: string }[];
};

function Fields({ l }: { l?: Lecture }) {
  return (
    <>
      <div className="row">
        <label className="field" style={{ marginBottom: 0 }}>
          <span>제목 *</span>
          <input name="title" required defaultValue={l?.title ?? ""} placeholder="강의명/자료명" />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>분류</span>
          <input name="category" defaultValue={l?.category ?? ""} placeholder="플랫폼/강사/주제 등" />
        </label>
      </div>
      <label className="field" style={{ marginTop: 10 }}>
        <span>링크 (강의 URL 등)</span>
        <input name="link" defaultValue={l?.link ?? ""} placeholder="https://" />
      </label>
      <label className="field" style={{ marginTop: 10 }}>
        <span>메모</span>
        <textarea name="note" rows={2} defaultValue={l?.note ?? ""} placeholder="요약·수강 메모 등" />
      </label>
      <div style={{ marginTop: 10 }}>
        <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>첨부파일 (여러 개 · 내 파일/컴퓨터 자료)</div>
        <AttachmentPicker initial={l?.files ?? []} />
      </div>
    </>
  );
}

function AddForm() {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function submit(fd: FormData) {
    setErr(null);
    start(async () => {
      const r = await createLecture(fd);
      if (!r.ok) return setErr(r.error ?? "저장 실패");
      formRef.current?.reset();
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) return <button className="btn primary" onClick={() => setOpen(true)}>+ 강의 자료 추가</button>;
  return (
    <form ref={formRef} action={submit} className="card" style={{ padding: 14, marginBottom: 16 }}>
      <Fields />
      {err && <div style={{ color: "var(--owner)", fontSize: 12, marginTop: 8 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button className="btn primary" disabled={pending}>{pending ? "저장 중…" : "저장"}</button>
        <button type="button" className="btn" onClick={() => setOpen(false)} disabled={pending}>취소</button>
      </div>
    </form>
  );
}

function Row({ l }: { l: Lecture }) {
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function submit(fd: FormData) {
    setErr(null);
    start(async () => {
      const r = await updateLecture(l.id, fd);
      if (!r.ok) return setErr(r.error ?? "저장 실패");
      setEditing(false);
      router.refresh();
    });
  }
  function remove() {
    if (!confirm("이 자료를 삭제할까요?")) return;
    start(async () => {
      await deleteLecture(l.id);
      router.refresh();
    });
  }

  return (
    <div className="card" style={{ padding: 14 }}>
      {!editing ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 200, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{l.title}</span>
              {l.category && <span className="muted" style={{ fontSize: 12.5 }}>· {l.category}</span>}
              {l.link && <a href={l.link} target="_blank" rel="noreferrer" className="btn sm">🔗 링크</a>}
            </div>
            {l.note && <div style={{ fontSize: 13.5, marginTop: 6, whiteSpace: "pre-wrap" }}>{l.note}</div>}
            {l.files.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {l.files.map((f, i) => (
                  <a key={i} href={f.url} target="_blank" rel="noreferrer" className="btn sm" title={f.name}>📎 {f.name}</a>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn sm" onClick={() => setEditing(true)}>수정</button>
            <button className="btn sm" onClick={remove} disabled={pending} style={{ color: "var(--owner)" }}>삭제</button>
          </div>
        </div>
      ) : (
        <form action={submit}>
          <Fields l={l} />
          {err && <div style={{ color: "var(--owner)", fontSize: 12, marginTop: 8 }}>{err}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="btn primary" disabled={pending}>{pending ? "저장 중…" : "수정 저장"}</button>
            <button type="button" className="btn" onClick={() => setEditing(false)} disabled={pending}>취소</button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function CommerceLecturesClient({ items, dbReady }: { items: Lecture[]; dbReady: boolean }) {
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>커머스강의</h1>
          <p>커머스 관련 강의 자료·영상 링크·파일을 모아둡니다.</p>
        </div>
        <AddForm />
      </div>

      {!dbReady && (
        <div className="card" style={{ padding: 14, marginBottom: 14 }}>
          <div className="empty">테이블이 아직 준비되지 않았습니다. 마이그레이션(0062_commerce_lectures.sql)을 적용해 주세요.</div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="card"><div className="empty">등록된 강의 자료가 없습니다. &ldquo;+ 강의 자료 추가&rdquo;로 파일이나 링크를 올리세요.</div></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((l) => <Row key={l.id} l={l} />)}
        </div>
      )}
    </div>
  );
}
