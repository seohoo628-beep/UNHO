"use client";

import { useState } from "react";
import ManagerLogClient, { type Log, type Incentive } from "../manager-log/ManagerLogClient";
import DesignerLogClient, { type DesignerLog } from "../designer-log/DesignerLogClient";

// 역할별 업무일지 탭. 매니저는 별도 테이블(manager_logs), 나머지는 designer_logs를
// role 값으로 구분해 공유한다.
const ROLE_TABS: { id: string; label: string }[] = [
  { id: "manager", label: "🧑‍💼 경영지원매니저" },
  { id: "디자이너", label: "🎨 디자이너" },
  { id: "MD", label: "🛒 MD" },
  { id: "BM", label: "📈 BM" },
  { id: "PD", label: "🎬 PD" },
  { id: "마케터", label: "📣 마케터" },
  { id: "총괄이사", label: "👔 총괄이사" },
  { id: "대표이사", label: "🏢 대표이사" },
];

export default function WorkLogsTabs({
  today,
  manager,
  designer,
}: {
  today: string;
  manager: { logs: Log[]; incentives: Incentive[]; dbReady: boolean };
  designer: { logs: DesignerLog[]; users: { id: string; name: string }[]; dbReady: boolean };
}) {
  const [tab, setTab] = useState<string>("manager");

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
        {ROLE_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="btn"
            style={{ padding: "8px 14px", fontWeight: 700, background: tab === t.id ? "var(--accent)" : "var(--surface)", color: tab === t.id ? "var(--accent-ink)" : "var(--ink-2)", borderColor: tab === t.id ? "var(--accent)" : "var(--line-2)" }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "manager"
        ? <ManagerLogClient logs={manager.logs} incentives={manager.incentives} dbReady={manager.dbReady} today={today} />
        : <DesignerLogClient
            key={tab}
            logs={designer.logs}
            users={designer.users}
            today={today}
            dbReady={designer.dbReady}
            role={tab}
            roleLabel={ROLE_TABS.find((r) => r.id === tab)?.label.replace(/^\S+\s/, "") ?? tab}
          />}
    </div>
  );
}
