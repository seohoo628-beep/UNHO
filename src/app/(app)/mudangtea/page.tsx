import { redirect } from "next/navigation";
import { requireAppUser } from "@/lib/auth";
import { canViewFinance } from "@/lib/finance";

export const dynamic = "force-dynamic";

// 무당티 유통 관리는 독립 사이트(저장소 mudangtea/)로 분리했다. 같은 Supabase 표(mdt_*)를 쓴다.
// 사이드바 링크는 유지하고, 여기서 분리된 사이트 주소(MUDANGTEA_URL)로 보낸다.
export default async function Page() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");
  if (!canViewFinance(user)) redirect("/hub");

  const url = process.env.MUDANGTEA_URL;
  if (url) redirect(url);

  return (
    <div className="card" style={{ padding: 22, maxWidth: 640 }}>
      <h2 style={{ marginTop: 0 }}>무당티 유통 관리 — 별도 사이트로 이전</h2>
      <p style={{ color: "var(--ink-2)", fontSize: 14, lineHeight: 1.6, marginBottom: 0 }}>
        무당티 유통 관리는 독립 사이트로 분리되었습니다. 배포 후 Vercel 환경변수 <b>MUDANGTEA_URL</b>에
        사이트 주소를 넣으면 이 메뉴에서 바로 이동합니다. 데이터는 그대로 유지됩니다.
      </p>
    </div>
  );
}
