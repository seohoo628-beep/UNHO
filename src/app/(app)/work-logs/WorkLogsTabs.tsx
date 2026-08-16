"use client";

import { useState } from "react";
import ManagerLogClient, { type Log, type Incentive } from "../manager-log/ManagerLogClient";
import DesignerLogClient, { type DesignerLog } from "../designer-log/DesignerLogClient";

// 담당자별 업무일지 통합 뷰: 상단 탭으로 경영지원매니저 / 디자이너 전환.
export default function WorkLogsTabs({
  today,
  manager,
  designer,
}: {
  today: string;
  manager: { logs: Log[]; incentives: Incentive[]; dbReady: boolean };
  designer: { logs: DesignerLog[]; users: { id: string; name: string }[]; dbReady: boolean };
}) {
  const [tab, setTab] = useState<"manager" | "designer">("manager");

  const TabBtn = ({ id, label }: { id: "manager" | "designer"; label: string }) => (
    <button
      onClick={() => setTab(id)}
      className="btn"
      style={{
        border: "none", borderRadius: 0, padding: "9px 16px", fontWeight: 700,
        background: tab === id ? "var(--accent)" : "var(--surface)",
        color: tab === id ? "var(--accent-ink)" : "var(--ink-2)",
      }}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div style={{ display: "inline-flex", border: "1px solid var(--line-2)", borderRadius: "var(--radius)", overflow: "hidden", marginBottom: 16 }}>
        <TabBtn id="manager" label="🧑‍💼 경영지원매니저" />
        <TabBtn id="designer" label="🎨 디자이너" />
      </div>

      {tab === "manager"
        ? <ManagerLogClient logs={manager.logs} incentives={manager.incentives} dbReady={manager.dbReady} today={today} />
        : <DesignerLogClient logs={designer.logs} users={designer.users} today={today} dbReady={designer.dbReady} />}
    </div>
  );
}
