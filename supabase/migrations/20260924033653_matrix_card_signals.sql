-- Expose only the four public card versions to anonymous Realtime readers.
-- The complete publication manifest and its lease remain service-only.
begin;
set local lock_timeout = '5s';

create table public.matrix_card_signals (
  lottery text primary key check (lottery in ('今彩539', '天天樂', '六合彩', '大樂透')),
  generation text check (generation ~ '^[0-9a-f]{64}$'),
  orders text[] not null default '{}'::text[],
  revision bigint not null default 0 check (revision >= 0),
  check (orders <@ array['sorted', 'draw']::text[])
);
alter table public.matrix_card_signals enable row level security;
revoke all on public.matrix_card_signals from public, anon, authenticated;
grant select on public.matrix_card_signals to anon, authenticated;
create policy matrix_card_signals_read on public.matrix_card_signals
  for select to anon, authenticated using (true);

-- Pre-create all rows, so the first card publication produces an UPDATE as well.
-- Existing manifests establish the initial state without generating a change event.
insert into public.matrix_card_signals (lottery, generation, orders)
select lottery_name.lottery, published.manifest->>'generation',
  array(
    select card_order from pg_catalog.unnest(array['sorted', 'draw']::text[]) as candidate(card_order)
    where published.manifest->'cards' ? card_order
  )
from (values ('今彩539'), ('天天樂'), ('六合彩'), ('大樂透')) as lottery_name(lottery)
left join public.matrix_card_publications as published on published.lottery = lottery_name.lottery;

create function private.matrix_card_publication_signal() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.manifest is distinct from new.manifest then
    update public.matrix_card_signals
    set generation = new.manifest->>'generation',
        orders = array(
          select card_order from pg_catalog.unnest(array['sorted', 'draw']::text[]) as candidate(card_order)
          where new.manifest->'cards' ? card_order
        ),
        revision = revision + 1
    where lottery = new.lottery;
  else
    -- The draw changed and the old manifest remains stored until a new PNG is
    -- ready. Tell mounted readers to revalidate and hide that old image.
    update public.matrix_card_signals
    set generation = null, orders = '{}'::text[], revision = revision + 1
    where lottery = new.lottery;
  end if;
  return new;
end;
$$;
revoke all on function private.matrix_card_publication_signal()
  from public, anon, authenticated, service_role;
create trigger matrix_card_publication_signal
  after update of manifest, desired_digest on public.matrix_card_publications
  for each row when (old.manifest is distinct from new.manifest
    or (old.desired_digest is not null and new.desired_digest is null))
  execute function private.matrix_card_publication_signal();

alter publication supabase_realtime add table public.matrix_card_signals;
commit;
