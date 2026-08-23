"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createFoodPlace, updateFoodPlace, deleteFoodPlace, searchPlace, type FoodPlaceInput, type PlaceHit } from "./actions";

export type FoodPlace = {
  id: string;
  name: string;
  category: string;
  phone: string;
  address: string;
  mapUrl: string;
  visitedOn: string;
  companions: string;
  price: string;
  memo: string;
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 11px", border: "1px solid var(--line-2)",
  borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--ink)",
};

const empty: FoodPlaceInput = { name: "", category: "", phone: "", address: "", mapUrl: "", visitedOn: "", companions: "", price: "", memo: "" };

function PlaceForm({ initial, onDone, onCancel }: { initial?: FoodPlace; onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState<FoodPlaceInput>(
    initial
      ? { name: initial.name, category: initial.category, phone: initial.phone, address: initial.address, mapUrl: initial.mapUrl, visitedOn: initial.visitedOn, companions: initial.companions, price: initial.price, memo: initial.memo }
      : empty
  );
  const [hits, setHits] = useState<PlaceHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = (patch: Partial<FoodPlaceInput>) => setF((p) => ({ ...p, ...patch }));

  const doSearch = () => {
    setErr(null); setSearching(true); setHits(null);
    start(async () => {
      const r = await searchPlace(f.name ?? "");
      setSearching(false);
      if (!r.ok) { setErr(r.error ?? "검색 실패"); return; }
      if (!r.hits?.length) { setErr("검색 결과가 없습니다. 상호를 조금 다르게 입력해 보세요."); return; }
      setHits(r.hits);
    });
  };

  const pick = (h: PlaceHit) => {
    set({ name: h.name, category: h.category, phone: h.phone, address: h.address, mapUrl: h.mapUrl });
    setHits(null);
  };

  const submit = () => {
    setErr(null);
    start(async () => {
      const r = initial ? await updateFoodPlace(initial.id, f) : await createFoodPlace(f);
      if (!r.ok) { setErr(r.error ?? "저장 실패"); return; }
      onDone();
    });
  };

  return (
    <div className="card" style={{ padding: 14, marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          value={f.name}
          onChange={(e) => set({ name: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); doSearch(); } }}
          placeholder="상호 (예: 성수 갈비집)"
          style={{ ...inputStyle, flex: "1 1 200px" }}
          autoFocus={!initial}
        />
        <button className="btn" onClick={doSearch} disabled={searching || (f.name ?? "").trim().length < 2}>
          {searching ? "검색 중…" : "🔍 자동검색"}
        </button>
      </div>

      {hits && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4, border: "1px solid var(--accent)", borderRadius: 10, padding: 8, background: "var(--accent-bg)" }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--accent)" }}>결과를 선택하면 주소·업종·전화가 채워집니다</div>
          {hits.map((h, i) => (
            <button key={i} onClick={() => pick(h)} className="btn" style={{ textAlign: "left", padding: "7px 10px", display: "block" }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{h.name} <span className="muted" style={{ fontWeight: 400, fontSize: 11.5 }}>{h.category}</span></div>
              <div className="muted" style={{ fontSize: 12 }}>{h.address}{h.phone ? ` · ${h.phone}` : ""}</div>
            </button>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, marginTop: 10 }}>
        <label className="field" style={{ margin: 0 }}><span>업종</span><input value={f.category} onChange={(e) => set({ category: e.target.value })} placeholder="한식 > 갈비" style={inputStyle} /></label>
        <label className="field" style={{ margin: 0 }}><span>전화</span><input value={f.phone} onChange={(e) => set({ phone: e.target.value })} style={inputStyle} /></label>
        <label className="field" style={{ margin: 0, gridColumn: "1 / -1" }}><span>주소</span><input value={f.address} onChange={(e) => set({ address: e.target.value })} style={inputStyle} /></label>
        <label className="field" style={{ margin: 0 }}><span>방문일</span><input type="date" value={f.visitedOn} onChange={(e) => set({ visitedOn: e.target.value })} style={inputStyle} /></label>
        <label className="field" style={{ margin: 0 }}><span>누구랑</span><input value={f.companions} onChange={(e) => set({ companions: e.target.value })} placeholder="예: 박이사, 거래처 김대표" style={inputStyle} /></label>
        <label className="field" style={{ margin: 0 }}><span>가격</span><input value={f.price} onChange={(e) => set({ price: e.target.value })} placeholder="예: 1인 3.5만 / 총 14만" style={inputStyle} /></label>
      </div>
      <label className="field" style={{ marginTop: 8 }}>
        <span>메모</span>
        <textarea value={f.memo} onChange={(e) => set({ memo: e.target.value })} rows={2} placeholder="맛·분위기·재방문 여부, 추천 메뉴 등" style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
      </label>

      {err && <div style={{ color: "var(--owner)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button className="btn primary" onClick={submit} disabled={pending || !(f.name ?? "").trim()}>{pending ? "저장 중…" : initial ? "수정 저장" : "저장"}</button>
        <button className="btn" onClick={onCancel} disabled={pending}>취소</button>
      </div>
    </div>
  );
}

function Row({ p }: { p: FoodPlace }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const remove = () => {
    if (!confirm(`'${p.name}' 을(를) 삭제할까요?`)) return;
    start(async () => { await deleteFoodPlace(p.id); router.refresh(); });
  };

  if (editing) return <PlaceForm initial={p} onDone={() => { setEditing(false); router.refresh(); }} onCancel={() => setEditing(false)} />;

  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ minWidth: 220, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <strong style={{ fontSize: 15 }}>🍽 {p.name}</strong>
            {p.category && <span className="badge" style={{ background: "var(--line)", color: "var(--ink-2)", fontSize: 11 }}>{p.category}</span>}
            {p.price && <span className="badge" style={{ background: "#eef2ff", color: "#3730a3", fontSize: 11 }}>💰 {p.price}</span>}
          </div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
            {p.address}{p.phone ? ` · ☎ ${p.phone}` : ""}
          </div>
          {(p.visitedOn || p.companions) && (
            <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
              {p.visitedOn ? `📅 ${p.visitedOn}` : ""}{p.visitedOn && p.companions ? " · " : ""}{p.companions ? `👥 ${p.companions}` : ""}
            </div>
          )}
          {p.memo && <div style={{ fontSize: 13, marginTop: 5, whiteSpace: "pre-wrap" }}>📝 {p.memo}</div>}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "flex-start", flexWrap: "wrap" }}>
          {p.mapUrl && <a className="btn sm" href={p.mapUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>🗺 지도</a>}
          {p.phone && <a className="btn sm" href={`tel:${p.phone.replace(/[^\d]/g, "")}`} style={{ textDecoration: "none" }}>📞 전화</a>}
          <button className="btn sm" onClick={() => setEditing(true)}>수정</button>
          <button className="btn sm" onClick={remove} disabled={pending} style={{ color: "var(--owner)" }}>삭제</button>
        </div>
      </div>
    </div>
  );
}

export default function FoodPlacesClient({ items, dbReady }: { items: FoodPlace[]; dbReady: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((p) => [p.name, p.category, p.address, p.companions, p.memo].filter(Boolean).join(" ").toLowerCase().includes(s));
  }, [items, q]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>🍽 맛집 저장</h1>
          <p>대표님만 보는 맛집 기록 · {items.length}곳 · 상호 검색으로 주소·업종·전화 자동 입력</p>
        </div>
        {!adding && <button className="btn primary" onClick={() => setAdding(true)}>+ 맛집 추가</button>}
      </div>

      {!dbReady && (
        <div className="card" style={{ padding: 14, marginBottom: 14 }}>
          <div className="empty">테이블이 아직 없습니다. 설정 → DB 스키마 점검에서 0090 SQL을 실행해 주세요.</div>
        </div>
      )}

      {adding && <PlaceForm onDone={() => { setAdding(false); router.refresh(); }} onCancel={() => setAdding(false)} />}

      <div style={{ marginBottom: 12, maxWidth: 360 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="상호·업종·주소·동행·메모 검색" style={inputStyle} />
      </div>

      {filtered.length === 0 ? (
        <div className="card"><div className="empty">{q ? "검색 결과가 없습니다." : "저장된 맛집이 없습니다. “+ 맛집 추가”로 시작하세요."}</div></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((p) => <Row key={p.id} p={p} />)}
        </div>
      )}
    </div>
  );
}
