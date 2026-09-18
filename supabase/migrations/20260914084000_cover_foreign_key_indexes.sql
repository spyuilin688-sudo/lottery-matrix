-- Cover foreign-key columns used by joins and parent-row updates/deletes.
-- These indexes do not change table data, RLS, grants, or RPC behavior.
create index if not exists matrix_analysis_active_versions_draw_version_fkey_idx
  on private.matrix_analysis_active_versions (lottery, draw_period, analysis_version);

create index if not exists native_push_deliveries_installation_id_idx
  on private.native_push_deliveries (installation_id);

create index if not exists activation_code_batches_requested_by_idx
  on public.activation_code_batches (requested_by);
