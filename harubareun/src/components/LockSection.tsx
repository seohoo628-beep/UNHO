"use client";

import { LockGate } from "@/components/LockGate";

// 서버에서 렌더된 자식을 비밀번호 잠금으로 감싼다(P&L·매장 등).
export default function LockSection({
  storageKey,
  password,
  heading,
  children,
}: {
  storageKey: string;
  password: string;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <LockGate storageKey={storageKey} password={password} heading={heading}>
      {(lock) => (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
            <button className="btn" onClick={lock} title="다시 잠그기" style={{ padding: "3px 10px", fontSize: 12 }}>🔒 잠금</button>
          </div>
          {children}
        </>
      )}
    </LockGate>
  );
}
