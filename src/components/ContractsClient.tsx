"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { saveContract, deleteContract, contractFileUrl, type ContractFile, type ContractInput } from "@/app/(app)/contracts/actions";
import { contractState } from "@/lib/docs";

export type Contract = ContractInput & { id: string };

const KINDS = ["공급", "유통·입점", "위탁생산(OEM)", "용역·대행", "NDA", "임대", "근로", "투자", "기타"];
const PARTIES = ["운호컴퍼니", "뷰티밤", "기타"];
const STATUSES = ["검토중", "체결", "만료", "해지"];
const blank = (): ContractInput => ({ title: "", counterparty: "", vendorId: "", ourParty: "운호컴퍼니", kind: "공급", status: "체결", signedDate: "", startDate: "", endDate: "", autoRenew: false, noticeDays: 30, amount: null, terms: "", note: "", files: [] });

export default function ContractsClient({ rows, ready, today, vendors }: { rows: Contract[]; ready: boolean; today: string; vendors: { id: string; name: string }[] }) {
  const [editing, setEditing] = useState<Contract | ContractInput | null>(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const list = useMemo(() => rows.filter((r) => (!kind || r.kind === kind) && (!q || `${r.title} ${r.counterparty} ${r.terms}`.includes(q))), [rows, q, kind]);
  const alerts = rows.filter((r) => { const s = contractState({ status: r.status, end_date: r.endDate || null, notice_days: r.noticeDays, auto_renew: r.autoRenew }, today); return s.tone === "owner" || s.tone === "warn"; });

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>계약서 관리</h1>
          <p>계약 상대·기간·금액·핵심 조건과 계약서 파일을 보관합니다. 만료 예정 계약은 맨 위에 표시됩니다. 파일은 비공개 저장소에 보관되고 열 때마다 1분짜리 주소가 발급됩니다.</p>
        </div>
        <button className="btn primary" disabled={!ready} onClick={() => setEditing(blank())}>+ 계약서 등록</button>
      </div>
      {!ready && <div className="card" style={{ borderLeft: "4px solid var(--warn)", marginBottom: 14 }}><p className="muted" style={{ margin: 0, fontSize: 12.5 }}>Supabase에서 <span className="mono">0105_contracts_statements.sql</span>을 실행하세요.</p></div>}

      {alerts.length > 0 && (
        <div className="card" style={{ borderLeft: "4px solid var(--warn)", marginBottom: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>확인 필요 {alerts.length}건 (만료·갱신 임박)</div>
          {alerts.map((r) => { const s = contractState({ status: r.status, end_date: r.endDate || null, notice_days: r.noticeDays, auto_renew: r.autoRenew }, today); return (
            <div key={r.id} style={{ fontSize: 13, padding: "3px 0", cursor: "pointer" }} onClick={() => setEditing(r)}>
              <b style={{ color: s.tone === "owner" ? "var(--owner)" : "var(--warn)" }}>{s.label}</b> · {r.title} · {r.counterparty}
            </div>
          ); })}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        <input placeholder="계약명·상대방·조건 검색" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: "1 1 200px", minWidth: 0 }} />
        <select value={kind} onChange={(e) => setKind(e.target.value)}><option value="">모든 유형</option>{KINDS.map((k) => <option key={k}>{k}</option>)}</select>
      </div>

      {list.length === 0 ? <div className="card"><div className="empty">{rows.length ? "조건에 맞는 계약이 없습니다." : "등록된 계약서가 없습니다. '+ 계약서 등록'으로 시작하세요."}</div></div> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 8 }}>
          {list.map((r) => {
            const s = contractState({ status: r.status, end_date: r.endDate || null, notice_days: r.noticeDays, auto_renew: r.autoRenew }, today);
            return (
              <button key={r.id} type="button" className="card" onClick={() => setEditing(r)} style={{ margin: 0, padding: "11px 13px", textAlign: "left", font: "inherit", color: "inherit", cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <b style={{ fontSize: 14.5 }}>{r.title}</b>
                  <span className={`badge ${s.tone}`} style={{ flexShrink: 0 }}>{s.label}</span>
                </div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{r.counterparty} · {r.kind} · {r.ourParty}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 10px", fontSize: 12.5, marginTop: 6 }}>
                  <div><span className="muted">기간</span> {r.startDate || "-"} ~ {r.endDate || "-"}</div>
                  <div><span className="muted">금액</span> {r.amount ? `${r.amount.toLocaleString("ko-KR")}원` : "-"}</div>
                  <div><span className="muted">파일</span> {r.files.length}개</div>
                  <div><span className="muted">체결일</span> {r.signedDate || "-"}</div>
                </div>
                {r.terms && <div className="muted" style={{ fontSize: 12, marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.terms}</div>}
              </button>
            );
          })}
        </div>
      )}

      {editing && <Editor initial={editing} vendors={vendors} onClose={() => setEditing(null)} />}
    </div>
  );
}

function Editor({ initial, vendors, onClose }: { initial: Contract | ContractInput; vendors: { id: string; name: string }[]; onClose: () => void }) {
  const router = useRouter();
  const id = "id" in initial ? initial.id : null;
  const [f, setF] = useState<ContractInput>({ ...initial });
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const set = <K extends keyof ContractInput>(k: K, v: ContractInput[K]) => setF((x) => ({ ...x, [k]: v }));

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const supabase = createSupabaseBrowserClient();
    const added: ContractFile[] = [];
    for (const file of Array.from(files)) {
      setBusy(`올리는 중… ${file.name}`);
      const dot = file.name.lastIndexOf(".");
      const ext = (dot >= 0 ? file.name.slice(dot + 1) : "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toLowerCase();
      const path = `contracts/${Date.now()}_${Math.random().toString(36).slice(2, 7)}${ext ? "." + ext : ""}`;
      const { error } = await supabase.storage.from("contracts").upload(path, file, { contentType: file.type || undefined });
      if (error) { setMsg(`업로드 실패: ${error.message} (0105 마이그레이션의 저장소 권한을 확인하세요)`); break; }
      added.push({ path, name: file.name.slice(0, 120), size: file.size });
    }
    setBusy("");
    if (added.length) set("files", [...f.files, ...added]);
  };
  const openFile = (p: string) => {
    const w = window.open("", "_blank");
    start(async () => { const r = await contractFileUrl(p); if (r.ok && r.url && w) w.location.href = r.url; else { w?.close(); setMsg(r.message ?? "열 수 없습니다."); } });
  };

  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
      <div className="card" onMouseDown={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 620, maxHeight: "92vh", overflowY: "auto", padding: 18 }}>
        <h3 style={{ marginTop: 0 }}>{id ? "계약서 수정" : "계약서 등록"}</h3>
        <div style={{ display: "grid", gap: 8 }}>
          <input placeholder="계약명 (예: 한라산소주 공급 계약)" value={f.title} onChange={(e) => set("title", e.target.value)} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input placeholder="계약 상대방" value={f.counterparty} onChange={(e) => set("counterparty", e.target.value)} />
            <select value={f.vendorId} onChange={(e) => { set("vendorId", e.target.value); const v = vendors.find((x) => x.id === e.target.value); if (v && !f.counterparty) set("counterparty", v.name); }}>
              <option value="">거래처 연결(선택)</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <select value={f.ourParty} onChange={(e) => set("ourParty", e.target.value)}>{PARTIES.map((p) => <option key={p}>{p}</option>)}</select>
            <select value={f.kind} onChange={(e) => set("kind", e.target.value)}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select>
            <select value={f.status} onChange={(e) => set("status", e.target.value)}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
            <input type="number" placeholder="계약 금액(원)" value={f.amount ?? ""} onChange={(e) => set("amount", e.target.value ? Number(e.target.value) : null)} />
            <label style={{ fontSize: 12 }}>체결일<input type="date" value={f.signedDate} onChange={(e) => set("signedDate", e.target.value)} style={{ width: "100%" }} /></label>
            <span />
            <label style={{ fontSize: 12 }}>시작일<input type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} style={{ width: "100%" }} /></label>
            <label style={{ fontSize: 12 }}>종료일<input type="date" value={f.endDate} onChange={(e) => set("endDate", e.target.value)} style={{ width: "100%" }} /></label>
            <label style={{ fontSize: 12.5, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={f.autoRenew} onChange={(e) => set("autoRenew", e.target.checked)} /> 자동 갱신</label>
            <label style={{ fontSize: 12 }}>만료 알림(일 전)<input type="number" value={f.noticeDays} onChange={(e) => set("noticeDays", Number(e.target.value))} style={{ width: "100%" }} /></label>
          </div>
          <textarea rows={3} placeholder="핵심 조건 요약 (대금 지급·납기·독점 여부·해지 조항·위약금 등)" value={f.terms} onChange={(e) => set("terms", e.target.value)} />
          <textarea rows={2} placeholder="메모" value={f.note} onChange={(e) => set("note", e.target.value)} />
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>계약서 파일 (PDF·사진)</div>
            {f.files.map((x) => (
              <div key={x.path} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, padding: "2px 0" }}>
                <button type="button" className="btn sm" onClick={() => openFile(x.path)}>열기</button>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.name}</span>
                <button type="button" className="btn sm" onClick={() => set("files", f.files.filter((y) => y.path !== x.path))}>빼기</button>
              </div>
            ))}
            <input type="file" multiple accept="application/pdf,image/*,.hwp,.docx" onChange={(e) => upload(e.target.files)} />
            {busy && <div className="muted" style={{ fontSize: 12 }}>{busy}</div>}
          </div>
        </div>
        {msg && <div style={{ color: "var(--owner)", fontSize: 12.5, marginTop: 8 }}>{msg}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button className="btn primary" disabled={pending || !!busy} onClick={() => start(async () => { const r = await saveContract(id, f); if (r.ok) { onClose(); router.refresh(); } else setMsg(r.message); })}>저장</button>
          <button className="btn" onClick={onClose}>닫기</button>
          {id && <button className="btn" style={{ marginLeft: "auto" }} disabled={pending} onClick={() => { if (confirm("이 계약서와 첨부 파일을 삭제할까요?")) start(async () => { const r = await deleteContract(id); if (r.ok) { onClose(); router.refresh(); } else setMsg(r.message); }); }}>삭제</button>}
        </div>
      </div>
    </div>
  );
}
