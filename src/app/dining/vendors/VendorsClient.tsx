"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useData } from "@dining/lib/store";
import { Card, Badge, Chips } from "@dining/components/ui";
import { STORES, storeName } from "@dining/lib/stores";
import { createVendor, updateVendor, deleteVendor, type VendorInput } from "@/lib/storeShared";
import type { VendorRow } from "@/lib/storeSharedRead";

const PLATFORM = "dining" as const;
const CATS = ["식자재", "주류", "인테리어", "보수", "발렛", "기타"] as const;
type VCat = (typeof CATS)[number];
const CAT_TONE: Record<string, string> = { 식자재: "green", 주류: "brand", 인테리어: "blue", 보수: "amber", 발렛: "gray", 기타: "gray" };

const SETUP_SQL = `create table if not exists public.store_vendors (
  id uuid primary key default gen_random_uuid(),
  platform text not null, store text not null,
  cat text not null default '식자재', name text not null,
  contact text, phone text, items text, terms text, note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.store_vendors enable row level security;
create table if not exists public.store_order_links (
  id uuid primary key default gen_random_uuid(),
  platform text not null, store text not null,
  cat text not null default '기타', name text not null, url text not null, note text,
  created_at timestamptz not null default now()
);
alter table public.store_order_links enable row level security;`;

const field: React.CSSProperties = { width: "100%", padding: "9px 11px", border: "1px solid var(--border-strong)", borderRadius: 8, background: "var(--surface)", color: "var(--text)" };

export default function VendorsClient({ rows, dbReady }: { rows: VendorRow[]; dbReady: boolean }) {
  const { scope, ready } = useData();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<"전체" | VCat>("전체");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<VendorRow | null>(null);
  const [err, setErr] = useState("");
  if (!ready) return null;

  const run = (p: Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await p;
      if (!r.ok) setErr(r.error ?? "오류가 발생했습니다.");
      else { setErr(""); router.refresh(); }
    });

  const scoped = rows.filter((v) => scope === "all" || v.store === scope);
  const list = scoped.filter((v) => {
    if (cat !== "전체" && v.cat !== cat) return false;
    if (q && !(v.name + v.contact + v.items + v.note).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  if (!dbReady) {
    return (
      <>
        <div className="page-head"><div><h1>거래처관리</h1><p>식자재·주류·인테리어·보수·발렛 등 거래처</p></div></div>
        <SetupNotice />
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>거래처관리</h1>
          <p>식자재·주류·인테리어·보수·발렛 등 거래처 — {storeName(scope)} · <span style={{ color: "var(--green)" }}>DB 공유</span>{pending ? " · 저장 중…" : ""}</p>
        </div>
        <button className="btn primary" onClick={() => { setEdit(null); setOpen(true); }}>+ 거래처 추가</button>
      </div>

      {err && <div className="card card-pad" style={{ marginBottom: 12, color: "var(--red)" }}>{err}</div>}

      <div className="row wrap" style={{ gap: 10, marginBottom: 16 }}>
        <input style={{ ...field, maxWidth: 240 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="거래처·담당자·품목 검색…" />
        <Chips value={cat} onChange={setCat} options={[{ value: "전체", label: "전체" }, ...CATS.map((c) => ({ value: c, label: c }))]} />
      </div>

      <Card pad={false}>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>분류</th><th>거래처</th>{scope === "all" && <th>매장</th>}<th>담당자</th><th>연락처</th><th>취급 품목</th><th>결제조건</th><th>비고</th><th></th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr><td colSpan={9} className="muted" style={{ textAlign: "center", padding: 26 }}>거래처가 없습니다. ‘+ 거래처 추가’로 등록하세요.</td></tr>
              )}
              {list.map((v) => (
                <tr key={v.id}>
                  <td><Badge tone={(CAT_TONE[v.cat] ?? "gray") as any}>{v.cat}</Badge></td>
                  <td style={{ fontWeight: 600 }}>{v.name}</td>
                  {scope === "all" && <td className="muted">{storeName(v.store)}</td>}
                  <td>{v.contact || "-"}</td>
                  <td>{v.phone || "-"}</td>
                  <td className="muted">{v.items || "-"}</td>
                  <td className="muted">{v.terms || "-"}</td>
                  <td className="muted" style={{ maxWidth: 200 }}>{v.note || "-"}</td>
                  <td>
                    <div className="row" style={{ gap: 4 }}>
                      <button className="btn ghost sm" onClick={() => { setEdit(v); setOpen(true); }}>수정</button>
                      <button className="btn danger sm" disabled={pending} onClick={() => { if (confirm("삭제할까요?")) run(deleteVendor(v.id, PLATFORM)); }}>삭제</button>
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
          defaultStore={scope === "all" ? STORES[0].id : scope}
          pending={pending}
          onClose={() => setOpen(false)}
          onSave={(id, inp) => { run(id ? updateVendor(id, inp) : createVendor(inp)); setOpen(false); }}
        />
      )}
    </>
  );
}

function SetupNotice() {
  const [copied, setCopied] = useState(false);
  return (
    <Card pad>
      <h3 style={{ marginTop: 0 }}>🛠 거래처·주문처 공유 — DB 설정 필요</h3>
      <p style={{ color: "var(--text-2)", fontSize: 13.5, lineHeight: 1.6 }}>
        여러 직원·기기가 거래처/주문처를 공유하려면 Supabase에 테이블을 한 번 생성해야 합니다.
        <br /><b>Supabase 대시보드 → SQL Editor</b>에 아래 SQL을 붙여넣고 실행하세요. (한 번만, 두 플랫폼 공용)
      </p>
      <div style={{ position: "relative" }}>
        <button className="btn sm" style={{ position: "absolute", top: 8, right: 8 }} onClick={() => { navigator.clipboard?.writeText(SETUP_SQL); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "복사됨 ✓" : "복사"}</button>
        <pre style={{ background: "#0e1116", color: "#e7e9ec", padding: 16, borderRadius: 10, overflowX: "auto", fontSize: 12.5, lineHeight: 1.5 }}>{SETUP_SQL}</pre>
      </div>
      <p className="muted" style={{ fontSize: 12.5 }}>실행 후 새로고침하면 공유 저장이 켜집니다. (저장소: <code>supabase/migrations/0021_store_shared.sql</code>)</p>
    </Card>
  );
}

function VendorModal({ initial, defaultStore, pending, onClose, onSave }: { initial: VendorRow | null; defaultStore: string; pending: boolean; onClose: () => void; onSave: (id: string | null, inp: VendorInput) => void }) {
  const [f, setF] = useState<VendorInput & { id?: string }>(
    initial
      ? { id: initial.id, platform: PLATFORM, store: initial.store, cat: initial.cat, name: initial.name, contact: initial.contact, phone: initial.phone, items: initial.items, terms: initial.terms, note: initial.note }
      : { platform: PLATFORM, store: defaultStore, cat: "식자재", name: "", contact: "", phone: "", items: "", terms: "", note: "" }
  );
  const set = (k: string, val: any) => setF((p) => ({ ...p, [k]: val }));
  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, background: "rgba(16,24,40,0.5)", display: "grid", placeItems: "center", zIndex: 100, padding: 20 }}>
      <div className="card card-pad" onMouseDown={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 500 }}>
        <h3 style={{ marginTop: 0 }}>{initial ? "거래처 수정" : "거래처 추가"}</h3>
        <div className="form-grid">
          <div><div className="form-label">분류</div><select className="field" value={f.cat} onChange={(e) => set("cat", e.target.value)}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div><div className="form-label">매장</div><select className="field" value={f.store} onChange={(e) => set("store", e.target.value)}>{STORES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div><div className="form-label">거래처명</div><input className="field" value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
          <div><div className="form-label">담당자</div><input className="field" value={f.contact} onChange={(e) => set("contact", e.target.value)} /></div>
          <div><div className="form-label">연락처</div><input className="field" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></div>
          <div><div className="form-label">결제조건</div><input className="field" value={f.terms} onChange={(e) => set("terms", e.target.value)} placeholder="예: 월말 정산" /></div>
          <div className="full"><div className="form-label">취급 품목</div><input className="field" value={f.items} onChange={(e) => set("items", e.target.value)} /></div>
          <div className="full"><div className="form-label">비고</div><input className="field" value={f.note} onChange={(e) => set("note", e.target.value)} /></div>
        </div>
        <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn primary" disabled={!f.name.trim() || pending} onClick={() => { const { id, ...inp } = f; onSave(id ?? null, inp); }}>저장</button>
        </div>
      </div>
    </div>
  );
}
