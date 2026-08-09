"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createContact, updateContact, deleteContact } from "./actions";

export type Contact = {
  id: string;
  name: string;
  job: string;
  company: string;
  contact: string;
  birthday: string;
  whereMet: string;
  marital: string;
  hasChildren: boolean;
  childrenNames: string;
  note: string;
};

const MARITAL = ["", "미혼", "기혼", "기타"];

function Fields({ c }: { c?: Contact }) {
  return (
    <>
      <div className="row">
        <label className="field" style={{ marginBottom: 0 }}>
          <span>이름 *</span>
          <input name="name" required defaultValue={c?.name ?? ""} />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>직업</span>
          <input name="job" defaultValue={c?.job ?? ""} />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>회사명</span>
          <input name="company" defaultValue={c?.company ?? ""} />
        </label>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>연락처</span>
          <input name="contact" placeholder="010-0000-0000" defaultValue={c?.contact ?? ""} />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>생일</span>
          <input name="birthday" placeholder="예) 1988-03-14 / 3/14 / 음력 8/15" defaultValue={c?.birthday ?? ""} />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>만난 곳/관계</span>
          <input name="where_met" defaultValue={c?.whereMet ?? ""} />
        </label>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>결혼 유무</span>
          <select name="marital" defaultValue={c?.marital ?? ""}>
            {MARITAL.map((m) => <option key={m} value={m}>{m || "(선택)"}</option>)}
          </select>
        </label>
        <label className="field" style={{ marginBottom: 0, alignSelf: "end" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" name="has_children" defaultChecked={c?.hasChildren ?? false} /> 자녀 있음
          </span>
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>자녀 이름</span>
          <input name="children_names" placeholder="예) 지후, 서아" defaultValue={c?.childrenNames ?? ""} />
        </label>
      </div>
      <label className="field" style={{ marginTop: 10 }}>
        <span>메모</span>
        <textarea name="note" rows={2} placeholder="특이사항·선호·근황 등" defaultValue={c?.note ?? ""} />
      </label>
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
      const r = await createContact(fd);
      if (!r.ok) return setErr(r.error ?? "저장 실패");
      formRef.current?.reset();
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) return <button className="btn primary" onClick={() => setOpen(true)}>+ 인맥 추가</button>;
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

function Row({ c }: { c: Contact }) {
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function submit(fd: FormData) {
    setErr(null);
    start(async () => {
      const r = await updateContact(c.id, fd);
      if (!r.ok) return setErr(r.error ?? "저장 실패");
      setEditing(false);
      router.refresh();
    });
  }
  function remove() {
    if (!confirm(`${c.name} 님을 삭제할까요?`)) return;
    start(async () => {
      await deleteContact(c.id);
      router.refresh();
    });
  }

  const meta = [c.job, c.company].filter(Boolean).join(" · ");
  const family = [
    c.marital,
    c.hasChildren ? `자녀 있음${c.childrenNames ? ` (${c.childrenNames})` : ""}` : c.marital ? "자녀 없음" : "",
  ].filter(Boolean).join(" · ");

  return (
    <div className="card" style={{ padding: 14 }}>
      {!editing ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 200, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</span>
              {meta && <span className="muted" style={{ fontSize: 12.5 }}>{meta}</span>}
            </div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 3, display: "flex", gap: 12, flexWrap: "wrap" }}>
              {c.contact && <span>📞 {c.contact}</span>}
              {c.birthday && <span>🎂 {c.birthday}</span>}
              {c.whereMet && <span>📍 {c.whereMet}</span>}
            </div>
            {family && <div style={{ fontSize: 13, marginTop: 4 }}>👪 {family}</div>}
            {c.note && <div style={{ fontSize: 13, marginTop: 5, whiteSpace: "pre-wrap" }}>📝 {c.note}</div>}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn sm" onClick={() => setEditing(true)}>수정</button>
            <button className="btn sm" onClick={remove} disabled={pending} style={{ color: "var(--owner)" }}>삭제</button>
          </div>
        </div>
      ) : (
        <form action={submit}>
          <Fields c={c} />
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

export default function ContactsClient({ items, dbReady }: { items: Contact[]; dbReady: boolean }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((c) =>
      [c.name, c.job, c.company, c.contact, c.whereMet, c.childrenNames, c.note].filter(Boolean).join(" ").toLowerCase().includes(s)
    );
  }, [items, q]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>🔒 인맥관리</h1>
          <p>대표님만 볼 수 있는 개인 인맥 수첩입니다.</p>
        </div>
        <AddForm />
      </div>

      {!dbReady && (
        <div className="card" style={{ padding: 14, marginBottom: 14 }}>
          <div className="empty">테이블이 아직 준비되지 않았습니다. 마이그레이션(0059_contacts.sql)을 적용해 주세요.</div>
        </div>
      )}

      <div style={{ marginBottom: 14, maxWidth: 360 }}>
        <input className="input" placeholder="이름·회사·연락처 검색" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%" }} />
      </div>

      {filtered.length === 0 ? (
        <div className="card"><div className="empty">{q ? "검색 결과가 없습니다." : "등록된 인맥이 없습니다. “+ 인맥 추가”로 시작하세요."}</div></div>
      ) : (
        <>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>총 {filtered.length}명</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map((c) => <Row key={c.id} c={c} />)}
          </div>
        </>
      )}
    </div>
  );
}
