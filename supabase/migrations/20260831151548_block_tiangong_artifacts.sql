ALTER TABLE public.matrix_analysis_artifact_chunks
  ADD CONSTRAINT matrix_analysis_artifact_chunks_no_tiangong
  CHECK (kind <> 'tiangong') NOT VALID;
ALTER TABLE public.matrix_analysis_artifacts
  ADD CONSTRAINT matrix_analysis_artifacts_no_tiangong
  CHECK (kind <> 'tiangong') NOT VALID;
DELETE FROM public.matrix_analysis_artifact_chunks
  WHERE kind = 'tiangong';
DELETE FROM public.matrix_analysis_artifacts
  WHERE kind = 'tiangong';
ALTER TABLE public.matrix_analysis_artifact_chunks
  VALIDATE CONSTRAINT matrix_analysis_artifact_chunks_no_tiangong;
ALTER TABLE public.matrix_analysis_artifacts
  VALIDATE CONSTRAINT matrix_analysis_artifacts_no_tiangong;