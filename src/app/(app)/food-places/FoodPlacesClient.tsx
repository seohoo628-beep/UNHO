"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
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
  photos: string[];
  menuPhotos: string[];
  cuisine: string;
};

// 음식 카테고리(필터·뱃지 공용).
export const CUISINES = ["한식", "중식", "일식", "양식", "오마카세", "아시아음식", "기타"] as const;

// 카카오 업종 문자열에서 음식 카테고리 자동 추정.
function cuisineFromKakao(category: string): string {
  const c = category || "";
  if (/오마카세/.test(c)) return "오마카세";
  if (/한식|국밥|찌개|고기|갈비|삼겹|족발|보쌈|냉면|한정식|백반|분식/.test(c)) return "한식";
  if (/중식|중국|짜장|마라|양꼬치|딤섬/.test(c)) return "중식";
  if (/일식|초밥|스시|라멘|돈까스|이자카야|우동|덮밥/.test(c)) return "일식";
  if (/양식|이탈리안|피자|파스타|스테이크|버거|브런치|프렌치/.test(c)) return "양식";
  if (/아시아|베트남|쌀국수|태국|타이|인도|커리|동남아/.test(c)) return "아시아음식";
  return c ? "기타" : "";
}

// 사진을 브라우저에서 축소(최대 1600px, JPEG)한 뒤 스토리지에 올린다. 실패 시 null.
async function uploadPhoto(file: File): Promise<string | null> {
  if (!file.type.startsWith("image")) return null;
  let blob: Blob | null = null;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as any).catch(() => createImageBitmap(file));
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.85));
  } catch { /* HEIC 등 디코드 실패 → 원본 업로드 */ }
  const body: Blob | File = blob ?? file;
  const ext = blob ? "jpg" : ((file.name.split(".").pop() || "jpg").replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(0, 8) || "jpg");
  const supabase = createSupabaseBrowserClient();
  const path = `food-places/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("generated-media").upload(path, body, { contentType: blob ? "image/jpeg" : file.type || undefined, upsert: true });
  if (error) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/generated-media/${path}`;
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 11px", border: "1px solid var(--line-2)",
  borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--ink)",
};

const empty: FoodPlaceInput = { name: "", category: "", phone: "", address: "", mapUrl: "", visitedOn: "", companions: "", price: "", memo: "", photos: [], menuPhotos: [], cuisine: "" };

// 사진 촬영/앨범 업로드 + 썸네일(×제거) — 매장/메뉴 공용.
function PhotoPicker({ label, urls, onChange, onBusy }: { label: string; urls: string[]; onChange: (next: string[]) => void; onBusy: (b: boolean) => void }) {
  const camRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); onBusy(true);
    const added: string[] = [];
    for (const file of Array.from(files).slice(0, 10)) {
      const u = await uploadPhoto(file);
      if (u) added.push(u);
    }
    setBusy(false); onBusy(false);
    if (added.length) onChange([...urls, ...added].slice(0, 20));
  };

  return (
    <div style={{ marginTop: 10 }}>
      <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{label} {urls.length ? `(${urls.length})` : ""}</div>
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
      <input ref={albumRef} type="file" accept="image/*" multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn" onClick={() => camRef.current?.click()} disabled={busy}>📷 사진 찍기</button>
        <button type="button" className="btn" onClick={() => albumRef.current?.click()} disabled={busy}>🖼 앨범에서</button>
        {busy && <span className="muted" style={{ fontSize: 12.5, alignSelf: "center" }}>사진 올리는 중…</span>}
      </div>
      {urls.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {urls.map((u) => (
            <div key={u} style={{ position: "relative" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt={label} style={{ width: 84, height: 84, objectFit: "cover", borderRadius: 10, border: "1px solid var(--line)" }} />
              <button type="button" onClick={() => onChange(urls.filter((x) => x !== u))} title="사진 제거"
                style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 999, border: "1px solid var(--line-2)", background: "var(--surface)", color: "var(--owner)", fontSize: 12, lineHeight: 1, cursor: "pointer" }}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlaceForm({ initial, onDone, onCancel }: { initial?: FoodPlace; onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState<FoodPlaceInput>(
    initial
      ? { name: initial.name, category: initial.category, phone: initial.phone, address: initial.address, mapUrl: initial.mapUrl, visitedOn: initial.visitedOn, companions: initial.companions, price: initial.price, memo: initial.memo, photos: initial.photos ?? [], menuPhotos: initial.menuPhotos ?? [], cuisine: initial.cuisine ?? "" }
      : empty
  );
  const [hits, setHits] = useState<PlaceHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [upBusy, setUpBusy] = useState(false);
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
    set({ name: h.name, category: h.category, phone: h.phone, address: h.address, mapUrl: h.mapUrl, cuisine: f.cuisine || cuisineFromKakao(h.category) });
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
        <label className="field" style={{ margin: 0 }}>
          <span>카테고리</span>
          <select value={f.cuisine} onChange={(e) => set({ cuisine: e.target.value })} style={inputStyle}>
            <option value="">(선택)</option>
            {CUISINES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="field" style={{ margin: 0 }}><span>업종(상세)</span><input value={f.category} onChange={(e) => set({ category: e.target.value })} placeholder="한식 > 갈비" style={inputStyle} /></label>
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

      {/* 매장·메뉴 사진 — 촬영/앨범 업로드 */}
      <PhotoPicker label="🏪 매장 사진" urls={f.photos ?? []} onChange={(next) => set({ photos: next })} onBusy={setUpBusy} />
      <PhotoPicker label="🍜 메뉴 사진" urls={f.menuPhotos ?? []} onChange={(next) => set({ menuPhotos: next })} onBusy={setUpBusy} />

      {err && <div style={{ color: "var(--owner)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button className="btn primary" onClick={submit} disabled={pending || upBusy || !(f.name ?? "").trim()}>{pending ? "저장 중…" : initial ? "수정 저장" : "저장"}</button>
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
    start(async () => { await deleteFoodPlace(p.id, [...(p.photos ?? []), ...(p.menuPhotos ?? [])]); router.refresh(); });
  };

  if (editing) return <PlaceForm initial={p} onDone={() => { setEditing(false); router.refresh(); }} onCancel={() => setEditing(false)} />;

  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ minWidth: 220, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <strong style={{ fontSize: 15 }}>🍽 {p.name}</strong>
            {p.cuisine && <span className="badge accent" style={{ fontSize: 11 }}>{p.cuisine}</span>}
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
          {(p.photos?.length ?? 0) > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {p.photos.map((u) => (
                <a key={u} href={u} target="_blank" rel="noreferrer" title="매장 사진 크게 보기">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt={`${p.name} 매장 사진`} style={{ width: 92, height: 92, objectFit: "cover", borderRadius: 10, border: "1px solid var(--line)" }} />
                </a>
              ))}
            </div>
          )}
          {(p.menuPhotos?.length ?? 0) > 0 && (
            <div style={{ marginTop: 8 }}>
              <div className="muted" style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>🍜 메뉴</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {p.menuPhotos.map((u) => (
                  <a key={u} href={u} target="_blank" rel="noreferrer" title="메뉴 사진 크게 보기">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u} alt={`${p.name} 메뉴 사진`} style={{ width: 92, height: 92, objectFit: "cover", borderRadius: 10, border: "1px solid var(--warn,#f59e0b)" }} />
                  </a>
                ))}
              </div>
            </div>
          )}
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
  const [cuisine, setCuisine] = useState("전체");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter((p) => {
      if (cuisine !== "전체" && (p.cuisine || "기타") !== cuisine) return false;
      if (!s) return true;
      return [p.name, p.cuisine, p.category, p.address, p.companions, p.memo].filter(Boolean).join(" ").toLowerCase().includes(s);
    });
  }, [items, q, cuisine]);

  const cuisineCounts = useMemo(() => {
    const m: Record<string, number> = {};
    items.forEach((p) => { const c = p.cuisine || "기타"; m[c] = (m[c] ?? 0) + 1; });
    return m;
  }, [items]);

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

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {["전체", ...CUISINES].map((c) => {
          const n = c === "전체" ? items.length : cuisineCounts[c] ?? 0;
          if (c !== "전체" && n === 0) return null;
          return (
            <button key={c} className={`btn sm${cuisine === c ? " primary" : ""}`} onClick={() => setCuisine(c)}>
              {c} {n > 0 && <span style={{ opacity: 0.7 }}>({n})</span>}
            </button>
          );
        })}
      </div>
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
