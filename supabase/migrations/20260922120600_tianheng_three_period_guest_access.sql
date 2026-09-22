-- Restore the approved baseline: Tianheng three-period standard-range reads mirror
-- Matrix Explore two-period guest access. The existing private implementation remains
-- authoritative and still rejects thirteen-period and full-range requests without entitlement.
begin;

grant execute on function public.matrix_tianheng_list(jsonb) to anon;
grant execute on function public.matrix_tianheng_validation(jsonb) to anon;

commit;
