import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { DbSetupNotice } from "@/components/DbSetupNotice";
import PartnerBoard, { type PartnerPost, type Company } from "@/components/PartnerBoard";
import PartnerAdmin, { type GuestRow } from "@/components/PartnerAdmin";

export const dynamic = "force-dynamic";

const SETUP_SQL = `-- 협업 게시판 + 파트너 회사(방) 분리는 마이그레이션 0049, 0050 참고`;

export default async function PartnerPage({ searchParams }: { searchParams: { c?: string } }) {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");
  const isStaff = user.role === "owner" || user.role === "staff";
  const isGuest = user.role === "guest";
  const supabase = createSupabaseServerClient();

  // 회사 목록(방)
  const { data: compRaw } = await supabase.from("partner_companies").select("id, name").order("name");
  const companies = (compRaw ?? []) as Company[];

  // 게시물(RLS로 게스트는 자기 회사만). 직원이 회사 선택 시 그 회사로 필터.
  const selectedCompanyId = isStaff ? searchParams.c : undefined;
  let q = supabase
    .from("partner_posts")
    .select("id, title, body, link, files, partner_id, created_at, created_by, users:created_by(name)")
    .order("created_at", { ascending: false })
    .limit(300);
  if (selectedCompanyId) q = q.eq("partner_id", selectedCompanyId);
  const res = await q;

  if (res.error && (res.error.code === "42P01" || /partner_posts/.test(res.error.message ?? ""))) {
    return (
      <div>
        <div className="page-head"><h1>파트너 협업</h1></div>
        <DbSetupNotice title="파트너 협업" sql={SETUP_SQL} />
      </div>
    );
  }

  const rawPosts = (res.data ?? []) as unknown as {
    id: string; title: string; body: string | null; link: string | null;
    files: { url: string; name: string }[] | null; partner_id: string | null; created_at: string; created_by: string | null; users: { name: string } | null;
  }[];

  // 게시물별 댓글 수(테이블 없으면 0).
  const commentCount = new Map<string, number>();
  const postIds = rawPosts.map((r) => r.id);
  if (postIds.length) {
    const { data: cc } = await supabase.from("partner_post_comments").select("post_id").in("post_id", postIds);
    for (const c of (cc ?? []) as { post_id: string }[]) commentCount.set(c.post_id, (commentCount.get(c.post_id) ?? 0) + 1);
  }

  const posts: PartnerPost[] = rawPosts.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    link: r.link,
    files: r.files,
    partnerId: r.partner_id ?? null,
    authorId: r.created_by,
    authorName: r.users?.name ?? null,
    createdAt: r.created_at,
    commentCount: commentCount.get(r.id) ?? 0,
  }));

  // 게스트 본인 회사명
  const myPartnerName = isGuest ? companies.find((c) => c.id === user.partner_id)?.name ?? null : null;

  // 관리용 게스트 목록(대표·직원만)
  let guests: GuestRow[] = [];
  if (isStaff) {
    try {
      const svc = createSupabaseServiceClient();
      const { data } = await svc.from("users").select("id, name, email, partner_id").eq("role", "guest").order("name");
      guests = ((data ?? []) as { id: string; name: string | null; email: string | null; partner_id: string | null }[]).map((g) => ({
        id: g.id, name: g.name, email: g.email, partnerId: g.partner_id,
      }));
    } catch {
      /* ignore */
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>파트너 협업</h1>
          <p>협업 파트너와 자료·링크·메모를 주고받는 공간. 회사(방)별로 분리되어 다른 파트너끼리는 서로 볼 수 없다.</p>
        </div>
      </div>
      <PartnerBoard
        posts={posts}
        canModerate={isStaff}
        myId={user.id}
        isGuest={isGuest}
        companies={companies}
        selectedCompanyId={selectedCompanyId}
        myPartnerName={myPartnerName}
      />
      {isStaff && <PartnerAdmin companies={companies} guests={guests} />}
    </div>
  );
}
