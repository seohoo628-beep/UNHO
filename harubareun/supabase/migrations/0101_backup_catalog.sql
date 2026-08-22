-- ============================================================================
-- 0101 — 백업 카탈로그 RPC
--   전체 되돌리기가 백업할 테이블을 DB에서 직접 열거한다(수동 목록 노화 방지).
--   각 테이블의 PK 컬럼과 users 참조 FK 컬럼도 함께 반환해
--   upsert 충돌키·삭제 비교키·FK 정리를 자동화한다.
-- ============================================================================

create or replace function public.backup_catalog()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(t order by t->>'table'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'table', c.relname,
      'pk', coalesce((
        select jsonb_agg(a.attname order by k.ord)
        from pg_index i
        join lateral unnest(i.indkey) with ordinality as k(attnum, ord) on true
        join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum
        where i.indrelid = c.oid and i.indisprimary
      ), '[]'::jsonb),
      'user_fks', coalesce((
        select jsonb_agg(distinct a.attname)
        from pg_constraint fk
        join lateral unnest(fk.conkey) as ck(attnum) on true
        join pg_attribute a on a.attrelid = c.oid and a.attnum = ck.attnum
        where fk.conrelid = c.oid
          and fk.contype = 'f'
          and fk.confrelid = 'public.users'::regclass
      ), '[]'::jsonb)
    ) as t
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      -- 기준 데이터·백업 자신·감사 로그는 제외
      and c.relname not in ('users', 'brands', 'platform_backups', 'audit_logs', 'uno_state')
  ) s;
$$;

revoke all on function public.backup_catalog() from public, anon, authenticated;
grant execute on function public.backup_catalog() to service_role;
