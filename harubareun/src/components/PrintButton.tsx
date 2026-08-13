"use client";

export default function PrintButton() {
  return (
    <button className="btn" onClick={() => window.print()}>
      PDF로 내보내기 (인쇄)
    </button>
  );
}
