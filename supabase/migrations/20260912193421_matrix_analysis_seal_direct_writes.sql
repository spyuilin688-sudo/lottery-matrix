-- Rollout 3/3: apply ONLY after matrix_analysis_owned_writes is available,
-- the API and all analysis workers use it, and legacy processes have drained.
-- This closes the direct-upsert bypass without changing reads or retained data.
-- Rollback must keep workers using the owned RPC; do not restore an unsafe writer.
begin;

revoke insert, update on table
  public.matrix_analysis_artifacts,
  public.matrix_analysis_artifact_chunks,
  public.matrix_explore_results,
  public.matrix_tianheng_results
from public, anon, authenticated, service_role;

commit;
