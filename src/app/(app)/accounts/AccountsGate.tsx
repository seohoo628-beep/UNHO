"use client";

import { LockGate } from "@/components/LockGate";
import AccountsClient, { type Account } from "./AccountsClient";

// 계정 ID·PW 폴더는 로그인 이후에도 비밀번호(1233)로 한 번 더 잠근다.
export default function AccountsGate({ rows, dbReady }: { rows: Account[]; dbReady: boolean }) {
  return (
    <LockGate storageKey="lock:accounts" password="1233" heading="🔑 계정 ID·PW">
      {() => <AccountsClient rows={rows} dbReady={dbReady} />}
    </LockGate>
  );
}
