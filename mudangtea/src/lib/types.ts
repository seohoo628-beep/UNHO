// 운호 플랫폼과 같은 users 표를 쓴다(같은 Supabase 프로젝트).
export type AppRole = "owner" | "staff" | "ai" | "vendor" | "guest";

export type AppUser = {
  id: string;
  auth_id: string | null;
  email: string;
  name: string | null;
  role: AppRole;
  job_title: string | null;
  can_finance?: boolean | null;
  active: boolean;
};
