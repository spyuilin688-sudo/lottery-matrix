create table public.matrix_custom_status_configs (
  member_id uuid not null references public.members (id) on delete cascade,
  lottery text not null check (lottery = any (array['今彩539'::text, '天天樂'::text, '六合彩'::text, '大樂透'::text])),
  status text not null check (status = any (array['ACTIVE'::text, 'FOCUS'::text, 'RESONANCE'::text, 'CRITICAL'::text])),
  config jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (member_id, lottery, status),
  constraint matrix_custom_status_configs_config_shape_check check (
    jsonb_typeof(config) = 'object'
    and config ->> 'lottery' = lottery
    and config ->> 'status' = status
    and config ->> 'explorePeriods' = '13'
    and config ->> 'exploreRange' = '完整範圍'
    and jsonb_typeof(config -> 'oneCodeGroups') = 'array'
    and jsonb_array_length(config -> 'oneCodeGroups') <= 20
    and jsonb_typeof(config -> 'twoCodeGroups') = 'array'
    and jsonb_array_length(config -> 'twoCodeGroups') <= 20
  )
);

alter table public.matrix_custom_status_configs enable row level security;

create policy "Members can read own Matrix custom status configs"
  on public.matrix_custom_status_configs
  for select
  to authenticated
  using (
    member_id in (
      select member.id
      from public.members as member
      where member.auth_user_id = (select auth.uid())
    )
  );

create policy "Members can insert own Matrix custom status configs"
  on public.matrix_custom_status_configs
  for insert
  to authenticated
  with check (
    member_id in (
      select member.id
      from public.members as member
      where member.auth_user_id = (select auth.uid())
    )
  );

create policy "Members can update own Matrix custom status configs"
  on public.matrix_custom_status_configs
  for update
  to authenticated
  using (
    member_id in (
      select member.id
      from public.members as member
      where member.auth_user_id = (select auth.uid())
    )
  )
  with check (
    member_id in (
      select member.id
      from public.members as member
      where member.auth_user_id = (select auth.uid())
    )
  );

create policy "Members can delete own Matrix custom status configs"
  on public.matrix_custom_status_configs
  for delete
  to authenticated
  using (
    member_id in (
      select member.id
      from public.members as member
      where member.auth_user_id = (select auth.uid())
    )
  );

revoke all on table public.matrix_custom_status_configs from public, anon, authenticated;
grant select, insert, update, delete on table public.matrix_custom_status_configs to authenticated;
