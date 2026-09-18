begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $test$
declare
  v_period text := 'qa-recovery-' || gen_random_uuid()::text;
  v_result jsonb;
begin
  insert into public.matrix_analysis_runs(lottery,draw_period,analysis_version,phase,cursor,total,status,started_at,completed_at)
  values('六合彩',v_period,v_period || ':matrix-python-v12','complete',3,4,'complete',now(),now());
  v_result := public.matrix_analysis_acquire_run('六合彩',v_period,v_period || ':matrix-python-v12','qa-owner',now(),300);
  if v_result->>'status' <> 'running' or not (v_result->>'lease_acquired')::boolean
    or (v_result->>'cursor')::integer <> 0 or v_result->>'phase' <> 'explore' then
    raise exception 'MISSING_ARTIFACT_DID_NOT_RESTART';
  end if;
  v_result := public.matrix_analysis_acquire_run('六合彩',v_period,v_period || ':matrix-python-v12','qa-other-owner',now(),300);
  if (v_result->>'lease_acquired')::boolean then raise exception 'CONCURRENT_OWNER_ACQUIRED'; end if;
  insert into public.matrix_analysis_artifacts(lottery,draw_period,analysis_version,kind,payload,completed_at,expires_at)
  values('六合彩',v_period,v_period || ':matrix-python-v12','explore','{"items":[]}',now(),now()+interval '3 days');
  update public.matrix_analysis_runs set status='complete',phase='complete',completed_at=now(),lease_owner=null,lease_expires_at=null
    where lottery='六合彩' and draw_period=v_period;
  v_result := public.matrix_analysis_acquire_run('六合彩',v_period,v_period || ':matrix-python-v12','qa-owner',now(),300);
  if v_result->>'status' <> 'complete' or (v_result->>'lease_acquired')::boolean then
    raise exception 'VALID_EMPTY_ARTIFACT_RESTARTED';
  end if;
end;
$test$;
rollback;
