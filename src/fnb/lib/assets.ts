import type { StoreId } from "./types";

export interface AssetItem {
  title: string;
  src: string;
  desc?: string;
}
export interface StoreAssets {
  menu: AssetItem[]; // 메뉴 이미지
  plan: AssetItem[]; // 기획안(문서)
  video: AssetItem[]; // 기획/컨셉 영상
}

// 매장별 브랜드 자료(정적 파일 public/fnb-assets/*).
export const ASSETS: Partial<Record<StoreId, StoreAssets>> = {
  chdo: {
    menu: [
      { title: "테이블 메뉴판", src: "/fnb-assets/cheongdam/table-menu.png", desc: "시그니처 오리구이·화덕 통닭·전골·페어링" },
      { title: "시그니처 보드", src: "/fnb-assets/cheongdam/signature-board.png", desc: "매장 시그니처 보드" },
    ],
    plan: [
      { title: "청담 오리닭 사업기획안", src: "/fnb-assets/cheongdam/business-plan.pptx", desc: "PPTX · 브랜드 기획안 (REDESIGNED)" },
    ],
    video: [
      { title: "컨셉 영상 v1", src: "/fnb-assets/cheongdam/concept-1.mp4" },
      { title: "기획 영상 2", src: "/fnb-assets/cheongdam/concept-2.mp4" },
      { title: "기획 영상 3", src: "/fnb-assets/cheongdam/concept-3.mp4" },
    ],
  },
};

export function hasAssets(a?: StoreAssets): boolean {
  return !!a && (a.menu.length + a.plan.length + a.video.length > 0);
}
