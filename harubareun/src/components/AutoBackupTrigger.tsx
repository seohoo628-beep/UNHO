"use client";

import { useEffect } from "react";
import { autoDailyBackup } from "@/lib/backup";

// 대표 홈 진입 시 하루 1회 자동 백업을 화면 렌더와 분리해 백그라운드로 실행한다.
export default function AutoBackupTrigger() {
  useEffect(() => {
    autoDailyBackup().catch(() => {});
  }, []);
  return null;
}
