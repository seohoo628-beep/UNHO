import type { Store } from "./types";

export const STORES: Store[] = [
  {
    id: "chdo",
    name: "청담 오리닭",
    concept: "오리·닭 요리 전문 프리미엄 다이닝",
    address: "서울 강남구 청담동 123-4",
    phone: "02-540-0000",
    openHours: "11:30 – 22:00 (브레이크 15:00–17:00)",
    seats: 64,
    managerName: "김점장",
    color: "#c2410c", // 오렌지/테라코타
    emoji: "🦆",
  },
  {
    id: "euwb",
    name: "은우 더 블랙",
    concept: "모던 코리안 & 와인 페어링 블랙 다이닝",
    address: "서울 강남구 논현동 55-8",
    phone: "02-511-0000",
    openHours: "17:00 – 24:00 (라스트오더 23:00)",
    seats: 42,
    managerName: "이매니저",
    color: "#334155", // 다크 슬레이트
    emoji: "🍷",
  },
];

export const STORE_MAP: Record<string, Store> = Object.fromEntries(
  STORES.map((s) => [s.id, s])
);

export function storeName(id: string): string {
  if (id === "all") return "전 매장";
  return STORE_MAP[id]?.name ?? id;
}
