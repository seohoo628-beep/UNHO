"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { createCard, updateCard, deleteCard, ocrCard } from "./actions";

export type Card = {
  id: string;
  name: string;
  company: string;
  department: string;
  position: string;
  mobile: string;
  officePhone: string;
  email: string;
  fax: string;
  address: string;
  website: string;
  tags: string;
  imageUrl: string;
  metDate: string;
  note: string;
};

const empty = (): Card => ({
  id: "", name: "", company: "", department: "", position: "", mobile: "",
  officePhone: "", email: "", fax: "", address: "", website: "", tags: "",
  imageUrl: "", metDate: "", note: "",
});

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "1px solid var(--line-2)",
  borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--ink)", fontSize: 13,
};

function toFormData(c: Card): FormData {
  const fd = new FormData();
  fd.set("name", c.name); fd.set("company", c.company); fd.set("department", c.department);
  fd.set("position", c.position); fd.set("mobile", c.mobile); fd.set("office_phone", c.officePhone);
  fd.set("email", c.email); fd.set("fax", c.fax); fd.set("address", c.address);
  fd.set("website", c.website); fd.set("tags", c.tags); fd.set("image_url", c.imageUrl);
  fd.set("met_date", c.metDate); fd.set("note", c.note);
  return fd;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 11.5, color: "var(--ink-2)", marginBottom: 3, fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

function CardForm({ initial, onCancel, onSaved }: { initial: Card; onCancel: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Card>(initial);
  const [err, setErr] = useState<string | null>(null);
  const [upBusy, setUpBusy] = useState("");
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrMsg, setOcrMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof Card, v: string) => setF((p) => ({ ...p, [k]: v }));

  const uploadImage = async (file: File) => {
    setErr(null); setOcrMsg(null);
    if (!file.type.startsWith("image")) { setErr("이미지 파일만 올릴 수 있습니다."); return; }
    setUpBusy("이미지 업로드 중…");
    const supabase = createSupabaseBrowserClient();
    const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/generated-media/`;
    const dot = file.name.lastIndexOf(".");
    const ext = (dot >= 0 ? file.name.slice(dot + 1) : "jpg").replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(0, 8) || "jpg";
    const rand = Math.random().toString(36).slice(2, 8);
    const path = `business-cards/${Date.now()}_${rand}.${ext}`;
    const { error } = await supabase.storage.from("generated-media").upload(path, file, { contentType: file.type || undefined, upsert: false });
    setUpBusy("");
    if (error) {
      const m = error.message || "";
      if (/exceeded|maximum allowed size|payload too large|413|too large/i.test(m)) setErr("이미지 용량이 저장소 허용치를 초과했습니다.");
      else if (/row-level|policy|unauthor|403|not allowed|violat/i.test(m)) setErr("업로드 권한이 없습니다. 저장소 권한 SQL을 실행해 주세요.");
      else setErr("업로드 실패: " + m);
      return;
    }
    const url = base + path;
    setF((p) => ({ ...p, imageUrl: url }));
    // 업로드 직후 AI 자동인식
    runOcr(url);
  };

  const runOcr = (url?: string) => {
    const target = url || f.imageUrl;
    if (!target) { setErr("먼저 명함 이미지를 올려주세요."); return; }
    setOcrBusy(true); setOcrMsg("AI가 명함을 읽는 중…"); setErr(null);
    start(async () => {
      const r = await ocrCard(target);
      setOcrBusy(false);
      if (!r.ok || !r.data) { setOcrMsg(null); setErr(r.error ?? "AI 인식 실패"); return; }
      const d = r.data;
      setF((p) => ({
        ...p,
        name: d.name || p.name,
        company: d.company || p.company,
        department: d.department || p.department,
        position: d.position || p.position,
        mobile: d.mobile || p.mobile,
        officePhone: d.office_phone || p.officePhone,
        email: d.email || p.email,
        fax: d.fax || p.fax,
        address: d.address || p.address,
        website: d.website || p.website,
      }));
      setOcrMsg("✅ 자동 입력 완료 — 내용을 확인하고 저장하세요.");
    });
  };

  const save = () => {
    if (!f.name.trim() && !f.company.trim() && !f.imageUrl.trim()) { setErr("이름·회사 또는 명함 이미지를 입력하세요."); return; }
    start(async () => {
      const r = f.id ? await updateCard(f.id, toFormData(f)) : await createCard(toFormData(f));
      if (!r.ok) { setErr(r.error ?? "저장 실패"); return; }
      onSaved();
    });
  };

  return (
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {/* 명함 이미지 */}
        <div style={{ width: 240, maxWidth: "100%" }}>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { if (e.target.files?.[0]) uploadImage(e.target.files[0]); e.target.value = ""; }} />
          {f.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={f.imageUrl} alt="명함" style={{ width: "100%", borderRadius: 8, border: "1px solid var(--line-2)", display: "block" }} />
          ) : (
            <div onClick={() => fileRef.current?.click()} style={{ width: "100%", aspectRatio: "9/5", border: "2px dashed var(--line-2)", borderRadius: 8, display: "grid", placeItems: "center", cursor: "pointer", background: "var(--surface)", textAlign: "center", padding: 12 }}>
              <div>
                <div style={{ fontSize: 30 }}>📇</div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>명함 사진 올리기<br />(올리면 AI가 자동 인식)</div>
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn sm" onClick={() => fileRef.current?.click()} disabled={!!upBusy}>{f.imageUrl ? "다른 사진" : "사진 올리기"}</button>
            {f.imageUrl && <button type="button" className="btn sm" onClick={() => runOcr()} disabled={ocrBusy || pending}>🤖 AI 재인식</button>}
            {f.imageUrl && <button type="button" className="btn sm" onClick={() => set("imageUrl", "")} style={{ color: "var(--owner)" }}>사진 제거</button>}
          </div>
          {upBusy && <div className="muted" style={{ fontSize: 12, marginTop: 6, color: "var(--accent)" }}>{upBusy}</div>}
          {(ocrBusy || ocrMsg) && <div style={{ fontSize: 12, marginTop: 6, color: ocrBusy ? "var(--accent)" : "var(--ink-2)" }}>{ocrBusy ? "AI가 명함을 읽는 중…" : ocrMsg}</div>}
        </div>

        {/* 필드 */}
        <div style={{ flex: 1, minWidth: 260, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, alignContent: "start" }}>
          <Field label="이름"><input style={inputStyle} value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="직책"><input style={inputStyle} value={f.position} onChange={(e) => set("position", e.target.value)} /></Field>
          <Field label="회사"><input style={inputStyle} value={f.company} onChange={(e) => set("company", e.target.value)} /></Field>
          <Field label="부서"><input style={inputStyle} value={f.department} onChange={(e) => set("department", e.target.value)} /></Field>
          <Field label="휴대폰"><input style={inputStyle} value={f.mobile} onChange={(e) => set("mobile", e.target.value)} /></Field>
          <Field label="회사전화"><input style={inputStyle} value={f.officePhone} onChange={(e) => set("officePhone", e.target.value)} /></Field>
          <Field label="이메일"><input style={inputStyle} value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="팩스"><input style={inputStyle} value={f.fax} onChange={(e) => set("fax", e.target.value)} /></Field>
          <div style={{ gridColumn: "1 / -1" }}><Field label="주소"><input style={inputStyle} value={f.address} onChange={(e) => set("address", e.target.value)} /></Field></div>
          <Field label="홈페이지"><input style={inputStyle} value={f.website} onChange={(e) => set("website", e.target.value)} /></Field>
          <Field label="만난 날짜"><input style={inputStyle} value={f.metDate} onChange={(e) => set("metDate", e.target.value)} placeholder="예) 2026-08-10 / 박람회" /></Field>
          <div style={{ gridColumn: "1 / -1" }}><Field label="태그 (콤마 구분)"><input style={inputStyle} value={f.tags} onChange={(e) => set("tags", e.target.value)} placeholder="예) 거래처, 유통, VIP" /></Field></div>
          <div style={{ gridColumn: "1 / -1" }}><Field label="메모"><textarea rows={2} style={{ ...inputStyle, resize: "vertical" }} value={f.note} onChange={(e) => set("note", e.target.value)} /></Field></div>
        </div>
      </div>

      {err && <div style={{ color: "var(--owner)", fontSize: 12.5, marginTop: 10 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button className="btn primary" onClick={save} disabled={pending || ocrBusy || !!upBusy}>{pending ? "저장 중…" : f.id ? "수정 저장" : "저장"}</button>
        <button className="btn" onClick={onCancel} disabled={pending}>취소</button>
      </div>
    </div>
  );
}

function Row({ c, canEdit, onEdit }: { c: Card; canEdit: boolean; onEdit: () => void }) {
  const [pending, start] = useTransition();
  const [kakaoHint, setKakaoHint] = useState(false);
  const router = useRouter();
  const remove = () => {
    if (!confirm(`${c.name || c.company || "이 명함"}을(를) 삭제할까요?`)) return;
    start(async () => { await deleteCard(c.id, c.imageUrl); router.refresh(); });
  };
  const tel = (c.mobile || c.officePhone || "").replace(/[^0-9+]/g, "");
  const tags = c.tags ? c.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
  const line1 = [c.position, c.department].filter(Boolean).join(" · ");
  const copyForKakao = () => {
    if (c.mobile) { try { navigator.clipboard.writeText(c.mobile); } catch { /* ignore */ } }
    setKakaoHint(true); setTimeout(() => setKakaoHint(false), 6000);
  };

  return (
    <div className="card" style={{ padding: 14, display: "flex", gap: 14, flexWrap: "wrap" }}>
      {c.imageUrl && (
        <a href={c.imageUrl} target="_blank" rel="noreferrer" style={{ flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.imageUrl} alt="명함" style={{ width: 160, borderRadius: 8, border: "1px solid var(--line-2)", display: "block" }} />
        </a>
      )}
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>{c.name || "(이름 없음)"}</span>
          {line1 && <span className="muted" style={{ fontSize: 13 }}>{line1}</span>}
        </div>
        {c.company && <div style={{ fontSize: 13.5, marginTop: 2 }}>🏢 {c.company}</div>}
        <div className="muted" style={{ fontSize: 12.5, marginTop: 3, display: "flex", gap: 12, flexWrap: "wrap" }}>
          {c.mobile && <span>📱 {c.mobile}</span>}
          {c.officePhone && <span>☎️ {c.officePhone}</span>}
          {c.email && <span>✉️ {c.email}</span>}
          {c.fax && <span>🖨 {c.fax}</span>}
        </div>
        {c.address && <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>📮 {c.address}</div>}
        {c.website && <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>🌐 {c.website}</div>}
        {(c.metDate || tags.length > 0) && (
          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
            {c.metDate && <span className="muted" style={{ fontSize: 12 }}>📅 {c.metDate}</span>}
            {tags.map((t) => <span key={t} className="badge" style={{ background: "var(--line)", color: "var(--ink-2)" }}>{t}</span>)}
          </div>
        )}
        {c.note && <div style={{ fontSize: 13, marginTop: 5, whiteSpace: "pre-wrap" }}>📝 {c.note}</div>}
        {(tel || c.email) && (
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {tel && <a href={`tel:${tel}`} className="btn sm">📞 전화</a>}
            {tel && <a href={`sms:${tel}`} className="btn sm">💬 문자</a>}
            {c.email && <a href={`mailto:${c.email}`} className="btn sm">✉️ 메일</a>}
            {c.mobile && <a href="kakaotalk://" onClick={copyForKakao} className="btn sm" title="번호 복사 후 카카오톡 열기" style={{ background: "#fee500", borderColor: "#fee500", color: "#3c1e1e", textDecoration: "none" }}>🟡 카톡</a>}
          </div>
        )}
        {kakaoHint && (
          <div style={{ fontSize: 12, marginTop: 6, color: "#92400e", background: "#fef3c7", border: "1px solid #fbbf24", borderRadius: 6, padding: "6px 8px" }}>
            📋 번호 복사됨! 카톡이 자동으로 안 열리면 카카오톡을 열고 <b>검색창</b>에 붙여넣어 대화하세요.
          </div>
        )}
      </div>
      {canEdit && (
        <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
          <button className="btn sm" onClick={onEdit}>수정</button>
          <button className="btn sm" onClick={remove} disabled={pending} style={{ color: "var(--owner)" }}>삭제</button>
        </div>
      )}
    </div>
  );
}

export default function BusinessCardsClient({ items, dbReady, canEdit }: { items: Card[]; dbReady: boolean; canEdit: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("전체");
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    items.forEach((c) => c.tags?.split(",").map((t) => t.trim()).filter(Boolean).forEach((t) => set.add(t)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [items]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter((c) => {
      if (tag !== "전체") {
        const ts = c.tags?.split(",").map((t) => t.trim()) ?? [];
        if (!ts.includes(tag)) return false;
      }
      if (!s) return true;
      return [c.name, c.company, c.department, c.position, c.mobile, c.officePhone, c.email, c.address, c.website, c.tags, c.note]
        .filter(Boolean).join(" ").toLowerCase().includes(s);
    });
  }, [items, q, tag]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>📇 명함목록</h1>
          <p>명함 사진을 올리면 AI가 이름·회사·연락처를 자동 인식합니다. (리멤버 방식)</p>
        </div>
        {canEdit && !adding && <button className="btn primary" onClick={() => { setEditId(null); setAdding(true); }}>+ 명함 추가</button>}
      </div>

      {!dbReady && (
        <div className="card" style={{ padding: 14, marginBottom: 14 }}>
          <div className="empty">테이블이 아직 준비되지 않았습니다. 마이그레이션(0067_business_cards)을 적용해 주세요.</div>
        </div>
      )}

      {adding && canEdit && (
        <CardForm initial={empty()} onCancel={() => setAdding(false)} onSaved={() => { setAdding(false); router.refresh(); }} />
      )}

      {allTags.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {["전체", ...allTags].map((t) => (
            <button key={t} className={`btn sm${tag === t ? " primary" : ""}`} onClick={() => setTag(t)}>{t}</button>
          ))}
        </div>
      )}

      <div style={{ marginBottom: 14, maxWidth: 360 }}>
        <input placeholder="이름·회사·연락처·태그 검색" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%" }} />
      </div>

      {filtered.length === 0 ? (
        <div className="card"><div className="empty">{q || tag !== "전체" ? "해당 결과가 없습니다." : "등록된 명함이 없습니다. “+ 명함 추가”로 사진을 올려보세요."}</div></div>
      ) : (
        <>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>총 {filtered.length}건</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map((c) => (
              editId === c.id
                ? <CardForm key={c.id} initial={c} onCancel={() => setEditId(null)} onSaved={() => { setEditId(null); router.refresh(); }} />
                : <Row key={c.id} c={c} canEdit={canEdit} onEdit={() => { setAdding(false); setEditId(c.id); }} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
