import type { StoreId } from "./types";

export type AssetKind = "image" | "video" | "doc";

export interface AssetItem {
  title: string;
  src: string;
  kind: AssetKind;
  desc?: string;
}

export interface AssetSection {
  key: string;
  label: string;
  icon: string;
}

// 자료실 파일 섹션(정적 파일). '온라인 주문처' 링크는 페이지에서 편집형으로 별도 관리.
export const SECTIONS: AssetSection[] = [
  { key: "design", label: "디자인", icon: "🎨" },
  { key: "menu", label: "메뉴 이미지", icon: "🍽" },
  { key: "poster", label: "포스터·배너", icon: "🖼" },
  { key: "video", label: "콘텐츠 영상", icon: "🎬" },
  { key: "plan", label: "기획안·문서", icon: "📑" },
];

export type AssetMap = Record<string, AssetItem[]>;

// 매장별 자료(public/fnb-assets/*).
// 신미집·대운목장 자료 파일은 전달받는 대로 채웁니다(현재 비어 있음).
export const ASSETS: Partial<Record<StoreId, AssetMap>> = {};

export function assetCount(m?: AssetMap): number {
  if (!m) return 0;
  return SECTIONS.reduce((n, s) => n + (m[s.key]?.length ?? 0), 0);
}

// 온라인 주문처(유니폼·명찰·비품·기물 등) 링크 분류
export const ORDER_CATS = ["유니폼", "명찰", "비품", "기물", "인쇄물", "기타"];
