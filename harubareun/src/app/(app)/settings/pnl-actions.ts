"use server";

import { revalidatePath } from "next/cache";
import { requireAppUser } from "@/lib/auth";
import { setSetting } from "@/lib/settings";
import { fetchPnlRows, extractMonthlyPnl } from "@/lib/pnl";

type Result = { ok: boolean; error?: string; info?: string };

// 붙여넣은 구글 시트 URL에서 시트 ID와 gid(탭)를 뽑아 설정에 저장한다.
export async function savePnlSource(url: string): Promise<Result> {
  const user = await requireAppUser();
  if (user.role !== "owner") return { ok: false, error: "대표만 변경할 수 있습니다." };

  const id = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1];
  const gid = url.match(/[?#&]gid=(\d+)/)?.[1];
  if (!id || !gid) {
    return {
      ok: false,
      error: "URL에서 시트/탭을 못 읽었습니다. 원하는 탭을 연 상태의 주소(gid= 포함)를 붙여넣으세요.",
    };
  }

  await setSetting("pnl_sheet_id", id);
  await setSetting("pnl_gid", gid);

  // 저장 후 바로 읽어 손익표가 잡히는지 확인.
  const sheet = await fetchPnlRows();
  if (!sheet.ok || !sheet.rows) {
    return { ok: true, info: "저장했지만 시트를 읽지 못했습니다. 공유(뷰어)를 확인하세요." };
  }
  const m = extractMonthlyPnl(sheet.rows);
  if (!m) {
    // 원장(매출원장·매입원장) 탭을 잘못 고르는 경우가 많아 구체적으로 안내.
    const head = (sheet.rows[0]?.[0] ?? "").slice(0, 30);
    return {
      ok: true,
      info: `저장했지만 이 탭('${head}…')에서 손익표를 찾지 못했습니다. 원장(매출원장·매입원장)이 아니라, 화면에 '1월·2월…' 열과 '총매출·영업이익' 행이 보이는 '손익계산서' 탭의 URL을 넣으세요.`,
    };
  }

  revalidatePath("/pnl");
  revalidatePath("/settings");
  return { ok: true, info: `연동됨: ${m.periodKind}별 ${m.periods.length}개 기간 인식 (탭 gid ${gid}).` };
}
