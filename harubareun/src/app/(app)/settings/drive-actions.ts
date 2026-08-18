"use server";

import { revalidatePath } from "next/cache";
import { requireAppUser } from "@/lib/auth";
import { setSetting } from "@/lib/settings";
import { parseFolderId, listDriveFolder, driveConfigured } from "@/lib/drive";

type Result = { ok: boolean; error?: string; info?: string };

// 폴더 URL/ID를 저장하고, 서비스계정으로 읽히는지 즉시 확인한다.
export async function saveDriveFolder(input: string): Promise<Result> {
  const user = await requireAppUser();
  if (user.role !== "owner") return { ok: false, error: "대표만 변경할 수 있습니다." };

  const id = parseFolderId(input);
  if (!id) return { ok: false, error: "폴더 URL 또는 ID를 인식하지 못했습니다." };

  await setSetting("drive_folder_id", id);

  if (!driveConfigured()) {
    return { ok: true, info: "폴더는 저장했지만 서비스계정(GOOGLE_SA_*)이 아직 설정되지 않았습니다." };
  }
  const res = await listDriveFolder(id);
  if (!res.ok) {
    const err = res.error ?? "";
    const keyProblem = /DECODER|PEM|개인키|private_key|형식 오류|unsupported/i.test(err);
    const hint = keyProblem
      ? "→ GOOGLE_SA_PRIVATE_KEY(개인키) 값 문제입니다. JSON의 private_key 값 전체를 다시 넣거나 base64로 인코딩해 등록 후 재배포하세요."
      : "→ 폴더를 서비스계정 이메일에 뷰어로 공유했는지 확인하세요.";
    return { ok: true, info: `저장했지만 읽지 못했습니다: ${err} ${hint}` };
  }
  revalidatePath("/drive");
  revalidatePath("/settings");
  return { ok: true, info: `연동됨: 파일 ${(res.files ?? []).length}개 인식.` };
}
