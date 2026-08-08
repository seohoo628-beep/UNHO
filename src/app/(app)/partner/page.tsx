import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DbSetupNotice } from "@/components/DbSetupNotice";
import PartnerBoard, { type PartnerPost } from "@/components/PartnerBoard";

export const dynamic = "force-dynamic";

const SETUP_SQL = `create table if not exists public.partner_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null, body text, link text,
  files jsonb not null default '[]'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.partner_posts enable row level security;
drop policy if exists partner_posts_select on public.partner_posts;
create policy partner_posts_select on public.partner_posts for select to authenticated
  using (public.current_app_role() in ('owner','staff','guest'));
drop policy if exists partner_posts_write on public.partner_posts;
create policy partner_posts_write on public.partner_posts for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));`;

export default async function PartnerPage() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");
  const supabase = createSupabaseServerClient();

  const res = await supabase
    .from("partner_posts")
    .select("id, title, body, link, files, created_at, users:created_by(name)")
    .order("created_at", { ascending: false })
    .limit(200);

  if (res.error && (res.error.code === "42P01" || /partner_posts/.test(res.error.message ?? ""))) {
    return (
      <div>
        <div className="page-head"><h1>파트너 협업</h1></div>
        <DbSetupNotice title="파트너 협업" sql={SETUP_SQL} />
      </div>
    );
  }

  const posts: PartnerPost[] = ((res.data ?? []) as unknown as {
    id: string; title: string; body: string | null; link: string | null;
    files: { url: string; name: string }[] | null; created_at: string; users: { name: string } | null;
  }[]).map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    link: r.link,
    files: r.files,
    authorName: r.users?.name ?? null,
    createdAt: r.created_at,
  }));

  const canEdit = user.role === "owner" || user.role === "staff";

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>파트너 협업</h1>
          <p>협업 파트너와 공유하는 자료·링크·메모 공간. 파트너(게스트)는 이 폴더와 제품 이미지·영상 자료만 볼 수 있다.</p>
        </div>
      </div>
      <PartnerBoard posts={posts} canEdit={canEdit} />
    </div>
  );
}
