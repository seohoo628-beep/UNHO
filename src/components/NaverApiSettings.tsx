"use client";

import { useState, useTransition } from "react";
import { saveNaverKeys, testNaverShop, testNaverAd } from "@/app/(app)/settings/naver-actions";

type Msg = { ok: boolean; text: string } | null;

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 200,
  padding: "8px 11px",
  border: "1px solid var(--line)",
  borderRadius: 10,
  background: "var(--surface-2)",
  color: "var(--ink)",
  fontSize: 13,
};

/**
 * 네이버 시장조사 API 키. 커머스 인터뷰지의 경쟁 제품 자동 검색과
 * 키워드 조회량 자동 채우기에 쓰인다. 두 API 는 발급처가 달라 따로 받는다.
 */
export default function NaverApiSettings({
  shopConfigured,
  adConfigured,
  shopFromEnv,
  adFromEnv,
}: {
  shopConfigured: boolean;
  adConfigured: boolean;
  shopFromEnv: boolean;
  adFromEnv: boolean;
}) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [adKey, setAdKey] = useState("");
  const [adSecret, setAdSecret] = useState("");
  const [adCustomerId, setAdCustomerId] = useState("");
  const [shopMsg, setShopMsg] = useState<Msg>(null);
  const [adMsg, setAdMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();

  // 저장 후 입력칸을 비우므로, 빈 칸으로 다시 누르면 저장된 키가 지워진다.
  // 그건 사고이지 의도가 아니라서 막고, 지우기는 따로 버튼을 둔다.
  const saveShop = () =>
    start(async () => {
      if (!clientId.trim() && !clientSecret.trim()) {
        setShopMsg({ ok: false, text: "입력한 값이 없습니다. 저장된 키를 없애려면 ‘지우기’를 누르세요." });
        return;
      }
      const r = await saveNaverKeys({ clientId, clientSecret });
      setShopMsg({ ok: r.ok, text: r.message ?? "" });
      if (r.ok) {
        setClientId("");
        setClientSecret("");
      }
    });

  const saveAd = () =>
    start(async () => {
      if (!adKey.trim() && !adSecret.trim() && !adCustomerId.trim()) {
        setAdMsg({ ok: false, text: "입력한 값이 없습니다. 저장된 키를 없애려면 ‘지우기’를 누르세요." });
        return;
      }
      const r = await saveNaverKeys({ adKey, adSecret, adCustomerId });
      setAdMsg({ ok: r.ok, text: r.message ?? "" });
      if (r.ok) {
        setAdKey("");
        setAdSecret("");
        setAdCustomerId("");
      }
    });

  const clearKeys = (which: "shop" | "ad") =>
    start(async () => {
      const set = which === "shop" ? setShopMsg : setAdMsg;
      const r = await saveNaverKeys(
        which === "shop"
          ? { clientId: "", clientSecret: "" }
          : { adKey: "", adSecret: "", adCustomerId: "" }
      );
      set({ ok: r.ok, text: r.ok ? "저장된 키를 지웠습니다." : (r.message ?? "") });
    });

  const runTest = (which: "shop" | "ad") =>
    start(async () => {
      const set = which === "shop" ? setShopMsg : setAdMsg;
      set({ ok: true, text: "연결 확인 중…" });
      const r = await (which === "shop" ? testNaverShop() : testNaverAd());
      set({ ok: r.ok, text: r.message ?? "" });
    });

  const note = (m: Msg) =>
    m && (
      <p
        className="muted"
        style={{ fontSize: 12.5, marginTop: 8, marginBottom: 0, color: m.ok ? "var(--ok)" : "var(--danger)" }}
      >
        {m.text}
      </p>
    );

  return (
    <div className="card">
      <p className="muted" style={{ fontSize: 12.5, margin: "0 0 12px" }}>
        커머스 인터뷰지(<b>/commerce-interview</b>)의 <b>경쟁 제품 자동 검색</b>과 <b>키워드 조회량 자동 채우기</b>에
        쓰입니다. 두 API 는 발급처가 달라 따로 받아야 하고, 한쪽만 넣어도 그 기능만 동작합니다. 판매건수·리뷰수·유입수는
        어느 API 로도 제공되지 않아 계속 엑셀 업로드로 채웁니다.
      </p>

      {/* ── 쇼핑 검색 ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <span className={`badge ${shopConfigured ? "ok" : "owner"}`}>{shopConfigured ? "연결됨" : "미연결"}</span>
        <b style={{ fontSize: 13 }}>쇼핑 검색 (오픈API)</b>
        <span className="muted" style={{ fontSize: 12 }}>
          {shopFromEnv ? "환경변수로 연결됨" : "경쟁 제품명·판매가를 가져옵니다"}
        </span>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: "0 0 8px" }}>
        developers.naver.com → Application → 애플리케이션 등록. <b>사용 API</b> 목록에 ‘검색’이 없어도 됩니다 — 검색은
        비로그인 오픈API라 앱만 등록하면 발급된 키로 바로 호출됩니다. 등록 후 <b>내 애플리케이션 → 개요</b> 탭의 Client
        ID·Secret 을 그대로 붙여넣으세요.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="Client ID"
          autoComplete="off"
          style={inputStyle}
        />
        <input
          type="password"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          placeholder="Client Secret"
          autoComplete="off"
          style={inputStyle}
        />
        <button className="btn" onClick={saveShop} disabled={pending}>
          저장
        </button>
        <button className="btn ghost" onClick={() => runTest("shop")} disabled={pending}>
          연결 테스트
        </button>
        {shopConfigured && !shopFromEnv && (
          <button className="btn ghost" onClick={() => clearKeys("shop")} disabled={pending}>
            지우기
          </button>
        )}
      </div>
      {note(shopMsg)}

      <hr style={{ border: 0, borderTop: "1px solid var(--line)", margin: "18px 0" }} />

      {/* ── 검색광고 키워드도구 ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <span className={`badge ${adConfigured ? "ok" : "owner"}`}>{adConfigured ? "연결됨" : "미연결"}</span>
        <b style={{ fontSize: 13 }}>키워드도구 (검색광고API)</b>
        <span className="muted" style={{ fontSize: 12 }}>
          {adFromEnv ? "환경변수로 연결됨" : "키워드 월간 검색수를 가져옵니다"}
        </span>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: "0 0 8px" }}>
        searchad.naver.com → 도구 → API 사용관리에서 액세스 라이선스·비밀키·Customer ID 발급.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          value={adCustomerId}
          onChange={(e) => setAdCustomerId(e.target.value)}
          placeholder="Customer ID (숫자)"
          autoComplete="off"
          style={{ ...inputStyle, minWidth: 140, flex: "0 0 160px" }}
        />
        <input
          value={adKey}
          onChange={(e) => setAdKey(e.target.value)}
          placeholder="액세스 라이선스"
          autoComplete="off"
          style={inputStyle}
        />
        <input
          type="password"
          value={adSecret}
          onChange={(e) => setAdSecret(e.target.value)}
          placeholder="비밀키"
          autoComplete="off"
          style={inputStyle}
        />
        <button className="btn" onClick={saveAd} disabled={pending}>
          저장
        </button>
        <button className="btn ghost" onClick={() => runTest("ad")} disabled={pending}>
          연결 테스트
        </button>
        {adConfigured && !adFromEnv && (
          <button className="btn ghost" onClick={() => clearKeys("ad")} disabled={pending}>
            지우기
          </button>
        )}
      </div>
      {note(adMsg)}
    </div>
  );
}
