// AI 직원 성적표: 최근 30일 정기업무 실행·검토 결과를 직원별로 집계한다. 순수 함수.

export type ScoreRow = {
  assignee_user_id: string | null;
  routine_id: string | null;
  agent_status: string | null;
  agent_review?: string | null;
  agent_reject_count?: number | null;
};

export type AgentScore = {
  userId: string;
  name: string;
  runs: number; // 실행 완료
  failed: number; // 현재 실패 상태
  approved: number;
  rejected: number; // 반려 누적
  approvalRate: number | null; // 승인 / (승인 + 반려), 검토 0건이면 null
  advice: string | null;
};

export function buildScorecard(rows: ScoreRow[], agents: { id: string; name: string }[]): AgentScore[] {
  return agents
    .map((a) => {
      const mine = rows.filter((r) => r.assignee_user_id === a.id && r.routine_id);
      const runs = mine.filter((r) => r.agent_status === "완료").length;
      const failed = mine.filter((r) => r.agent_status === "실패").length;
      const approved = mine.filter((r) => r.agent_review === "승인").length;
      const rejected = mine.reduce((n, r) => n + (r.agent_reject_count ?? 0), 0);
      const reviewed = approved + rejected;
      const approvalRate = reviewed ? Math.round((approved / reviewed) * 100) : null;
      let advice: string | null = null;
      if (failed >= 3) advice = "실패가 잦습니다. 참고 데이터 연결이나 AI 키를 확인하세요.";
      else if (reviewed >= 3 && approvalRate !== null && approvalRate < 50) advice = "반려가 절반 이상입니다. 지시문을 고치거나 주 1회로 줄이는 것을 검토하세요.";
      else if (runs >= 10 && reviewed === 0) advice = "결과를 아무도 검토하지 않습니다. 쓸모가 없다면 주 1회로 줄이세요.";
      return { userId: a.id, name: a.name, runs, failed, approved, rejected, approvalRate, advice };
    })
    .sort((x, y) => y.runs - x.runs || x.name.localeCompare(y.name));
}
