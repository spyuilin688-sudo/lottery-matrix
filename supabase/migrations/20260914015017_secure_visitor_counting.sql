create table if not exists private.matrix_visitor_secret (
  singleton boolean primary key default true check (singleton),
  secret text not null,
  created_at timestamptz not null default pg_catalog.now()
);

alter table private.matrix_visitor_secret enable row level security;
revoke all on table private.matrix_visitor_secret from public, anon, authenticated, service_role;

insert into private.matrix_visitor_secret (singleton, secret)
values (
  true,
  pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '')
    || pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '')
)
on conflict (singleton) do nothing;

create or replace function public.record_matrix_visit_edge(p_source text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
  v_visitor_hash text;
begin
  if p_source is null or pg_catalog.length(p_source) not between 3 and 128 then
    raise exception using errcode = '22023', message = 'INVALID_VISITOR_SOURCE';
  end if;

  select secret into v_secret
  from private.matrix_visitor_secret
  where singleton;

  if v_secret is null then
    raise exception using errcode = '55000', message = 'VISITOR_SECRET_MISSING';
  end if;

  v_visitor_hash := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(v_secret || p_source, 'UTF8')),
    'hex'
  );
  perform private.record_matrix_visit(v_visitor_hash, null);
end;
$$;

revoke all on function public.record_matrix_visit_edge(text) from public, anon, authenticated, service_role;
grant execute on function public.record_matrix_visit_edge(text) to service_role;

revoke all on function public.record_matrix_visit(text) from public, anon, authenticated;

comment on function public.record_matrix_visit_edge(text) is
  'Edge-only visitor counting entry point. Hashes the server-derived source before storage.';
