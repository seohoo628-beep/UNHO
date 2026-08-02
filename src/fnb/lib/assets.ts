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
export const ASSETS: Partial<Record<StoreId, AssetMap>> = {
  chdo: {
    menu: [
      { title: "테이블 메뉴판", src: "/fnb-assets/cheongdam/table-menu.png", kind: "image", desc: "시그니처 오리구이·화덕 통닭·전골·페어링" },
      { title: "시그니처 보드", src: "/fnb-assets/cheongdam/signature-board.png", kind: "image", desc: "매장 시그니처 보드" },
    ],
    plan: [
      { title: "청담 오리닭 사업기획안", src: "/fnb-assets/cheongdam/business-plan.pptx", kind: "doc", desc: "PPTX · 브랜드 기획안 (REDESIGNED)" },
    ],
    video: [
      { title: "컨셉 영상 v1", src: "/fnb-assets/cheongdam/concept-1.mp4", kind: "video" },
      { title: "기획 영상 2", src: "/fnb-assets/cheongdam/concept-2.mp4", kind: "video" },
      { title: "기획 영상 3", src: "/fnb-assets/cheongdam/concept-3.mp4", kind: "video" },
    ],
  },
};

export function assetCount(m?: AssetMap): number {
  if (!m) return 0;
  return SECTIONS.reduce((n, s) => n + (m[s.key]?.length ?? 0), 0);
}

// 온라인 주문처(유니폼·명찰·비품·기물 등) 링크 분류
export const ORDER_CATS = ["유니폼", "명찰", "비품", "기물", "인쇄물", "기타"];
