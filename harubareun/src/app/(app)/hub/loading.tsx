// 페이지 데이터 로딩 중 스켈레톤(공통 패턴).
export default function Loading() {
  const bar = (w: string, h = 14) => (
    <div style={{ width: w, height: h, borderRadius: 6, background: "var(--line, #e4e7eb)", opacity: 0.6 }} />
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, animation: "pulse 1.2s ease-in-out infinite" }}>
      <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: .55 } }`}</style>
      {bar("38%", 22)}
      {bar("62%")}
      <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        {bar("30%")}{bar("85%")}{bar("70%")}
      </div>
      <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        {bar("24%")}{bar("90%")}{bar("55%")}{bar("75%")}
      </div>
    </div>
  );
}
