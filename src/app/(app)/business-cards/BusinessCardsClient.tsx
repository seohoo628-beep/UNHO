"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { createCard, updateCard, deleteCard, ocrCard, saveCardToContacts } from "./actions";

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
  registeredDate: string;
  location: string;
  note: string;
};

// 한국시간 기준 오늘(YYYY-MM-DD)
function todayKST(): string {
  try { return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }); }
  catch { return new Date().toISOString().slice(0, 10); }
}

const empty = (): Card => ({
  id: "", name: "", company: "", department: "", position: "", mobile: "",
  officePhone: "", email: "", fax: "", address: "", website: "", tags: "",
  imageUrl: "", metDate: "", registeredDate: todayKST(), location: "", note: "",
});

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "1px solid var(--line-2)",
  borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--ink)", fontSize: 13,
};

// ── 명함 이미지 자동 최적화(리멤버 방식): EXIF 보정 → 축소 → 명함 경계 크롭 → JPEG 압축 ──
type Box = { x0: number; y0: number; x1: number; y1: number };

async function loadBitmap(file: File): Promise<ImageBitmap | null> {
  try { return await createImageBitmap(file, { imageOrientation: "from-image" } as any); }
  catch { try { return await createImageBitmap(file); } catch { return null; } }
}
function drawScaled(bmp: ImageBitmap, maxDim: number): HTMLCanvasElement {
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  return c;
}
function drawCrop(bmp: ImageBitmap, box: Box, maxDim: number): HTMLCanvasElement {
  const pad = 0.02; // 2% 여백
  const x0 = Math.max(0, box.x0 - pad), y0 = Math.max(0, box.y0 - pad);
  const x1 = Math.min(1, box.x1 + pad), y1 = Math.min(1, box.y1 + pad);
  const sx = Math.round(x0 * bmp.width), sy = Math.round(y0 * bmp.height);
  const sw = Math.max(1, Math.round((x1 - x0) * bmp.width)), sh = Math.max(1, Math.round((y1 - y0) * bmp.height));
  const scale = Math.min(1, maxDim / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  c.getContext("2d")!.drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h);
  return c;
}
const canvasToDataURL = (c: HTMLCanvasElement, q: number) => c.toDataURL("image/jpeg", q);
const canvasToBlob = (c: HTMLCanvasElement, q: number) => new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", q));
// 경계상자가 실제로 배경을 잘라낼 만큼 의미 있는지(한 축이라도 10% 이상 잘리면 크롭).
const meaningfulCrop = (b: Box) => (b.x1 - b.x0) < 0.9 || (b.y1 - b.y0) < 0.9;

// ── 휴대폰 연락처로 저장(vCard) ──
// .vcf 파일을 만들어 내려받으면, 휴대폰에서 파일을 열 때 연락처 앱이 이름·연락처·회사·메모 등을
// 자동으로 채운 "새 연락처" 화면을 띄운다(iOS·안드로이드 공통).
const vcEsc = (s: string) => (s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
function buildVCard(c: Card): string {
  const lines: string[] = ["BEGIN:VCARD", "VERSION:3.0"];
  const name = (c.name || c.company || "연락처").trim();
  lines.push(`N:${vcEsc(name)};;;;`);
  lines.push(`FN:${vcEsc(name)}`);
  if (c.company || c.department) lines.push(`ORG:${vcEsc(c.company)}${c.department ? ";" + vcEsc(c.department) : ""}`);
  if (c.position) lines.push(`TITLE:${vcEsc(c.position)}`);
  if (c.mobile) lines.push(`TEL;TYPE=CELL:${vcEsc(c.mobile)}`);
  if (c.officePhone) lines.push(`TEL;TYPE=WORK,VOICE:${vcEsc(c.officePhone)}`);
  if (c.fax) lines.push(`TEL;TYPE=FAX:${vcEsc(c.fax)}`);
  if (c.email) lines.push(`EMAIL;TYPE=WORK:${vcEsc(c.email)}`);
  if (c.address) lines.push(`ADR;TYPE=WORK:;;${vcEsc(c.address)};;;;`);
  if (c.website) lines.push(`URL:${vcEsc(c.website)}`);
  // 메모: 만난 날짜·장소·태그도 함께 담아둔다(연락처 앱에서 맥락 확인용).
  const noteParts = [c.note, c.metDate ? `만난날짜: ${c.metDate}` : "", c.location ? `장소: ${c.location}` : "", c.tags ? `태그: ${c.tags}` : ""].filter(Boolean);
  if (noteParts.length) lines.push(`NOTE:${vcEsc(noteParts.join("\n"))}`);
  lines.push("END:VCARD");
  return lines.join("\r\n");
}
type SaveResult = "shared" | "downloaded" | "cancelled" | "failed";
async function saveToPhone(c: Card): Promise<SaveResult> {
  const fname = `${(c.name || c.company || "contact").replace(/[^\w가-힣]+/g, "_").slice(0, 40)}.vcf`;
  const text = buildVCard(c);

  // 1) Web Share(파일) — 아이폰 사파리 등에서 시트→"연락처에 추가"로 바로 저장.
  try {
    const nav = navigator as any;
    if (nav.canShare && nav.share && typeof File !== "undefined") {
      const types = ["text/vcard", "text/x-vcard", "text/directory", ""];
      let file: File | null = null;
      for (const t of types) {
        const f = new File([text], fname, t ? { type: t } : undefined);
        if (nav.canShare({ files: [f] })) { file = f; break; }
      }
      if (file) {
        await nav.share({ files: [file], title: c.name || "연락처" });
        return "shared";
      }
    }
  } catch (e: any) {
    if (e && e.name === "AbortError") return "cancelled";
  }

  // 2) 그 외/실패 → 파일 다운로드(내려받은 .vcf를 열면 연락처로 가져오기).
  //    안드로이드는 브라우저 보안상 연락처 앱을 직접 못 열어 이 경로로 저장한다.
  try {
    const blob = new Blob([text], { type: "text/vcard;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return "downloaded";
  } catch {
    return "failed";
  }
}

function toFormData(c: Card): FormData {
  const fd = new FormData();
  fd.set("name", c.name); fd.set("company", c.company); fd.set("department", c.department);
  fd.set("position", c.position); fd.set("mobile", c.mobile); fd.set("office_phone", c.officePhone);
  fd.set("email", c.email); fd.set("fax", c.fax); fd.set("address", c.address);
  fd.set("website", c.website); fd.set("tags", c.tags); fd.set("image_url", c.imageUrl);
  fd.set("met_date", c.metDate); fd.set("registered_date", c.registeredDate); fd.set("location", c.location);
  fd.set("note", c.note);
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
  const [locBusy, setLocBusy] = useState(false);
  const [locMsg, setLocMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof Card, v: string) => setF((p) => ({ ...p, [k]: v }));

  // 현재 위치 자동 입력(GPS → 한국어 주소). 새 명함이고 위치가 비었으면 폼 열릴 때 자동 시도.
  const fetchLocation = (silent = false) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) { if (!silent) setLocMsg("이 기기에서 위치를 지원하지 않습니다."); return; }
    setLocBusy(true); if (!silent) setLocMsg("현재 위치 확인 중…");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        let name = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=ko&zoom=18`, { headers: { Accept: "application/json" } });
          if (res.ok) {
            const data = await res.json();
            const a = data.address || {};
            const parts = [a.province || a.state, a.city || a.town || a.county, a.borough || a.city_district, a.suburb || a.neighbourhood, a.road, a.house_number].filter(Boolean);
            const uniq = Array.from(new Set(parts));
            if (uniq.length) name = uniq.join(" ");
            else if (data.display_name) name = data.display_name;
          }
        } catch { /* 역지오코딩 실패 시 좌표만 */ }
        setF((p) => ({ ...p, location: name }));
        setLocBusy(false); setLocMsg("✅ 위치 입력됨");
      },
      () => { setLocBusy(false); if (!silent) setLocMsg("위치 권한이 거부되었거나 확인에 실패했습니다."); },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  };

  // 새 명함 폼이 열리면 위치 자동 시도(권한 없으면 조용히 무시).
  useEffect(() => {
    if (!initial.id && !initial.location) fetchLocation(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyOcr = (p: Card, d: NonNullable<Awaited<ReturnType<typeof ocrCard>>["data"]>): Card => ({
    ...p,
    name: d.name || p.name, company: d.company || p.company, department: d.department || p.department,
    position: d.position || p.position, mobile: d.mobile || p.mobile, officePhone: d.office_phone || p.officePhone,
    email: d.email || p.email, fax: d.fax || p.fax, address: d.address || p.address, website: d.website || p.website,
  });

  // 촬영/선택 → EXIF 보정 → AI 인식(필드 + 명함 경계) → 배경 크롭 + 압축 → 1회 업로드
  const uploadImage = async (file: File) => {
    setErr(null); setOcrMsg(null);
    if (!file.type.startsWith("image")) { setErr("이미지 파일만 올릴 수 있습니다."); return; }
    const supabase = createSupabaseBrowserClient();
    const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/generated-media/`;
    const bmp = await loadBitmap(file);

    // 1) AI 인식 + 명함 경계 추출(축소본 base64)
    let data: NonNullable<Awaited<ReturnType<typeof ocrCard>>["data"]> | null = null;
    let box: Box | null = null;
    if (bmp) {
      setOcrBusy(true); setOcrMsg("AI가 명함을 읽고 배경을 정리하는 중…");
      try {
        const ocrUrl = canvasToDataURL(drawScaled(bmp, 1400), 0.72);
        const r = await ocrCard(ocrUrl);
        if (r.ok && r.data) { data = r.data; box = r.box ?? null; }
        else if (!r.ok) setErr(r.error ?? "AI 인식 실패");
      } catch { /* 인식 실패해도 업로드는 진행 */ }
      setOcrBusy(false);
    }

    // 2) 최종 이미지 생성: 명함 경계로 크롭(배경 제거) + 축소 + JPEG 압축
    setUpBusy(box && meaningfulCrop(box) ? "배경 정리·저장 중…" : "이미지 저장 중…");
    let blob: Blob | null = null;
    if (bmp) {
      const canvas = box && meaningfulCrop(box) ? drawCrop(bmp, box, 1600) : drawScaled(bmp, 1600);
      blob = await canvasToBlob(canvas, 0.85);
    }
    const body: Blob | File = blob ?? file;
    const ext = blob ? "jpg" : ((file.name.split(".").pop() || "jpg").replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(0, 8) || "jpg");
    const contentType = blob ? "image/jpeg" : (file.type || undefined);
    const rand = Math.random().toString(36).slice(2, 8);
    const path = `business-cards/${Date.now()}_${rand}.${ext}`;
    const { error } = await supabase.storage.from("generated-media").upload(path, body, { contentType, upsert: true });
    setUpBusy("");
    if (error) {
      const m = error.message || "";
      if (/exceeded|maximum allowed size|payload too large|413|too large/i.test(m)) setErr("이미지 용량이 저장소 허용치를 초과했습니다.");
      else if (/row-level|policy|unauthor|403|not allowed|violat/i.test(m)) setErr("업로드 권한이 없습니다. 저장소 권한 SQL을 실행해 주세요.");
      else setErr("업로드 실패: " + m);
      return;
    }
    const url = base + path;

    // 3) 이미지 + 인식 필드 반영
    setF((p) => (data ? { ...applyOcr(p, data), imageUrl: url } : { ...p, imageUrl: url }));
    if (data) setOcrMsg(box && meaningfulCrop(box) ? "✅ 자동 입력 + 배경 정리(크롭) 완료 — 확인 후 저장하세요." : "✅ 자동 입력 완료 — 확인 후 저장하세요.");
    else if (!bmp) setOcrMsg("이미지를 저장했습니다. 필드는 직접 입력해 주세요.");
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
          <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => { if (e.target.files?.[0]) uploadImage(e.target.files[0]); e.target.value = ""; }} />
          {f.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={f.imageUrl} alt="명함" style={{ width: "100%", borderRadius: 8, border: "1px solid var(--line-2)", display: "block" }} />
          ) : (
            <div onClick={() => camRef.current?.click()} style={{ width: "100%", aspectRatio: "9/5", border: "2px dashed var(--line-2)", borderRadius: 8, display: "grid", placeItems: "center", cursor: "pointer", background: "var(--surface)", textAlign: "center", padding: 12 }}>
              <div>
                <div style={{ fontSize: 30 }}>📷</div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>명함 촬영 / 사진 선택<br />(찍으면 AI가 자동 인식)</div>
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn sm primary" onClick={() => camRef.current?.click()} disabled={!!upBusy}>📷 사진 찍기</button>
            <button type="button" className="btn sm" onClick={() => fileRef.current?.click()} disabled={!!upBusy}>🖼 앨범에서</button>
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
          <Field label="등록일"><input type="date" style={inputStyle} value={f.registeredDate} onChange={(e) => set("registeredDate", e.target.value)} /></Field>
          <Field label="위치(획득 장소)">
            <div style={{ display: "flex", gap: 6 }}>
              <input style={inputStyle} value={f.location} onChange={(e) => set("location", e.target.value)} placeholder="현재 위치 자동" />
              <button type="button" className="btn sm" onClick={() => fetchLocation(false)} disabled={locBusy} title="현재 위치 가져오기" style={{ whiteSpace: "nowrap" }}>📍</button>
            </div>
          </Field>
          <div style={{ gridColumn: "1 / -1" }}><Field label="태그 (콤마 구분)"><input style={inputStyle} value={f.tags} onChange={(e) => set("tags", e.target.value)} placeholder="예) 거래처, 유통, VIP" /></Field></div>
          {(locBusy || locMsg) && <div style={{ gridColumn: "1 / -1", fontSize: 12, color: locBusy ? "var(--accent)" : "var(--ink-2)" }}>{locBusy ? "📍 현재 위치 확인 중…" : locMsg}</div>}
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
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [phoneMsg, setPhoneMsg] = useState<string | null>(null);
  const router = useRouter();
  const onSaveToPhone = () => {
    setPhoneMsg("여는 중…");
    void (async () => {
      const r = await saveToPhone(c);
      if (r === "shared") setPhoneMsg("✅ 공유 시트에서 ‘연락처(연락처에 추가)’를 선택하세요");
      else if (r === "downloaded") setPhoneMsg("⬇️ 명함(.vcf) 저장됨 — 상단 알림바를 내려 파일을 탭하면 ‘연락처에 추가’ 화면이 열립니다");
      else if (r === "cancelled") setPhoneMsg(null);
      else setPhoneMsg("❌ 저장에 실패했어요");
      if (r !== "cancelled") setTimeout(() => setPhoneMsg(null), 12000);
    })();
  };
  const remove = () => {
    if (!confirm(`${c.name || c.company || "이 명함"}을(를) 삭제할까요?`)) return;
    start(async () => { await deleteCard(c.id, c.imageUrl); router.refresh(); });
  };
  const toContacts = () => {
    setSavedMsg(null);
    start(async () => {
      const r = await saveCardToContacts(c.id);
      if (r.ok) setSavedMsg("✅ 인적자산에 저장됨");
      else setSavedMsg((r.duplicated ? "ℹ️ " : "❌ ") + (r.error ?? "저장 실패"));
    });
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
        {(c.registeredDate || c.metDate || c.location || tags.length > 0) && (
          <div style={{ display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
            {c.registeredDate && <span className="muted" style={{ fontSize: 12 }}>🗓 등록 {c.registeredDate}</span>}
            {c.metDate && <span className="muted" style={{ fontSize: 12 }}>📅 {c.metDate}</span>}
            {c.location && <span className="muted" style={{ fontSize: 12 }}>📍 {c.location}</span>}
            {tags.map((t) => <span key={t} className="badge" style={{ background: "var(--line)", color: "var(--ink-2)" }}>{t}</span>)}
          </div>
        )}
        {c.note && <div style={{ fontSize: 13, marginTop: 5, whiteSpace: "pre-wrap" }}>📝 {c.note}</div>}
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          {tel && <a href={`tel:${tel}`} className="btn sm">📞 전화</a>}
          {tel && <a href={`sms:${tel}`} className="btn sm">💬 문자</a>}
          {c.email && <a href={`mailto:${c.email}`} className="btn sm">✉️ 메일</a>}
          {c.mobile && <a href="kakaotalk://" onClick={copyForKakao} className="btn sm" title="번호 복사 후 카카오톡 열기" style={{ background: "#fee500", borderColor: "#fee500", color: "#3c1e1e", textDecoration: "none" }}>🟡 카톡</a>}
          <button type="button" className="btn sm primary" onClick={onSaveToPhone} title="명함을 .vcf로 저장 → 파일을 열면 연락처에 추가" style={{ whiteSpace: "nowrap" }}>📇 연락처 저장</button>
        </div>
        {phoneMsg && <div style={{ fontSize: 12, marginTop: 6, color: phoneMsg.startsWith("✅") || phoneMsg.startsWith("⬇️") ? "var(--accent)" : "var(--ink-2)" }}>{phoneMsg}</div>}
        {kakaoHint && (
          <div style={{ fontSize: 12, marginTop: 6, color: "#92400e", background: "#fef3c7", border: "1px solid #fbbf24", borderRadius: 6, padding: "6px 8px" }}>
            📋 번호 복사됨! 카톡이 자동으로 안 열리면 카카오톡을 열고 <b>검색창</b>에 붙여넣어 대화하세요.
          </div>
        )}
      </div>
      {canEdit && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn sm" onClick={onEdit}>수정</button>
            <button className="btn sm" onClick={remove} disabled={pending} style={{ color: "var(--owner)" }}>삭제</button>
          </div>
          <button className="btn sm" onClick={toContacts} disabled={pending} title="이름·연락처·회사·주소·이메일을 인적자산에 저장" style={{ whiteSpace: "nowrap" }}>👤 인적자산 저장</button>
          {savedMsg && <span style={{ fontSize: 11.5, color: savedMsg.startsWith("✅") ? "var(--accent)" : "var(--ink-2)", whiteSpace: "nowrap" }}>{savedMsg}</span>}
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
    const out = items.filter((c) => {
      if (tag !== "전체") {
        const ts = c.tags?.split(",").map((t) => t.trim()) ?? [];
        if (!ts.includes(tag)) return false;
      }
      if (!s) return true;
      return [c.name, c.company, c.department, c.position, c.mobile, c.officePhone, c.email, c.address, c.website, c.tags, c.location, c.note]
        .filter(Boolean).join(" ").toLowerCase().includes(s);
    });
    // 등록일 최신순(등록일 없는 건 뒤로). 같은 날짜는 DB 생성순(최신 먼저) 유지.
    return out
      .map((c, i) => ({ c, i }))
      .sort((a, b) => {
        const da = a.c.registeredDate || "";
        const db = b.c.registeredDate || "";
        if (da !== db) return da < db ? 1 : -1; // 내림차순, 빈 값("")은 항상 뒤로
        return a.i - b.i; // 동률이면 원래 순서(생성 최신순) 유지
      })
      .map((x) => x.c);
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
