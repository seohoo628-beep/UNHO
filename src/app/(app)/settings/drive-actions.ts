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
    return { ok: true, info: `저장했지만 읽지 못했습니다: ${res.error} — 폴더를 서비스계정에 공유했는지 확인하세요.` };
  }
  revalidatePath("/drive");
  revalidatePath("/settings");
  return { ok: true, info: `연동됨: 파일 ${(res.files ?? []).length}개 인식.` };
}
