insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'matrix-cards',
  'matrix-cards',
  true,
  1048576,
  array['image/svg+xml']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.matrix_card_publications (
  lottery text primary key
    check (lottery in ('今彩539', '天天樂', '六合彩', '大樂透')),
  period text not null,
  draw_path text not null,
  sorted_path text not null,
  published_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.matrix_card_publications enable row level security;

revoke all on table public.matrix_card_publications from public, anon, authenticated;
grant select, insert, update, delete on table public.matrix_card_publications to service_role;

create or replace function public.publish_matrix_card(
  p_lottery text,
  p_period text,
  p_draw_path text,
  p_sorted_path text,
  p_published_at timestamptz
)
returns public.matrix_card_publications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_latest_period text;
  v_publication public.matrix_card_publications;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_lottery, 0)
  );

  select period
    into v_latest_period
    from public.lottery_draws
   where lottery = p_lottery
   order by draw_date desc nulls last, period desc
   limit 1;

  if v_latest_period is distinct from p_period then
    raise exception using
      errcode = 'P0001',
      message = 'MATRIX_CARD_PERIOD_STALE';
  end if;

  insert into public.matrix_card_publications (
    lottery,
    period,
    draw_path,
    sorted_path,
    published_at,
    updated_at
  )
  values (
    p_lottery,
    p_period,
    p_draw_path,
    p_sorted_path,
    p_published_at,
    p_published_at
  )
  on conflict (lottery) do update
  set period = excluded.period,
      draw_path = excluded.draw_path,
      sorted_path = excluded.sorted_path,
      published_at = excluded.published_at,
      updated_at = excluded.updated_at
  returning * into v_publication;

  return v_publication;
end;
$$;

revoke all on function public.publish_matrix_card(text, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.publish_matrix_card(text, text, text, text, timestamptz)
  to service_role;
