import type { Store } from "./types";

export const STORES: Store[] = [
  {
    id: "smjp",
    name: "신미집",
    concept: "한식 백반·찌개 전문 노포",
    address: "서울 종로구 익선동 33-1",
    phone: "02-765-0000",
    openHours: "10:30 – 21:00 (브레이크 15:30–17:00)",
    seats: 44,
    managerName: "정사장",
    color: "#b45309",
    emoji: "🍚",
  },
  {
    id: "dwmc",
    name: "대운목장",
    concept: "목장 직영 한우 구이 전문",
    address: "경기 남양주시 화도읍 대운로 100",
    phone: "031-592-0000",
    openHours: "12:00 – 22:00 (라스트오더 21:00)",
    seats: 72,
    managerName: "강대표",
    color: "#166534",
    emoji: "🐄",
  },
];

export const STORE_MAP: Record<string, Store> = Object.fromEntries(
  STORES.map((s) => [s.id, s])
);

export function storeName(id: string): string {
  if (id === "all") return "전 매장";
  return STORE_MAP[id]?.name ?? id;
}
