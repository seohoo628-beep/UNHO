"use client";

import { useState, useTransition } from "react";
import { savePopbillKeys, clearPopbillKeys, saveSupplier, testPopbill, openPopbillPage, type SupplierPatch } from "@/app/(app)/settings/popbill-actions";

export type SupplierView = { name: string; businessNo: string; ceo: string; address: string; bizType: string; bizItem: string; contact: string; email: string };

export default function PopbillSettings({
  configured, fromEnv, isTest, linkIdHint, suppliers, migrated,
}: { configured: boolean; fromEnv: boolean; isTest: boolean; linkIdHint: string; suppliers: SupplierView[]; migrated: boolean }) {
  const [linkId, setLinkId] = useState("");
  const [secret, setSecret] = useState("");
  const [mode, setMode] = useState<"test" | "live">(isTest ? "test" : "live");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const done = (r: { ok: boolean; message: string }) => setMsg({ ok: r.ok, text: r.message });

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 17 }}>팝빌 전자세금계산서</h2>
        <span className={`badge ${configured ? "ok" : "warn"}`}>{configured ? `연결됨 · ${isTest ? "테스트베드" : "운영"}${fromEnv ? " · Vercel 환경변수" : ""}` : "미설정"}</span>
      </div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
        미수금 화면의 &lsquo;계산서 발행&rsquo; 버튼이 이 키로 팝빌에 즉시 발행을 요청합니다(대표만). 테스트베드는 국세청에 전송되지 않습니다.
        운영 발행은 팝빌 파트너센터에서 상용 전환을 마치고, 법인별 공동인증서를 팝빌에 등록한 뒤 &lsquo;운영&rsquo;으로 바꾸세요.
      </p>

      {fromEnv ? (
        <p className="muted" style={{ fontSize: 12.5 }}>Vercel 환경변수(POPBILL_LINK_ID·POPBILL_SECRET_KEY)로 설정돼 있어 여기서 바꿀 수 없습니다.</p>
      ) : (
        <div style={{ display: "grid", gap: 8, maxWidth: 520 }}>
          <input placeholder={configured ? `링크아이디 저장됨 (${linkIdHint}) · 바꿀 때만 입력` : "링크아이디 (LinkID)"} value={linkId} onChange={(e) => setLinkId(e.target.value)} autoComplete="off" />
          <input type="password" placeholder={configured ? "비밀키 저장됨 · 바꿀 때만 입력" : "비밀키 (SecretKey)"} value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="new-password" />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select value={mode} onChange={(e) => setMode(e.target.value as "test" | "live")}>
              <option value="test">테스트베드 (국세청 미전송)</option>
              <option value="live">운영 (국세청 전송)</option>
            </select>
            <button className="btn primary" disabled={pending || (!configured && (!linkId.trim() || !secret.trim()))} onClick={() => start(async () => {
              if (mode === "live" && !confirm("운영 모드에서는 발행 즉시 국세청으로 전송됩니다. 바꿀까요?")) return;
              done(await savePopbillKeys(linkId, secret, mode)); setSecret("");
            })}>저장</button>
            {configured && <button className="btn" disabled={pending} onClick={() => start(async () => done(await testPopbill()))}>{pending ? "확인 중…" : "연결 확인"}</button>}
            {configured && <button className="btn" disabled={pending} onClick={() => { if (confirm("팝빌 키를 지울까요?")) start(async () => done(await clearPopbillKeys())); }}>지우기</button>}
          </div>
        </div>
      )}
      {fromEnv && configured && <button className="btn" style={{ marginTop: 8 }} disabled={pending} onClick={() => start(async () => done(await testPopbill()))}>{pending ? "확인 중…" : "연결 확인"}</button>}
      {msg && <div style={{ fontSize: 12.5, marginTop: 8, color: msg.ok ? "var(--ok)" : "var(--owner)", whiteSpace: "pre-wrap" }}>{msg.text}</div>}

      <div style={{ marginTop: 14, fontWeight: 700, fontSize: 13.5 }}>공급자(자사 법인) 계산서 정보</div>
      {!migrated && <p className="muted" style={{ fontSize: 12.5 }}>업태·종목·담당 이메일 저장은 DB 마이그레이션(0104) 적용 후 가능합니다.</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10, marginTop: 8 }}>
        {suppliers.map((s) => <SupplierForm key={s.name} s={s} disabled={!migrated} onDone={done} canOpen={configured} />)}
      </div>
    </div>
  );
}

function SupplierForm({ s, disabled, onDone, canOpen }: { s: SupplierView; disabled: boolean; onDone: (r: { ok: boolean; message: string }) => void; canOpen: boolean }) {
  const [f, setF] = useState<SupplierPatch>({ name: s.name, bizType: s.bizType, bizItem: s.bizItem, contact: s.contact, email: s.email, address: s.address });
  const [pending, start] = useTransition();
  const set = (k: keyof SupplierPatch) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const missing = [!f.bizType && "업태", !f.bizItem && "종목", !f.email && "담당 이메일"].filter(Boolean);
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 10, display: "grid", gap: 6 }}>
      <div style={{ fontWeight: 700 }}>{s.name} <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>{s.businessNo} · {s.ceo}</span></div>
      <input placeholder="사업장 주소(사업자등록증 기준)" value={f.address} onChange={set("address")} disabled={disabled} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <input placeholder="업태" value={f.bizType} onChange={set("bizType")} disabled={disabled} />
        <input placeholder="종목" value={f.bizItem} onChange={set("bizItem")} disabled={disabled} />
        <input placeholder="담당자" value={f.contact} onChange={set("contact")} disabled={disabled} />
        <input placeholder="담당 이메일" value={f.email} onChange={set("email")} disabled={disabled} />
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn sm" disabled={disabled || pending} onClick={() => start(async () => onDone(await saveSupplier(f)))}>저장</button>
        {canOpen && (["cert", "charge"] as const).map((k) => (
          <button key={k} className="btn sm" disabled={pending} onClick={() => {
            // 팝업 차단을 피하려고 클릭 즉시 빈 창을 열고, 받은 주소로 이동한다(주소는 30초만 유효).
            const w = window.open("", "_blank");
            start(async () => {
              const r = await openPopbillPage(s.name, k);
              if (r.ok && r.url && w) w.location.href = r.url;
              else { w?.close(); onDone({ ok: false, message: r.message ?? "팝빌 화면을 열지 못했습니다." }); }
            });
          }}>{k === "cert" ? "인증서 등록" : "포인트 충전"}</button>
        ))}
        {missing.length > 0 && <span style={{ fontSize: 12, color: "var(--warn)" }}>발행 전 필요: {missing.join(", ")}</span>}
      </div>
    </div>
  );
}
