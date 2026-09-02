-- Remove legacy Matrix Explore outputs after the canonical v12 cutover.
-- Shared run records, lottery history, Tianyan, Tiangong, and Status remain intact.
begin;

delete from public.matrix_explore_results
where analysis_version !~ ':matrix-python-v12$';

delete from public.matrix_analysis_artifact_chunks
where kind = 'explore'
  and analysis_version !~ ':matrix-python-v12$';

delete from public.matrix_analysis_artifacts
where kind = 'explore'
  and analysis_version !~ ':matrix-python-v12$';

commit;
