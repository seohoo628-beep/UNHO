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
 * 시장조사 API 키. 커머스 마케팅 플랜의 경쟁 제품 자동 검색(11번가)과
 * 키워드 조회량·연관 키워드(네이버 검색광고)에 쓰인다. 발급처가 달라 따로 받는다.
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
  const [shopKey, setShopKey] = useState("");
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
      if (!shopKey.trim()) {
        setShopMsg({ ok: false, text: "입력한 값이 없습니다. 저장된 키를 없애려면 ‘지우기’를 누르세요." });
        return;
      }
      const r = await saveNaverKeys({ shopKey });
      setShopMsg({ ok: r.ok, text: r.message ?? "" });
      if (r.ok) setShopKey("");
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
        which === "shop" ? { shopKey: "" } : { adKey: "", adSecret: "", adCustomerId: "" }
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
        커머스 마케팅 플랜(<b>/commerce-interview</b>)의 <b>경쟁 제품 자동 검색</b>과 <b>키워드 조회량·연관 키워드</b>에
        쓰입니다. 두 API 는 발급처가 달라 따로 받아야 하고, 한쪽만 넣어도 그 기능만 동작합니다. <b>판매건수·유입수</b>는 어느
        API 로도 제공되지 않아 계속 엑셀 업로드로 채웁니다.
      </p>

      {/* ── 쇼핑 검색 ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <span className={`badge ${shopConfigured ? "ok" : "owner"}`}>{shopConfigured ? "연결됨" : "미연결"}</span>
        <b style={{ fontSize: 13 }}>상품 검색 (11번가 오픈API)</b>
        <span className="muted" style={{ fontSize: 12 }}>
          {shopFromEnv ? "환경변수로 연결됨" : "경쟁 제품명·판매가·리뷰수를 가져옵니다"}
        </span>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: "0 0 8px" }}>
        <b>네이버 쇼핑 검색 API 는 2026-07-31 종료됐고 공식 대체가 없습니다.</b> (NAVER API HUB 로 옮겨간 것은 일반 검색·
        검색어트렌드·쇼핑인사이트뿐이라 제품명·판매가를 주지 않습니다.) 그래서 경쟁 제품 조회는 <b>11번가 오픈API</b> 로
        받습니다 — 리뷰수·평점까지 오므로 엑셀로 채우던 열이 하나 줄어듭니다. openapi.11st.co.kr → 회원가입 → <b>API 관리
        → 인증키 발급</b>. 상품·카테고리 검색은 판매자가 아니어도 발급됩니다.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          type="password"
          value={shopKey}
          onChange={(e) => setShopKey(e.target.value)}
          placeholder="11번가 오픈API 인증키"
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
