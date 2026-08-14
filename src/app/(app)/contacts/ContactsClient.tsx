"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createContact, updateContact, deleteContact, bulkAddContacts, importContacts, enrichContactFromPhone, type ImportedContact } from "./actions";
import RevisionHistoryModal from "@/components/RevisionHistoryModal";

export type Contact = {
  id: string;
  name: string;
  category: string;
  job: string;
  title: string;
  company: string;
  agency: string;
  groupWork: string;
  contact: string;
  contact2: string;
  email: string;
  birthday: string;
  birthYear: number | null;
  hometown: string;
  education: string;
  address: string;
  whereMet: string;
  marital: string;
  hasChildren: boolean;
  childrenNames: string;
  note: string;
};

const CATEGORIES = ["기업인", "연예인", "인플루언서", "전문직", "투자관련", "운동선수", "정치인", "F&B", "엔터&제작사", "직장인", "ss", "기타"] as const;
const CAT_COLOR: Record<string, string> = {
  기업인: "#2563eb",
  연예인: "#db2777",
  인플루언서: "#f59e0b",
  전문직: "#0d9488",
  투자관련: "#7c3aed",
  운동선수: "#16a34a",
  정치인: "#334155",
  "F&B": "#ea580c",
  "엔터&제작사": "#c026d3",
  직장인: "#0891b2",
  ss: "#9333ea",
  기타: "#64748b",
};
const MARITAL = ["", "미혼", "기혼", "기타"];
const TITLES = ["대표", "임원", "직원"];
const JOB_SUGGESTIONS = ["거래처", "배우", "가수", "방송인", "개그맨", "운동선수", "유튜버", "인플루언서", "의사", "변호사", "회계사", "투자자", "기타"];

// ── 휴대폰 연락처 가져오기 ──
// 1) 지원 기기(안드로이드 크롬 등)는 Contact Picker API로 연락처를 직접 골라 가져온다.
// 2) 미지원(iOS 등)은 .vcf 파일을 선택하면 파싱해서 가져온다.
const vcUnesc = (s: string) => (s || "").replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
// .vcf 텍스트(여러 명 포함 가능) → 연락처 배열
function parseVcf(text: string): ImportedContact[] {
  const out: ImportedContact[] = [];
  const cards = text.split(/BEGIN:VCARD/i).slice(1);
  for (const card of cards) {
    // 접힌 줄(다음 줄이 공백/탭으로 시작) 펼치기
    const raw = card.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
    const lines = raw.split(/\r?\n/);
    let fn = "", n = "", org = "", email = "";
    const tels: string[] = [];
    for (const line of lines) {
      const idx = line.indexOf(":");
      if (idx < 0) continue;
      const head = line.slice(0, idx).toUpperCase();
      const val = vcUnesc(line.slice(idx + 1).trim());
      const key = head.split(";")[0];
      if (key === "FN") fn = val;
      else if (key === "N") n = val.split(";").filter(Boolean).join(" ").trim();
      else if (key === "ORG") org = val.split(";").filter(Boolean).join(" ").trim();
      else if (key === "TEL") { if (val) tels.push(val); }
      else if (key === "EMAIL") { if (!email) email = val; }
    }
    const name = (fn || n).trim();
    if (!name && tels.length === 0) continue;
    out.push({ name, contact: tels[0], contact2: tels[1], email: email || undefined, company: org || undefined });
  }
  return out;
}

function Fields({ c }: { c?: Contact }) {
  return (
    <>
      <div className="row">
        <label className="field" style={{ marginBottom: 0 }}>
          <span>이름 *</span>
          <input name="name" required defaultValue={c?.name ?? ""} />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>직업군</span>
          <select name="category" defaultValue={c?.category ?? ""}>
            <option value="">(선택)</option>
            {CATEGORIES.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>직업</span>
          <input name="job" list="job-suggestions" placeholder="선택 또는 입력" defaultValue={c?.job ?? ""} />
          <datalist id="job-suggestions">
            {JOB_SUGGESTIONS.map((j) => <option key={j} value={j} />)}
          </datalist>
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>직책</span>
          <input name="title" list="title-suggestions" placeholder="대표/임원/직원 또는 직접 입력" defaultValue={c?.title ?? ""} />
          <datalist id="title-suggestions">
            {TITLES.map((t) => <option key={t} value={t} />)}
          </datalist>
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>회사명</span>
          <input name="company" defaultValue={c?.company ?? ""} />
        </label>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>소속사</span>
          <input name="agency" defaultValue={c?.agency ?? ""} />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>그룹명·대표작</span>
          <input name="group_work" placeholder="예) 슈퍼주니어 / 제빵왕 김탁구" defaultValue={c?.groupWork ?? ""} />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>출생연도</span>
          <input name="birth_year" type="number" placeholder="예) 1988" defaultValue={c?.birthYear ?? ""} />
        </label>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>연락처</span>
          <input name="contact" placeholder="010-0000-0000" defaultValue={c?.contact ?? ""} />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>연락처2</span>
          <input name="contact2" placeholder="추가 번호" defaultValue={c?.contact2 ?? ""} />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>이메일</span>
          <input name="email" type="email" defaultValue={c?.email ?? ""} />
        </label>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>생일</span>
          <input name="birthday" placeholder="예) 1988-03-14 / 3/14 / 음력 8/15" defaultValue={c?.birthday ?? ""} />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>고향</span>
          <input name="hometown" defaultValue={c?.hometown ?? ""} />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>학력</span>
          <input name="education" defaultValue={c?.education ?? ""} />
        </label>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>집주소</span>
          <input name="address" defaultValue={c?.address ?? ""} />
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

function BulkForm() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function submit() {
    setMsg(null);
    start(async () => {
      const r = await bulkAddContacts(text);
      if (!r.ok) return setMsg("❌ " + (r.error ?? "실패"));
      setMsg(`✅ ${r.added ?? 0}명 추가 · ${r.updated ?? 0}명 갱신`);
      setText("");
      router.refresh();
    });
  }

  if (!open) return <button className="btn" onClick={() => setOpen(true)}>📋 명단 붙여넣기</button>;
  return (
    <div className="card" style={{ padding: 14, marginBottom: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>명단 붙여넣기 일괄 추가</div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 0, marginBottom: 8 }}>
        한 줄에 한 명. 형식: <b>이름, 직업군, 직업, 회사, 연락처</b> (직업군·뒤 항목은 생략 가능).<br />
        예) <code>홍길동, 기업인, 대표, 운호컴퍼니, 010-0000-0000</code> · 또는 이름만 <code>홍길동</code><br />
        이미 있는 이름이면 중복 없이 빈 항목만 채우고 직업군을 갱신합니다.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        placeholder={"김보성, 연예인, 배우\n핏블리, 인플루언서\n홍길동, 기업인, 대표, 운호컴퍼니, 010-1234-5678"}
        style={{ width: "100%", fontSize: 13, fontFamily: "inherit" }}
      />
      {msg && <div style={{ fontSize: 13, marginTop: 8 }}>{msg}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button className="btn primary" onClick={submit} disabled={pending || !text.trim()}>{pending ? "처리 중…" : "일괄 추가"}</button>
        <button className="btn" onClick={() => setOpen(false)} disabled={pending}>닫기</button>
      </div>
    </div>
  );
}

function Row({ c }: { c: Contact }) {
  const [editing, setEditing] = useState(false);
  const [hist, setHist] = useState(false);
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

  const jobLine = [c.job, c.title, c.company].filter(Boolean).join(" · ");
  const family = [
    c.marital,
    c.hasChildren ? `자녀 있음${c.childrenNames ? ` (${c.childrenNames})` : ""}` : c.marital ? "자녀 없음" : "",
  ].filter(Boolean).join(" · ");
  const catColor = CAT_COLOR[c.category] ?? "#64748b";
  const tel = (c.contact || "").replace(/[^0-9+]/g, "");
  const [kakaoHint, setKakaoHint] = useState(false);
  const [pickMsg, setPickMsg] = useState<string | null>(null);
  const copyForKakao = () => {
    if (c.contact) { try { navigator.clipboard.writeText(c.contact); } catch { /* ignore */ } }
    setKakaoHint(true);
    setTimeout(() => setKakaoHint(false), 6000);
    // 링크 자체(href)로 카톡 앱을 여는 게 더 잘 열림. 안 열리면 번호는 이미 복사됨.
  };

  // 이 사람 카드에 휴대폰 주소록에서 번호/이메일을 골라 채워 넣기(Contact Picker API).
  const pickFromPhone = async () => {
    setPickMsg(null);
    const nav = navigator as any;
    if (!nav.contacts || !nav.contacts.select) {
      setPickMsg("이 기기의 브라우저는 폰 연락처 직접 선택을 지원하지 않아요. (안드로이드 크롬에서 지원)");
      return;
    }
    try {
      const props = ["name", "tel", "email"];
      const supported = (await nav.contacts.getProperties?.()) ?? props;
      const chosen = await nav.contacts.select(props.filter((p) => supported.includes(p)), { multiple: false });
      const one = chosen?.[0];
      if (!one) return; // 취소
      const picked = {
        contact: (one.tel && one.tel[0]) || undefined,
        contact2: (one.tel && one.tel[1]) || undefined,
        email: (one.email && one.email[0]) || undefined,
      };
      if (!picked.contact && !picked.email) { setPickMsg("선택한 연락처에 번호·이메일이 없어요."); return; }
      start(async () => {
        const r = await enrichContactFromPhone(c.id, picked);
        if (!r.ok) { setPickMsg("❌ " + (r.error ?? "실패")); return; }
        setPickMsg((r.filled && r.filled.length) ? `✅ ${r.filled.join("·")} 채움` : "이미 채워져 있어요");
        router.refresh();
      });
    } catch {
      setPickMsg("연락처 선택이 취소되었거나 실패했어요.");
    }
  };

  return (
    <div className="card" style={{ padding: 14, borderLeft: c.category ? `4px solid ${catColor}` : undefined }}>
      {hist && (
        <RevisionHistoryModal
          entity="contacts"
          recordId={c.id}
          title={c.name}
          preview={(s) => `${s?.name ?? ""}${s?.company ? ` · ${s.company}` : ""}${s?.contact ? ` · ${s.contact}` : ""}${s?.category ? ` [${s.category}]` : ""}`}
          onClose={() => setHist(false)}
        />
      )}
      {!editing ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 200, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {c.category && <span className="badge" style={{ background: catColor, color: "#fff" }}>{c.category}</span>}
              <span style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</span>
              {c.birthYear ? <span className="muted" style={{ fontSize: 12 }}>{c.birthYear}년생</span> : null}
              {jobLine && <span className="muted" style={{ fontSize: 12.5 }}>{jobLine}</span>}
            </div>
            {(c.agency || c.groupWork) && (
              <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                {[c.groupWork, c.agency].filter(Boolean).join(" · ")}
              </div>
            )}
            <div className="muted" style={{ fontSize: 12.5, marginTop: 3, display: "flex", gap: 12, flexWrap: "wrap" }}>
              {c.contact && <span>📞 {c.contact}</span>}
              {c.contact2 && <span>📱 {c.contact2}</span>}
              {c.email && <span>✉️ {c.email}</span>}
              {(c.birthday || c.birthYear) && <span>🎂 {c.birthday || `${c.birthYear}년생`}</span>}
              {c.hometown && <span>🏠 {c.hometown}</span>}
              {c.whereMet && <span>📍 {c.whereMet}</span>}
            </div>
            {c.education && <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>🎓 {c.education}</div>}
            {c.address && <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>📮 {c.address}</div>}
            {family && <div style={{ fontSize: 13, marginTop: 4 }}>👪 {family}</div>}
            {c.note && <div style={{ fontSize: 13, marginTop: 5, whiteSpace: "pre-wrap" }}>📝 {c.note}</div>}
            {c.contact && (
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                <a href={`tel:${tel}`} className="btn sm">📞 전화</a>
                <a href={`sms:${tel}`} className="btn sm">💬 문자</a>
                <a href="kakaotalk://" onClick={copyForKakao} className="btn sm" title="번호 복사 후 카카오톡 열기" style={{ background: "#fee500", borderColor: "#fee500", color: "#3c1e1e", textDecoration: "none" }}>🟡 카톡</a>
              </div>
            )}
            {kakaoHint && (
              <div style={{ fontSize: 12, marginTop: 6, color: "#92400e", background: "#fef3c7", border: "1px solid #fbbf24", borderRadius: 6, padding: "6px 8px" }}>
                📋 번호 복사됨! 카톡이 <b>자동으로 안 열리면</b> 직접 카카오톡을 열고 <b>검색창(돋보기)</b>에 붙여넣어 대화하세요. (카카오 정책상 대화창 바로 열기는 불가)
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
            <button className="btn sm primary" onClick={pickFromPhone} disabled={pending} title="휴대폰 주소록에서 이 사람 번호를 골라 채우기" style={{ whiteSpace: "nowrap" }}>
              {pending ? "가져오는 중…" : "📥 연락처 가져오기"}
            </button>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn sm" onClick={() => setEditing(true)}>수정</button>
              <button className="btn sm" onClick={() => setHist(true)} title="버전 기록·복원">🕘</button>
              <button className="btn sm" onClick={remove} disabled={pending} style={{ color: "var(--owner)" }}>삭제</button>
            </div>
            {pickMsg && <span style={{ fontSize: 11.5, color: pickMsg.startsWith("✅") ? "var(--accent)" : "var(--ink-2)", textAlign: "right", maxWidth: 200 }}>{pickMsg}</span>}
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

function ImportForm() {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const run = (list: ImportedContact[]) => {
    if (!list.length) { setMsg("가져올 연락처가 없습니다."); return; }
    start(async () => {
      const r = await importContacts(list);
      if (!r.ok) { setMsg("❌ " + (r.error ?? "실패")); return; }
      setMsg(`✅ ${r.added ?? 0}명 추가 · 중복 ${r.skipped ?? 0}명 건너뜀`);
      router.refresh();
    });
  };

  // 1) Contact Picker API (안드로이드 크롬 등). 지원되면 연락처를 바로 고를 수 있다.
  const pickFromPhone = async () => {
    setMsg(null);
    const nav = navigator as any;
    if (!nav.contacts || !nav.contacts.select) { fileRef.current?.click(); return; }
    setBusy(true);
    try {
      const props = ["name", "tel", "email"];
      const supported = (await nav.contacts.getProperties?.()) ?? props;
      const selected = await nav.contacts.select(props.filter((p) => supported.includes(p)), { multiple: true });
      const list: ImportedContact[] = (selected ?? []).map((c: any) => ({
        name: (c.name && c.name[0]) || "",
        contact: (c.tel && c.tel[0]) || undefined,
        contact2: (c.tel && c.tel[1]) || undefined,
        email: (c.email && c.email[0]) || undefined,
      }));
      setBusy(false);
      run(list);
    } catch (e) {
      setBusy(false);
      // 사용자가 취소했거나 미지원 → 파일 선택으로 유도
      setMsg("연락처 직접 선택이 지원되지 않아요. 연락처 파일(.vcf)로 가져오기를 눌러주세요.");
    }
  };

  const onFile = async (file: File) => {
    setMsg(null); setBusy(true);
    try {
      const text = await file.text();
      const list = parseVcf(text);
      setBusy(false);
      run(list);
    } catch {
      setBusy(false);
      setMsg("파일을 읽지 못했습니다.");
    }
  };

  const canPick = typeof navigator !== "undefined" && (navigator as any).contacts?.select;

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
      <input ref={fileRef} type="file" accept=".vcf,text/vcard,text/x-vcard" style={{ display: "none" }}
        onChange={(e) => { if (e.target.files?.[0]) onFile(e.target.files[0]); e.target.value = ""; }} />
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn" onClick={pickFromPhone} disabled={busy || pending} title="휴대폰 연락처를 골라서 인적자산으로 가져오기">
          {busy || pending ? "가져오는 중…" : "📥 연락처 가져오기"}
        </button>
        {!canPick && (
          <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy || pending} title="연락처(.vcf) 파일로 가져오기">📄 파일(.vcf)</button>
        )}
      </div>
      {msg && <span style={{ fontSize: 12, color: msg.startsWith("✅") ? "var(--accent)" : "var(--ink-2)" }}>{msg}</span>}
    </div>
  );
}

export default function ContactsClient({ items, dbReady }: { items: Contact[]; dbReady: boolean }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("전체");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter((c) => {
      if (cat !== "전체" && (c.category || "기타") !== cat) return false;
      if (!s) return true;
      return [c.name, c.job, c.title, c.company, c.contact, c.whereMet, c.childrenNames, c.note]
        .filter(Boolean).join(" ").toLowerCase().includes(s);
    });
  }, [items, q, cat]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of items) {
      const k = c.category || "기타";
      m[k] = (m[k] ?? 0) + 1;
    }
    return m;
  }, [items]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>🔒 인적자산</h1>
          <p>대표님만 볼 수 있는 개인 인적자산(인맥) 수첩입니다.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <ImportForm />
          <BulkForm />
          <AddForm />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14, overflow: "hidden", border: "1px solid #bfdbfe" }}>
        <div style={{ padding: "10px 16px", background: "linear-gradient(120deg, #1d4ed8, #38bdf8)", color: "#fff", fontWeight: 800, fontSize: 14 }}>🤝 인맥 원칙</div>
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#0c4a6e" }}>기버(Giver) — 먼저 퍼줄 것.</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#b91c1c" }}>돈 문제는 절대 만들지 말 것.</div>
        </div>
      </div>

      {!dbReady && (
        <div className="card" style={{ padding: 14, marginBottom: 14 }}>
          <div className="empty">테이블이 아직 준비되지 않았습니다. 마이그레이션(0059/0060)을 적용해 주세요.</div>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {["전체", ...CATEGORIES].map((t) => {
          const n = t === "전체" ? items.length : counts[t] ?? 0;
          return (
            <button key={t} className={`btn sm${cat === t ? " primary" : ""}`} onClick={() => setCat(t)}>
              {t} {n > 0 && <span style={{ opacity: 0.7 }}>({n})</span>}
            </button>
          );
        })}
      </div>

      <div style={{ marginBottom: 14, maxWidth: 360 }}>
        <input placeholder="이름·회사·연락처 검색" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%" }} />
      </div>

      {filtered.length === 0 ? (
        <div className="card"><div className="empty">{q || cat !== "전체" ? "해당 결과가 없습니다." : "등록된 인맥이 없습니다. “+ 인맥 추가” 또는 “📋 명단 붙여넣기”로 시작하세요."}</div></div>
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
