"use client";

import { useMemo, useState } from "react";

type SmsContact = { name: string; category?: string; contact?: string; contact2?: string };

// 전화번호에서 숫자만(맨 앞 + 유지). 유효하지 않으면 빈 문자열.
function normPhone(raw?: string): string {
  if (!raw) return "";
  const s = String(raw).trim();
  const plus = s.startsWith("+");
  const digits = s.replace(/[^\d]/g, "");
  if (digits.length < 9) return "";
  return plus ? "+" + digits : digits;
}

// 인적자산 직업군(category)별 전체 문자 발송. 휴대폰 문자앱을 여러 수신자로 연다.
export default function BulkSmsButton({ items }: { items: SmsContact[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)} title="직업군을 골라 그 그룹 전체에게 문자 보내기">📩 직업군 문자</button>
      {open && <BulkSmsModal items={items} onClose={() => setOpen(false)} />}
    </>
  );
}

function BulkSmsModal({ items, onClose }: { items: SmsContact[]; onClose: () => void }) {
  const cats = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of items) if (normPhone(c.contact) || normPhone(c.contact2)) {
      const k = c.category || "기타";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);

  const [cat, setCat] = useState<string>(cats[0]?.[0] ?? "");
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  // 선택 직업군 + 유효 번호가 있는 수신자.
  const recipients = useMemo(() => {
    return items
      .filter((c) => (c.category || "기타") === cat)
      .map((c) => ({ name: c.name, phone: normPhone(c.contact) || normPhone(c.contact2) }))
      .filter((r) => r.phone);
  }, [items, cat]);

  const numbers = recipients.map((r) => r.phone);

  const sendSms = () => {
    if (!numbers.length) { setMsg("이 직업군에 문자 보낼 번호가 없습니다."); return; }
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const sep = isIOS ? "&" : "?";
    const uri = `sms:${numbers.join(",")}${body ? `${sep}body=${encodeURIComponent(body)}` : ""}`;
    try { window.location.href = uri; }
    catch { setMsg("문자앱을 열 수 없습니다. 아래 ‘번호 복사’ 후 문자앱에 붙여넣어 주세요."); }
  };

  const copy = async (text: string, okMsg: string) => {
    try { await navigator.clipboard.writeText(text); setMsg(okMsg); }
    catch { setMsg("복사에 실패했습니다. 길게 눌러 직접 복사해 주세요."); }
  };

  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, background: "rgba(16,20,24,0.5)", display: "grid", placeItems: "center", zIndex: 160, padding: 16 }}>
      <div className="card" onMouseDown={(e) => e.stopPropagation()} style={{ padding: 18, width: "100%", maxWidth: 480, maxHeight: "90vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>📩 직업군별 전체 문자</h3>
          <button className="btn sm" onClick={onClose}>닫기 ✕</button>
        </div>

        <label style={{ display: "block", fontSize: 12, color: "var(--ink-2)", fontWeight: 700, marginBottom: 4 }}>직업군</label>
        <select value={cat} onChange={(e) => { setCat(e.target.value); setMsg(null); }} style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--line-2)", borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--ink)", marginBottom: 6 }}>
          {cats.length === 0 && <option value="">번호가 있는 인맥이 없습니다</option>}
          {cats.map(([k, n]) => <option key={k} value={k}>{k} · {n}명</option>)}
        </select>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>수신 대상 <b>{recipients.length}명</b>{recipients.length > 0 && <> · {recipients.slice(0, 6).map((r) => r.name).join(", ")}{recipients.length > 6 ? " 외" : ""}</>}</div>

        <label style={{ display: "block", fontSize: 12, color: "var(--ink-2)", fontWeight: 700, marginBottom: 4 }}>메시지</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="보낼 문자 내용을 입력하세요" style={{ width: "100%", padding: 10, border: "1px solid var(--line-2)", borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--ink)", resize: "vertical", marginBottom: 10, fontFamily: "inherit", fontSize: 14 }} />

        {msg && <div style={{ fontSize: 12.5, color: "var(--accent)", marginBottom: 8 }}>{msg}</div>}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn primary" onClick={sendSms} disabled={!recipients.length} style={{ flex: "1 1 160px" }}>📱 문자앱으로 보내기 ({recipients.length})</button>
          <button className="btn" onClick={() => copy(numbers.join(", "), "✅ 번호를 모두 복사했어요.")} disabled={!numbers.length}>번호 복사</button>
          <button className="btn" onClick={() => copy(body, "✅ 메시지를 복사했어요.")} disabled={!body.trim()}>메시지 복사</button>
        </div>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 10, lineHeight: 1.6 }}>
          ※ 「문자앱으로 보내기」를 누르면 휴대폰 문자앱이 열리며 수신자·내용이 채워집니다. 기종에 따라 한 번에 넣을 수 있는 수신자 수가 제한될 수 있어요. 그럴 땐 「번호 복사」로 번호를 복사해 문자앱(단체문자)에 붙여넣어 발송하세요.
        </div>
      </div>
    </div>
  );
}
