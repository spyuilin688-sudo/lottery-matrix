-- Roll back the Railway API consumer before dropping this RPC. This migration
-- added no data, indexes, table grants, triggers, or policies to restore.
drop function if exists public.matrix_draw_query(text, text, integer, jsonb, jsonb, text, integer);
