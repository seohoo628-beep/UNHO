"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createLead, updateLead, deleteLead, bulkAddLeads } from "./actions";

export type Lead = {
  id: string;
  handle: string;
  name: string;
  category: string;
  stage: string;
  followers: number | null;
  product: string;
  contact: string;
  contact2: string;
  email: string;
  link: string;
  agency: string;
  source: string;
  note: string;
};

const CATEGORIES = ["뷰티", "패션", "음식", "리빙", "헬스", "유아", "반려", "여행", "기타"] as const;
const STAGES = ["미접촉", "DM발송", "회신대기", "협의중", "계약완료", "보류", "거절"] as const;
const STAGE_COLOR: Record<string, string> = {
  미접촉: "#64748b",
  DM발송: "#f59e0b",
  회신대기: "#0ea5e9",
  협의중: "#7c3aed",
  계약완료: "#16a34a",
  보류: "#a16207",
  거절: "#dc2626",
};

function fmtFollowers(n: number | null): string {
  if (!n) return "";
  if (n >= 10000) return `${(n / 10000).toFixed(n % 10000 === 0 ? 0 : 1)}만`;
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}천`;
  return String(n);
}

function Fields({ c }: { c?: Lead }) {
  return (
    <>
      <div className="row">
        <label className="field" style={{ marginBottom: 0 }}>
          <span>계정명(@핸들)</span>
          <input name="handle" placeholder="@username" defaultValue={c?.handle ?? ""} />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>이름/담당자</span>
          <input name="name" defaultValue={c?.name ?? ""} />
        </label>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>분야</span>
          <select name="category" defaultValue={c?.category ?? ""}>
            <option value="">(선택)</option>
            {CATEGORIES.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>영업단계</span>
          <select name="stage" defaultValue={c?.stage ?? "미접촉"}>
            {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>팔로워</span>
          <input name="followers" placeholder="예) 12000 / 1.2만" defaultValue={c?.followers ?? ""} />
        </label>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>제안 제품</span>
          <input name="product" placeholder="예) 리앤밤 / 주당의비결" defaultValue={c?.product ?? ""} />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>소속사/MCN</span>
          <input name="agency" defaultValue={c?.agency ?? ""} />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>유입경로/발견처</span>
          <input name="source" placeholder="예) 추천, 검색, DM" defaultValue={c?.source ?? ""} />
        </label>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>연락처</span>
          <input name="contact" placeholder="010-0000-0000" defaultValue={c?.contact ?? ""} />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>연락처2</span>
          <input name="contact2" placeholder="추가 번호" defaultValue={c?.contact2 ?? ""} />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>이메일</span>
          <input name="email" type="email" defaultValue={c?.email ?? ""} />
        </label>
      </div>
      <label className="field" style={{ marginTop: 10 }}>
        <span>틱톡 링크</span>
        <input name="link" placeholder="https://www.tiktok.com/@username" defaultValue={c?.link ?? ""} />
      </label>
      <label className="field" style={{ marginTop: 10 }}>
        <span>메모</span>
        <textarea name="note" rows={2} placeholder="제안 내용·회신·조건 등" defaultValue={c?.note ?? ""} />
      </label>
    </>
  );
}

function AddForm() {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function submit(fd: FormData) {
    setErr(null);
    start(async () => {
      const r = await createLead(fd);
      if (!r.ok) return setErr(r.error ?? "저장 실패");
      formRef.current?.reset();
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) return <button className="btn primary" onClick={() => setOpen(true)}>+ 리스트 추가</button>;
  return (
    <form ref={formRef} action={submit} className="card" style={{ padding: 14, marginBottom: 16 }}>
      <Fields />
      {err && <div style={{ color: "var(--owner)", fontSize: 12, marginTop: 8 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button className="btn primary" disabled={pending}>{pending ? "저장 중…" : "저장"}</button>
        <button type="button" className="btn" onClick={() => setOpen(false)} disabled={pending}>취소</button>
      </div>
    </form>
  );
}

function BulkForm() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function submit() {
    setMsg(null);
    start(async () => {
      const r = await bulkAddLeads(text);
      if (!r.ok) return setMsg("❌ " + (r.error ?? "실패"));
      setMsg(`✅ ${r.added ?? 0}건 추가 · ${r.updated ?? 0}건 갱신`);
      setText("");
      router.refresh();
    });
  }

  if (!open) return <button className="btn" onClick={() => setOpen(true)}>📋 명단 붙여넣기</button>;
  return (
    <div className="card" style={{ padding: 14, marginBottom: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>명단 붙여넣기 일괄 추가</div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 0, marginBottom: 8 }}>
        한 줄에 한 명. 형식: <b>계정명, 이름, 분야, 팔로워, 연락처</b> (뒤 항목은 생략 가능).<br />
        예) <code>@beautykim, 김뷰티, 뷰티, 12000, 010-1234-5678</code> · 또는 계정명만 <code>@beautykim</code><br />
        분야·팔로워·연락처는 자동 인식하고, 같은 계정이면 중복 없이 빈 칸만 채웁니다(새 항목은 &lsquo;미접촉&rsquo;).
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        placeholder={"@beautykim, 김뷰티, 뷰티, 12000\n@foodie_lee, 이푸디, 음식, 3.5만, 010-1234-5678\n@handle_only"}
        style={{ width: "100%", fontSize: 13, fontFamily: "inherit" }}
      />
      {msg && <div style={{ fontSize: 13, marginTop: 8 }}>{msg}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button className="btn primary" onClick={submit} disabled={pending || !text.trim()}>{pending ? "처리 중…" : "일괄 추가"}</button>
        <button className="btn" onClick={() => setOpen(false)} disabled={pending}>닫기</button>
      </div>
    </div>
  );
}

function Row({ c }: { c: Lead }) {
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [kakaoHint, setKakaoHint] = useState(false);
  const router = useRouter();

  function submit(fd: FormData) {
    setErr(null);
    start(async () => {
      const r = await updateLead(c.id, fd);
      if (!r.ok) return setErr(r.error ?? "저장 실패");
      setEditing(false);
      router.refresh();
    });
  }
  function remove() {
    if (!confirm(`${c.handle || c.name} 님을 삭제할까요?`)) return;
    start(async () => {
      await deleteLead(c.id);
      router.refresh();
    });
  }

  const stageColor = STAGE_COLOR[c.stage] ?? "#64748b";
  const meta = [c.category, c.followers ? `팔로워 ${fmtFollowers(c.followers)}` : "", c.product ? `제안: ${c.product}` : ""].filter(Boolean).join(" · ");
  const tel = (c.contact || "").replace(/[^0-9+]/g, "");
  const copyForKakao = () => {
    if (c.contact) { try { navigator.clipboard.writeText(c.contact); } catch { /* ignore */ } }
    setKakaoHint(true);
    setTimeout(() => setKakaoHint(false), 6000);
  };

  return (
    <div className="card" style={{ padding: 14, borderLeft: `4px solid ${stageColor}` }}>
      {!editing ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 200, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span className="badge" style={{ background: stageColor, color: "#fff" }}>{c.stage || "미접촉"}</span>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{c.handle || c.name}</span>
              {c.handle && c.name && <span className="muted" style={{ fontSize: 12.5 }}>{c.name}</span>}
            </div>
            {meta && <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>{meta}</div>}
            {(c.agency || c.source) && (
              <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                {[c.agency && `소속: ${c.agency}`, c.source && `유입: ${c.source}`].filter(Boolean).join(" · ")}
              </div>
            )}
            <div className="muted" style={{ fontSize: 12.5, marginTop: 3, display: "flex", gap: 12, flexWrap: "wrap" }}>
              {c.contact && <span>📞 {c.contact}</span>}
              {c.contact2 && <span>📱 {c.contact2}</span>}
              {c.email && <span>✉️ {c.email}</span>}
            </div>
            {c.note && <div style={{ fontSize: 13, marginTop: 5, whiteSpace: "pre-wrap" }}>📝 {c.note}</div>}
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              {c.link && <a href={c.link} target="_blank" rel="noreferrer" className="btn sm" style={{ background: "#000", borderColor: "#000", color: "#fff", textDecoration: "none" }}>🎵 틱톡 열기</a>}
              {c.contact && <a href={`tel:${tel}`} className="btn sm">📞 전화</a>}
              {c.contact && <a href={`sms:${tel}`} className="btn sm">💬 문자</a>}
              {c.contact && <a href="kakaotalk://" onClick={copyForKakao} className="btn sm" title="번호 복사 후 카카오톡 열기" style={{ background: "#fee500", borderColor: "#fee500", color: "#3c1e1e", textDecoration: "none" }}>🟡 카톡</a>}
            </div>
            {kakaoHint && (
              <div style={{ fontSize: 12, marginTop: 6, color: "#92400e", background: "#fef3c7", border: "1px solid #fbbf24", borderRadius: 6, padding: "6px 8px" }}>
                📋 번호 복사됨! 카톡이 <b>자동으로 안 열리면</b> 카카오톡을 열고 <b>검색창(돋보기)</b>에 붙여넣어 대화하세요.
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn sm" onClick={() => setEditing(true)}>수정</button>
            <button className="btn sm" onClick={remove} disabled={pending} style={{ color: "var(--owner)" }}>삭제</button>
          </div>
        </div>
      ) : (
        <form action={submit}>
          <Fields c={c} />
          {err && <div style={{ color: "var(--owner)", fontSize: 12, marginTop: 8 }}>{err}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="btn primary" disabled={pending}>{pending ? "저장 중…" : "수정 저장"}</button>
            <button type="button" className="btn" onClick={() => setEditing(false)} disabled={pending}>취소</button>
          </div>
        </form>
      )}
    </div>
  );
}

function RevenueBanner() {
  const [open, setOpen] = useState(true);
  const Section = ({ n, title, children }: { n: string; title: string; children: React.ReactNode }) => (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, fontSize: 14.5, color: "var(--ink)" }}>
        <span style={{ background: "#111", color: "#25f4ee", borderRadius: 6, padding: "1px 8px", fontSize: 13 }}>{n}</span>
        {title}
      </div>
      <div style={{ marginTop: 6, fontSize: 13.5, lineHeight: 1.65, color: "var(--ink)" }}>{children}</div>
    </div>
  );
  const Bonus = ({ mark, title, body, key_ }: { mark: string; title: string; body: React.ReactNode; key_: string }) => (
    <div className="card" style={{ padding: 12, borderLeft: "3px solid #fe2c55" }}>
      <div style={{ fontWeight: 800, fontSize: 13.5 }}>{mark} {title}</div>
      <div style={{ fontSize: 13, lineHeight: 1.6, marginTop: 4, color: "var(--ink-2)" }}>{body}</div>
      <div style={{ fontSize: 12.5, marginTop: 6, color: "#be185d", fontWeight: 700 }}>👉 {key_}</div>
    </div>
  );
  return (
    <div className="card" style={{ marginBottom: 14, overflow: "hidden", border: "1px solid #fbcfe8", padding: 0 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", textAlign: "left", cursor: "pointer", border: "none", color: "#fff", padding: "12px 16px", fontSize: 15, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "space-between", background: "linear-gradient(120deg, #010101 0%, #3d2a4d 45%, #fe2c55 100%)" }}
      >
        <span>📌 틱톡 에이전트 수익 구조 안내</span>
        <span style={{ fontSize: 13, opacity: 0.9 }}>{open ? "접기 ▲" : "펼치기 ▼"}</span>
      </button>
      {open && (
        <div style={{ padding: 16 }}>
          <div style={{ background: "#fdf2f8", border: "1px solid #fbcfe8", borderRadius: 10, padding: "10px 12px", fontSize: 13.5, lineHeight: 1.6 }}>
            <b>한 줄 요약</b> — 크리에이터 수익(틱톡 50 : 크리에이터 50)은 <b>건드리지 않습니다.</b> 에이전트 수익은 틱톡 본사가 주는 <b>&lsquo;성과 보너스&rsquo;</b>를 에이전시와 <b>5:5</b>로 나눈 것입니다.
          </div>

          <Section n="1️⃣" title="기본 구조">
            • 라이브 수익: <b>틱톡 50% / 크리에이터 50%</b><br />
            • 에이전트는 크리에이터 수익을 나눠 갖지 <b>않습니다.</b><br />
            • 대신 틱톡 본사가 <b>성과 기반 보너스</b>를 별도로 지급합니다.
          </Section>

          <Section n="2️⃣" title="수익 발생 방식">
            ① 크리에이터가 라이브로 <b>다이아몬드(수익)</b> 발생<br />
            ② 틱톡 본사가 그 성과를 기준으로 <b>보너스</b> 지급<br />
            ③ 보너스 중 일부는 <b>크리에이터 지원금</b>, 나머지는 <b>에이전시 : 에이전트 = 5:5</b> 분배<br />
            <span style={{ color: "#be185d", fontWeight: 700 }}>👉 크리에이터 수익은 전부 크리에이터가 / 추가 보너스에서 에이전시·에이전트 수익 발생</span>
          </Section>

          <Section n="3️⃣" title="보너스 구성 (4종)">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10, marginTop: 4 }}>
              <Bonus mark="①" title="랭크업 보너스" key_="랭킹 상승이 가장 높은 수익 요소" body={<>월간 성과(다이아몬드) 랭킹 기준. <b>상승=최대</b>, <b>유지=일부</b>, <b>하락=미지급·감소</b>. 전월 대비 80% 이상 유지 시 추가 보너스, 라이브 일수·시간 등 조건 충족 시 지급.</>} />
              <Bonus mark="②" title="크리에이터 활성화 보너스" key_="꾸준한 방송이 수익으로 직결" body={<>방송 <b>일수·시간</b>에 따라 단계별 증가. 최대 <b>약 3.5%</b> 수준까지 상승 가능.</>} />
              <Bonus mark="③" title="에이전시 성장 보너스" key_="개인이 아닌 팀 전체 성장이 중요" body={<>에이전시(팀) 전체 성과 기준. 목표 달성률 차등 — <b>100% → 약 9%</b>, <b>130% → 약 15%</b>.</>} />
              <Bonus mark="④" title="경력직(기존 크리에이터) 보너스" key_="타 플랫폼 크리에이터 영입 시 추가 수익" body={<>다른 플랫폼에서 이미 활동 중인 크리에이터를 영입하면 <b>추가 보너스</b> 지급.</>} />
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}

export default function TikTokLeadsClient({ items, dbReady }: { items: Lead[]; dbReady: boolean }) {
  const [q, setQ] = useState("");
  const [stage, setStage] = useState("전체");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter((c) => {
      if (stage !== "전체" && (c.stage || "미접촉") !== stage) return false;
      if (!s) return true;
      return [c.handle, c.name, c.category, c.product, c.contact, c.agency, c.source, c.note]
        .filter(Boolean).join(" ").toLowerCase().includes(s);
    });
  }, [items, q, stage]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of items) {
      const k = c.stage || "미접촉";
      m[k] = (m[k] ?? 0) + 1;
    }
    return m;
  }, [items]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>🔒 틱톡 영업 리스트</h1>
          <p>대표님만 볼 수 있는 틱톡 셀러·크리에이터 영업 파이프라인입니다.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <BulkForm />
          <AddForm />
        </div>
      </div>

      <RevenueBanner />

      {!dbReady && (
        <div className="card" style={{ padding: 14, marginBottom: 14 }}>
          <div className="empty">테이블이 아직 준비되지 않았습니다. 마이그레이션(0066_tiktok_leads)을 적용해 주세요.</div>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {["전체", ...STAGES].map((t) => {
          const n = t === "전체" ? items.length : counts[t] ?? 0;
          return (
            <button key={t} className={`btn sm${stage === t ? " primary" : ""}`} onClick={() => setStage(t)}>
              {t} {n > 0 && <span style={{ opacity: 0.7 }}>({n})</span>}
            </button>
          );
        })}
      </div>

      <div style={{ marginBottom: 14, maxWidth: 360 }}>
        <input placeholder="계정·이름·분야·연락처 검색" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%" }} />
      </div>

      {filtered.length === 0 ? (
        <div className="card"><div className="empty">{q || stage !== "전체" ? "해당 결과가 없습니다." : "등록된 리스트가 없습니다. “+ 리스트 추가” 또는 “📋 명단 붙여넣기”로 시작하세요."}</div></div>
      ) : (
        <>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>총 {filtered.length}건</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map((c) => <Row key={c.id} c={c} />)}
          </div>
        </>
      )}
    </div>
  );
}
