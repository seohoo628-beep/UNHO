// DB 행 타입. Supabase 스키마와 1:1로 맞춘다.

export type AppRole = "owner" | "staff" | "ai" | "vendor" | "guest";

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
  vendor_id: string | null;
  partner_id: string | null;
  active: boolean;
  created_at: string;
};

export type Vendor = {
  id: string;
  code: string | null;
  name: string;
  kind: string | null;
  brand_id: string | null;
  brand_name: string | null;
  business_no: string | null;
  ceo: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  payment_terms: string | null;
  payment_day: string | null;
  account: string | null;
  lead_time_days: number | null;
  moq: number | null;
  contract_status: string | null;
  contract_expiry: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type PurchaseOrder = {
  id: string;
  po_number: string | null;
  po_date: string | null;
  vendor_id: string | null;
  brand_id: string | null;
  item: string | null;
  order_qty: number | null;
  unit_price: number | null;
  order_amount: number | null;
  receipt_date: string | null;
  receipt_qty: number | null;
  lot_no: string | null;
  expiry_date: string | null;
  tax_invoice: string | null;
  invoice_amount: number | null;
  payment_date: string | null;
  payment_amount: number | null;
  status: string;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type InventoryItem = {
  id: string;
  item: string;
  brand_id: string | null;
  vendor_id: string | null;
  current_stock: number | null;
  out_30d: number | null;
  safety_days: number;
  lead_time_days: number | null;
  production_date: string | null;
  expiry_date: string | null;
  note: string | null;
  updated_at: string;
};

export type InventoryMovement = {
  id: string;
  item_id: string | null;
  kind: "in" | "out" | "adjust";
  qty: number;
  balance: number | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

export type ProductDevStage =
  | "아이디어"
  | "기획"
  | "샘플"
  | "검토"
  | "양산"
  | "출시"
  | "보류";

export type ProductDevelopment = {
  id: string;
  name: string;
  brand_id: string | null;
  category: string | null;
  stage: ProductDevStage;
  target_date: string | null;
  cost_estimate: number | null;
  vendor_id: string | null;
  link: string | null;
  files: { url: string; name: string }[] | null;
  note: string | null;
  owner_user_id: string | null;
  launched_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type LeadStage = "발굴" | "제안" | "회신" | "협의" | "성사" | "실패" | "보류";

export type Lead = {
  id: string;
  kind: "seller" | "buyer";
  name: string;
  brand_id: string | null;
  handle: string | null;
  contact: string | null;
  product: string | null;
  stage: LeadStage;
  result: "won" | "lost" | null;
  source: string | null;
  owner_user_id: string | null;
  proposed_at: string | null;
  replied_at: string | null;
  closed_at: string | null;
  next_follow_up: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type Performance = {
  id: string;
  ai_output_id: string | null;
  brand_id: string | null;
  channel: string | null;
  reach: number | null;
  conversions: number | null;
  revenue: number | null;
  recorded_at: string;
  note: string | null;
  created_at: string;
};

export type TaskStatus = "예정" | "진행" | "완료" | "지연" | "보류" | "취소";

export type Task = {
  id: string;
  brand_id: string | null;
  title: string;
  category: string | null;
  assignee_kind: "user" | "ai" | "vendor";
  assignee_user_id: string | null;
  assignee_vendor_id: string | null;
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
