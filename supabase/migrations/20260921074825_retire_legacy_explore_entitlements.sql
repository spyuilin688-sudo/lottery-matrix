-- Retire the legacy public Explore entitlement resolver.
-- Canonical runtime entitlement decisions are owned by private.matrix_result_entitlements().
-- The legacy function has no database dependents and no anon/authenticated EXECUTE grants.
drop function if exists public.matrix_explore_entitlements();
