begin;

-- A lightweight version for the public result shared by Railway and Status.
-- Draw corrections, result/artifact/card writes and active-order switches
-- change this value. Calendar eligibility is deliberately read separately.
create function public.matrix_public_result_revision()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select pg_catalog.jsonb_object_agg(lottery_name.lottery,
    pg_catalog.jsonb_build_object(
      'drawRevision', coalesce(draw_state.revision, ''),
      'generation', coalesce(completion.generation, 0),
      'activeVersions', coalesce((
        select pg_catalog.jsonb_object_agg(active.number_order,
          pg_catalog.jsonb_build_array(active.analysis_version, active.activated_at))
        from private.matrix_analysis_active_versions active
        where active.lottery = lottery_name.lottery
          and active.draw_period = (
            select draw.period from public.lottery_draws draw
            where draw.lottery = lottery_name.lottery
            order by draw.draw_date desc nulls last, draw.period desc limit 1
          )
      ), '{}'::jsonb)
    ))
  from (values ('今彩539'), ('天天樂'), ('大樂透'), ('六合彩')) lottery_name(lottery)
  left join private.matrix_draw_read_state draw_state
    on draw_state.lottery = lottery_name.lottery
  left join private.matrix_worker_completion completion
    on completion.lottery = lottery_name.lottery;
$$;

revoke all on function public.matrix_public_result_revision()
  from public, anon, authenticated;
grant execute on function public.matrix_public_result_revision() to service_role;

commit;
