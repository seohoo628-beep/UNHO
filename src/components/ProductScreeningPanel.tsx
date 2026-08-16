"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveScreening, deleteScreening, type Screening } from "@/app/(app)/commerce-framework/actions";

const CRITERIA = [
  "객단가 3만원↑, 1인 구매액 5만원↑",
  "재구매 발생 (주기 2주~2개월)",
  "재구매 없다면 SKU 확장 가능",
  "메인 키워드 검색량 월 10만↑",
  "카테고리 1~3위가 프리미엄",
  "중·소형 키워드로도 확장 가능",
  "유통기한 1~2년·상온·부피 작음(수출)",
  "패키지가 경쟁 대비 눈에 띔",
];
const DIFFS = ["최초", "최다", "최고", "최저", "특허", "독점", "제조공법", "주원료", "주요소재", "원산지", "색상", "맛의 종류", "패키지", "인증", "논문", "공신력 있는 인물", "디자인"];

export default function ProductScreeningPanel({
  initial,
  brands,
  tableMissing,
}: {
  initial: Screening[];
  brands: { id: string; name: string }[];
  tableMissing?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [id, setId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [checks, setChecks] = useState<boolean[]>(Array(8).fill(false));
  const [diffs, setDiffs] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const passCount = checks.filter(Boolean).length;
  const passed = passCount === 8 && diffs.length >= 1;

  const reset = () => { setEditing(false); setId(null); setName(""); setBrand(""); setChecks(Array(8).fill(false)); setDiffs([]); setNote(""); setMsg(null); };
  const startEdit = (s: Screening) => {
    setEditing(true); setId(s.id); setName(s.productName); setBrand(s.brand ?? "");
    setChecks(Array.from({ length: 8 }, (_, i) => !!s.checks[i])); setDiffs(s.diffs); setNote(s.note ?? "");
    setOpen(true);
  };
  const submit = () => {
    setMsg(null);
    start(async () => {
      const r = await saveScreening({ id: id ?? undefined, productName: name, brand: brand || null, checks, diffs, passed, note });
      if (!r.ok) { setMsg("❌ " + (r.error ?? "저장 실패")); return; }
      reset(); router.refresh();
    });
  };
  const remove = (sid: string) => {
    if (!confirm("이 심사를 삭제할까요?")) return;
    start(async () => { await deleteScreening(sid); router.refresh(); });
  };

  if (tableMissing) {
    return (
      <div className="card" style={{ borderLeft: "4px solid var(--warn,#f59e0b)", marginBottom: 16, padding: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>✅ 제품 채택 심사 (8필터) — DB 설정 필요</div>
        <div className="muted" style={{ fontSize: 12 }}>마이그레이션 <code>0077_commerce_framework.sql</code> 실행 후 팀 공유 심사 기능이 켜집니다.</div>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 16, padding: 0, overflow: "hidden", borderLeft: "4px solid #16a34a" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "10px 14px", background: "linear-gradient(120deg,#16a34a18,#16a34a06)" }}>
        <button onClick={() => setOpen((o) => !o)} style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 800, fontSize: 14.5, color: "var(--ink)", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>▸</span>
          ✅ 제품 채택 심사 (8필터) <span className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}>· {initial.length}건</span>
        </button>
        {open && !editing && <button className="btn sm primary" onClick={() => { reset(); setEditing(true); }}>+ 심사 추가</button>}
      </div>

      {open && (
        <div style={{ padding: 14 }}>
          {editing && (
            <div className="card" style={{ padding: 14, marginBottom: 12, borderLeft: `4px solid ${passed ? "var(--ok,#16a34a)" : "var(--warn,#f59e0b)"}` }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="제품명 *" style={inp} />
                <select value={brand} onChange={(e) => setBrand(e.target.value)} style={{ ...inp, maxWidth: 160 }}>
                  <option value="">브랜드(선택)</option>
                  {brands.map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}
                </select>
                <div style={{ marginLeft: "auto", fontWeight: 800, color: passed ? "var(--ok,#16a34a)" : "var(--warn,#b45309)" }}>
                  {passed ? "✅ 통과" : "⏳ 보류"} <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>{passCount}/8 · 차별화 {diffs.length}</span>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 6, marginBottom: 10 }}>
                {CRITERIA.map((c, i) => (
                  <label key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start", fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={checks[i]} onChange={() => setChecks((p) => p.map((v, j) => (j === i ? !v : v)))} style={{ marginTop: 2 }} />
                    <span>{c}</span>
                  </label>
                ))}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-2)", marginBottom: 4 }}>차별화 근거 (최소 1개)</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
                {DIFFS.map((d) => (
                  <button key={d} className={`btn sm${diffs.includes(d) ? " primary" : ""}`} onClick={() => setDiffs((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]))}>{d}</button>
                ))}
              </div>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="메모(선택)" style={{ ...inp, marginBottom: 10 }} />
              {msg && <div style={{ color: "var(--owner)", fontSize: 12, marginBottom: 8 }}>{msg}</div>}
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn sm primary" onClick={submit} disabled={pending || !name.trim()}>{pending ? "저장 중…" : id ? "수정 저장" : "저장"}</button>
                <button className="btn sm" onClick={reset} disabled={pending}>취소</button>
              </div>
            </div>
          )}

          {initial.length === 0 && !editing ? (
            <div className="muted" style={{ fontSize: 13 }}>아직 심사한 제품이 없습니다. “+ 심사 추가”로 8필터를 통과시키세요. (통과 못 하면 만들지 않는다)</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {initial.map((s) => (
                <div key={s.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0", borderTop: "1px solid var(--line)" }}>
                  <span className="badge" style={{ background: s.passed ? "var(--ok,#16a34a)" : "var(--warn,#f59e0b)", color: "#fff", flexShrink: 0 }}>{s.passed ? "통과" : "보류"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{s.productName}{s.brand ? <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}> · {s.brand}</span> : null}</div>
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                      기준 {s.checks.filter(Boolean).length}/8 · 차별화 {s.diffs.length}개{s.diffs.length ? ` (${s.diffs.slice(0, 4).join("·")}${s.diffs.length > 4 ? "…" : ""})` : ""}
                      {s.author ? ` · ${s.author}` : ""}
                    </div>
                    {s.note && <div style={{ fontSize: 12.5, marginTop: 2 }}>{s.note}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button className="btn sm" onClick={() => startEdit(s)}>수정</button>
                    <button className="btn sm" onClick={() => remove(s.id)} disabled={pending} style={{ color: "var(--owner)" }}>삭제</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const inp: React.CSSProperties = { flex: 1, minWidth: 140, padding: "8px 10px", border: "1px solid var(--line-2)", borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--ink)", fontSize: 13.5 };
