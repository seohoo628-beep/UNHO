"use client";
export default function PrintButton() {
  return <button onClick={() => window.print()} style={{ padding: "8px 16px", fontSize: 14, cursor: "pointer" }}>인쇄 / PDF로 저장</button>;
}
