"use client";

// 같은 scope의 CollapsibleGroup들을 일괄 접기/펼치기.
export default function CollapseAllButtons({ scope }: { scope?: string }) {
  const fire = (open: boolean) => {
    window.dispatchEvent(new CustomEvent("collapse-all-groups", { detail: { open, scope } }));
  };
  return (
    <span style={{ display: "inline-flex", gap: 6 }}>
      <button className="btn sm" onClick={() => fire(false)}>모두 접기</button>
      <button className="btn sm" onClick={() => fire(true)}>모두 펼치기</button>
    </span>
  );
}
