// 폴더 전환 시 사이드바는 그대로 두고 본문만 스켈레톤을 즉시 보여준다.
// (loading 경계가 있어야 <Link> 프리페치와 즉시 전환이 동작한다)
export default function Loading() {
  const bar = (w: string, h = 14) => (
    <div style={{ width: w, height: h, borderRadius: 8, background: "var(--line)", opacity: 0.7 }} />
  );
  return (
    <div aria-busy="true" aria-label="불러오는 중" style={{ animation: "pulse 1.2s ease-in-out infinite" }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.45}}`}</style>
      <div style={{ marginBottom: 18 }}>{bar("220px", 24)}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 18 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card" style={{ padding: "12px 14px" }}>
            {bar("60%", 11)}
            <div style={{ height: 8 }} />
            {bar("40%", 18)}
          </div>
        ))}
      </div>
      <div className="card" style={{ padding: 16 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", padding: "9px 0", borderTop: i ? "1px solid var(--line)" : "none" }}>
            {bar("18px", 18)}
            {bar(`${55 - i * 5}%`)}
            <span style={{ flex: 1 }} />
            {bar("70px")}
          </div>
        ))}
      </div>
    </div>
  );
}
