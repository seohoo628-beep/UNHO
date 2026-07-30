/**
 * users 시드(선택). SQL 마이그레이션(0003)로도 동일하게 시드되지만,
 * 실제 이메일을 환경변수로 넣어 등록하고 싶을 때 사용한다.
 *
 *   OWNER_EMAIL=... STAFF1_EMAIL=... STAFF2_EMAIL=... AI_EMAIL=... \
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   npm run seed:users
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const users = [
  { email: process.env.OWNER_EMAIL || "choi@unhocompany.com", name: "최운호", role: "owner", job_title: "대표" },
  { email: process.env.STAFF1_EMAIL || "lee@unhocompany.com", name: "이아라", role: "staff", job_title: "경영지원" },
  { email: process.env.STAFF2_EMAIL || "park@unhocompany.com", name: "박상민", role: "staff", job_title: "영업이사" },
  { email: process.env.AI_EMAIL || "ai@unhocompany.com", name: "AI 직원", role: "ai", job_title: "AI 에이전트" },
].map((u) => ({ ...u, email: u.email.toLowerCase() }));

async function main() {
  const { error } = await supabase
    .from("users")
    .upsert(users, { onConflict: "email" });
  if (error) {
    console.error("시드 실패:", error.message);
    process.exit(1);
  }
  console.log(`users ${users.length}건 upsert 완료`);
}

main();
