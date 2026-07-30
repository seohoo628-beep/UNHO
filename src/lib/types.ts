// DB 행 타입. Supabase 스키마와 1:1로 맞춘다.

export type AppRole = "owner" | "staff" | "ai";

export type Corporation = {
  id: string;
  name: string;
  kind: "own" | "partner" | "affiliate";
  entity_type: "own" | "partner";
  business_no: string | null;
  founded: string | null;
  ceo: string | null;
  address: string | null;
  confirmed: string;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type Brand = {
  id: string;
  corporation_id: string;
  name: string;
  slug: string;
  category: string | null;
  flagship: string | null;
  channel: string | null;
  regulation: string | null;
  op_status: string | null;
  confirmed: string;
  note: string | null;
  ai_enabled: boolean;
  vi_primary: string | null;
  vi_secondary: string | null;
  vi_accent: string | null;
  vi_bg: string | null;
  font_ko: string;
  font_en: string;
  tone: string | null;
  vi_confirmed: "제안" | "확정";
  created_at: string;
  updated_at: string;
};

export type AppUser = {
  id: string;
  auth_id: string | null;
  email: string;
  name: string | null;
  role: AppRole;
  job_title: string | null;
  assigned_brand_ids: string[];
  active: boolean;
  created_at: string;
};

export type TaskStatus = "예정" | "진행" | "완료" | "지연" | "보류" | "취소";

export type Task = {
  id: string;
  brand_id: string | null;
  title: string;
  category: string | null;
  assignee_kind: "user" | "ai";
  assignee_user_id: string | null;
  ai_agent_type: string | null;
  status: TaskStatus;
  due_date: string | null;
  completed_date: string | null;
  wait_reason: string | null;
  wait_target: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ComplianceStatus = "pending" | "pass" | "fail";
export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "revision_requested";

export type AiOutput = {
  id: string;
  task_id: string | null;
  brand_id: string;
  agent_type: string;
  title: string | null;
  input_prompt: string | null;
  body: string | null;
  attachments: unknown[];
  compliance_status: ComplianceStatus;
  approval_status: ApprovalStatus;
  revision_note: string | null;
  model: string | null;
  created_at: string;
  updated_at: string;
};

export type ComplianceFinding = {
  phrase: string;
  reason: string;
  suggestion: string;
  rule: string;
};

export type ComplianceCheck = {
  id: string;
  ai_output_id: string;
  brand_id: string | null;
  regulation: string | null;
  verdict: "pass" | "fail";
  findings: ComplianceFinding[];
  checker: string;
  checked_at: string;
};

export type Approval = {
  id: string;
  ai_output_id: string;
  approver_user_id: string | null;
  decision: "approved" | "rejected" | "revision_requested";
  reason: string | null;
  decided_at: string;
};
