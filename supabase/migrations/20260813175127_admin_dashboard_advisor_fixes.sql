begin;

drop index if exists public.activation_codes_batch_id_idx;

create index activation_codes_batch_duration_idx
  on public.activation_codes (batch_id, duration_type);

drop policy if exists "Admins can read members" on public.members;
drop policy if exists "Members can read their own record" on public.members;

create policy "Admins or members can read members"
  on public.members
  for select
  to authenticated
  using (
    (select public.is_admin())
    or (
      (select auth.uid()) is not null
      and auth_user_id = (select auth.uid())
    )
  );

commit;
