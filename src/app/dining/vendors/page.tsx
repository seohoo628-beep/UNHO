"use client";

import { useEffect, useState } from "react";
import { useData, inScope } from "@dining/lib/store";
import { Card, Badge, Chips } from "@dining/components/ui";
import { STORES, storeName } from "@dining/lib/stores";
import { uid } from "@dining/lib/format";
import type { StoreId } from "@dining/lib/types";

const CATS = ["식자재", "주류", "인테리어", "보수", "발렛", "기타"] as const;
type VCat = (typeof CATS)[number];
const CAT_TONE: Record<VCat, string> = { 식자재: "green", 주류: "brand", 인테리어: "blue", 보수: "amber", 발렛: "gray", 기타: "gray" };

interface Vendor {
  id: string;
  storeId: StoreId;
  cat: VCat;
  name: string; // 거래처명
  contact: string; // 담당자
  phone: string; // 연락처
  items: string; // 취급 품목
  terms: string; // 결제조건
  note: string; // 비고
}

const KEY = "unho-dining-vendors-v1";

const SEED: Vendor[] = [
  { id: "v1", storeId: "smjp", cat: "식자재", name: "익선정육", contact: "김대리", phone: "010-7100-0001", items: "앞다리살·수육용", terms: "월말 정산", note: "새벽 배송" },
  { id: "v2", storeId: "smjp", cat: "주류", name: "종로주류", contact: "박과장", phone: "010-7100-0002", items: "소주·맥주", terms: "주 1회 정산", note: "" },
  { id: "v3", storeId: "smjp", cat: "보수", name: "익선설비", contact: "이기사", phone: "010-7100-0003", items: "주방 설비·수리", terms: "건별", note: "노포 배관 상시" },
  { id: "v4", storeId: "dwmc", cat: "식자재", name: "대운목장(직영)", contact: "강대표", phone: "010-7100-0004", items: "한우 부위 전체", terms: "직영·월말", note: "" },
  { id: "v5", storeId: "dwmc", cat: "인테리어", name: "그린우드공사", contact: "정소장", phone: "010-7100-0005", items: "홀·룸 시공", terms: "계약별", note: "" },
  { id: "v6", storeId: "dwmc", cat: "발렛", name: "대운발렛", contact: "서실장", phone: "010-7100-0006", items: "발렛 4인", terms: "월 계약", note: "12~22시" },
];

const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 11px", border: "1px solid var(--border-strong)", borderRadius: 8, background: "var(--surface)", color: "var(--text)" };

export default function VendorsPage() {
  const { scope, ready } = useData();
  const [items, setItems] = useState<Vendor[]>(SEED);
  const [hydrated, setHydrated] = useState(false);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<"전체" | VCat>("전체");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Vendor | null>(null);

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

  if (!ready) return null;

  const scoped = inScope(items, scope);
  const list = scoped.filter((v) => {
    if (cat !== "전체" && v.cat !== cat) return false;
    if (q && !(v.name + v.contact + v.items + v.note).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const save = (v: Vendor) =>
    setItems((prev) => {
      const i = prev.findIndex((x) => x.id === v.id);
      if (i >= 0) { const cp = [...prev]; cp[i] = v; return cp; }
      return [v, ...prev];
    });
  const remove = (id: string) => setItems((prev) => prev.filter((v) => v.id !== id));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>거래처관리</h1>
          <p>식자재·주류·인테리어·보수·발렛 등 거래처 — {storeName(scope)}</p>
        </div>
        <button className="btn primary" onClick={() => { setEdit(null); setOpen(true); }}>+ 거래처 추가</button>
      </div>

      <div className="row wrap" style={{ gap: 10, marginBottom: 16 }}>
        <input style={{ ...inputStyle, maxWidth: 240 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="거래처·담당자·품목 검색…" />
        <Chips value={cat} onChange={setCat} options={[{ value: "전체", label: "전체" }, ...CATS.map((c) => ({ value: c, label: c }))]} />
      </div>

      <Card pad={false}>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>분류</th>
                <th>거래처</th>
                {scope === "all" && <th>매장</th>}
                <th>담당자</th>
                <th>연락처</th>
                <th>취급 품목</th>
                <th>결제조건</th>
                <th>비고</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr><td colSpan={9} className="muted" style={{ textAlign: "center", padding: 26 }}>거래처가 없습니다. ‘+ 거래처 추가’로 등록하세요.</td></tr>
              )}
              {list.map((v) => (
                <tr key={v.id}>
                  <td><Badge tone={CAT_TONE[v.cat] as any}>{v.cat}</Badge></td>
                  <td style={{ fontWeight: 600 }}>{v.name}</td>
                  {scope === "all" && <td className="muted">{storeName(v.storeId)}</td>}
                  <td>{v.contact || "-"}</td>
                  <td>{v.phone || "-"}</td>
                  <td className="muted">{v.items || "-"}</td>
                  <td className="muted">{v.terms || "-"}</td>
                  <td className="muted" style={{ maxWidth: 200 }}>{v.note || "-"}</td>
                  <td>
                    <div className="row" style={{ gap: 4 }}>
                      <button className="btn ghost sm" onClick={() => { setEdit(v); setOpen(true); }}>수정</button>
                      <button className="btn danger sm" onClick={() => remove(v.id)}>삭제</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {open && (
        <VendorModal
          initial={edit}
          defaultStore={scope === "all" ? "smjp" : scope}
          onClose={() => setOpen(false)}
          onSave={(v) => { save(v); setOpen(false); }}
        />
      )}
    </>
  );
}

function VendorModal({ initial, defaultStore, onClose, onSave }: { initial: Vendor | null; defaultStore: StoreId; onClose: () => void; onSave: (v: Vendor) => void }) {
  const [f, setF] = useState<Vendor>(
    initial ?? { id: uid("v"), storeId: defaultStore, cat: "식자재", name: "", contact: "", phone: "", items: "", terms: "", note: "" }
  );
  const set = (k: keyof Vendor, val: any) => setF((p) => ({ ...p, [k]: val }));
  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, background: "rgba(16,24,40,0.5)", display: "grid", placeItems: "center", zIndex: 100, padding: 20 }}>
      <div className="card card-pad" onMouseDown={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 500 }}>
        <h3 style={{ marginTop: 0 }}>{initial ? "거래처 수정" : "거래처 추가"}</h3>
        <div className="form-grid">
          <div>
            <div className="form-label">분류</div>
            <select className="field" value={f.cat} onChange={(e) => set("cat", e.target.value)}>
              {CATS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <div className="form-label">매장</div>
            <select className="field" value={f.storeId} onChange={(e) => set("storeId", e.target.value)}>
              {STORES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <div className="form-label">거래처명</div>
            <input className="field" value={f.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <div className="form-label">담당자</div>
            <input className="field" value={f.contact} onChange={(e) => set("contact", e.target.value)} />
          </div>
          <div>
            <div className="form-label">연락처</div>
            <input className="field" value={f.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div>
            <div className="form-label">결제조건</div>
            <input className="field" value={f.terms} onChange={(e) => set("terms", e.target.value)} placeholder="예: 월말 정산" />
          </div>
          <div className="full">
            <div className="form-label">취급 품목</div>
            <input className="field" value={f.items} onChange={(e) => set("items", e.target.value)} />
          </div>
          <div className="full">
            <div className="form-label">비고</div>
            <input className="field" value={f.note} onChange={(e) => set("note", e.target.value)} />
          </div>
        </div>
        <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn primary" disabled={!f.name.trim()} onClick={() => onSave(f)}>저장</button>
        </div>
      </div>
    </div>
  );
}
