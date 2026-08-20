"use server";

import { revalidatePath } from "next/cache";
import { requireAppUser } from "@/lib/auth";
import { setSetting } from "@/lib/settings";
import { getNaverKeys, adConfigured, keywordStats } from "@/lib/naver";
import { getShopKey, shopConfigured, searchShop, inspectShopFields } from "@/lib/shopsearch";

type Result = { ok: boolean; message?: string };

/** 시장조사 키 저장 (대표 전용). 빈 값으로 보내면 해당 키만 지운다. */
export async function saveNaverKeys(v: {
  shopKey?: string;
  adKey?: string;
  adSecret?: string;
  adCustomerId?: string;
}): Promise<Result> {
  const u = await requireAppUser();
  if (u.role !== "owner") return { ok: false, message: "대표만 설정할 수 있습니다." };

  const map: [string, string | undefined][] = [
    ["eleventh_api_key", v.shopKey],
    ["naver_ad_api_key", v.adKey],
    ["naver_ad_secret_key", v.adSecret],
    ["naver_ad_customer_id", v.adCustomerId],
  ];
  // undefined 는 "건드리지 않음", 빈 문자열은 "삭제"로 본다.
  await Promise.all(
    map
      .filter(([, val]) => val !== undefined)
      .map(([key, val]) => setSetting(key, (val ?? "").trim() || null))
  );
  revalidatePath("/settings");
  return { ok: true, message: "저장되었습니다. ‘연결 테스트’로 확인하세요." };
}

/** 저장된 값이 맞는지 눈으로 확인할 수 있게 앞뒤만 남기고 가린다. */
const mask = (v: string) =>
  v.length <= 6 ? `${v.slice(0, 2)}…(${v.length}자)` : `${v.slice(0, 4)}…${v.slice(-2)} (${v.length}자)`;

export async function testNaverShop(): Promise<Result> {
  const u = await requireAppUser();
  if (u.role !== "owner") return { ok: false, message: "대표만 실행할 수 있습니다." };
  const key = await getShopKey();
  if (!shopConfigured(key)) return { ok: false, message: "오픈API 키를 먼저 저장하세요." };
  try {
    const items = await searchShop("숙취해소제", 3);
    if (!items.length) return { ok: false, message: `연결은 됐지만 결과가 0건입니다 / 저장된 키 ${mask(key)}` };
    const t = items[0];
    let msg = `연결 성공 — 예시 ${items.length}건 (${t.title} · ${t.price.toLocaleString("ko-KR")}원 · 리뷰 ${t.reviews})`;
    // 리뷰수·링크는 태그 이름을 확정하지 못해 느슨하게 찾는다. 안 잡히면 추측 대신
    // 실제 응답의 태그 이름을 보여줘, 한 번 보고 정확히 고칠 수 있게 한다.
    if (!t.reviews || !t.link) {
      const fields = await inspectShopFields();
      const miss = [!t.reviews && "리뷰수", !t.link && "상세링크"].filter(Boolean).join("·");
      if (fields.length) msg += ` / ${miss} 를 못 찾았습니다 — 응답 태그: ${fields.join(", ")}`;
    }
    return { ok: true, message: msg };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "연결 실패";
    // 어떤 값으로 시도했는지 같이 보여줘야 오타·잘림을 바로 잡을 수 있다.
    return { ok: false, message: `${msg} / 저장된 키 ${mask(key)}` };
  }
}

export async function testNaverAd(): Promise<Result> {
  const u = await requireAppUser();
  if (u.role !== "owner") return { ok: false, message: "대표만 실행할 수 있습니다." };
  const k = await getNaverKeys();
  if (!adConfigured(k)) return { ok: false, message: "API 키·Secret·Customer ID 를 먼저 저장하세요." };
  try {
    const stats = await keywordStats(["숙취해소제"]);
    const top = stats[0];
    return {
      ok: true,
      message: top ? `연결 성공 — "${top.keyword}" 월 ${top.total.toLocaleString("ko-KR")}회` : "연결 성공",
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "연결 실패" };
  }
}
