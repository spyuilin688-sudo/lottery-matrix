# Database security audit — 2026-09-14

Project: `wcimzbbapfrdotjsfyxa`. Source baseline: GitHub main `28fbac6e1d1340f9e47f4ffcdcb446e8e0bb8c18`; local source text was SHA-verified by the coordinating agent. Scope: requested database-security items 1–4. This report distinguishes live catalog/body evidence, read-only executions, and unavailable configuration evidence.

## Result and applied change

Applied `supabase/migrations/20260914141705_database_security_boundaries.sql` at 2026-09-14 14:17 UTC after coordinator review under existing user authorization. The CLI initially generated version `20260914141455`; the local file was renamed to the actual applied version `20260914141705`. Only that applied-version migration should be committed.

| Finding | Before | After / decision | Evidence status |
|---|---|---|---|
| Stale browser grants on backend-only tables | 8 no-policy public tables retained client grants; 3 included TRUNCATE/REFERENCES/TRIGGER | Explicit revoke from PUBLIC, anon, authenticated; service grants retained | Confirmed live |
| Private tables missing RLS | admin_watchdog_runtime, line_pwa_handoff_diagnostics | RLS enabled; existing owner/RPC access preserved | Confirmed live |
| Missing primary key | private.security_identity_secret; exactly one row | Added boolean singleton PK + CHECK(singleton); exactly one row remains | Confirmed live |
| Client SECURITY DEFINER exposure | 5 anon, 31 authenticated, all owned by postgres with fixed empty search_path | Intentional endpoints retained after guard/ownership review and negative tests | Confirmed inventory; positive user workflows not executed |
| Leaked password protection | Actual Auth setting unavailable through installed connector | No claim of enabled/disabled; no Auth setting changed | Unverified / capability gap |

No lottery draws, draw dates, periods, lottery numbers, member/payment records or notification queues were edited by this migration. It contains ACL/RLS/constraint DDL only. Secret values were never selected or compared; the migration does not replace or rotate the existing secret. All verification transactions were read-only. No notification, job sender, or test member was created.

## Security interpretation

RLS with no policy defaults to denial for ordinary row operations; a missing policy is not itself public exposure. Owners and BYPASSRLS roles bypass it. TRUNCATE and REFERENCES are outside RLS, which is why the legacy grants warranted removal even though ordinary reads were already denied. The audit does not claim that PostgREST exposes a generic TRUNCATE endpoint. [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

All 52 application tables now have RLS and a primary key. The 48 policy-free tables intentionally use service access or narrowly scoped SECURITY DEFINER entry points. Adding permissive policies solely to clear the advisor would widen access. Four remaining tables have policies: private.admin_watchdog_status has service_role ALL; public.members has authenticated own-row SELECT; public.matrix_custom_status_configs has member-owned SELECT; public.member_push_subscriptions has user-owned SELECT. These policies were not changed. [Supabase RLS and grants](https://supabase.com/docs/guides/database/postgres/row-level-security).

Live role attributes: anon/authenticated have no BYPASSRLS and no superuser flag; postgres/service_role have BYPASSRLS and no superuser flag. Neither browser role has CREATE on public or USAGE/CREATE on private. The only public/private view is public.member_latest_connections, with security_invoker=true and no anon/authenticated SELECT.

## Verification performed

Only these explicitly named affected SQL files were executed through Supabase execute_sql (exact file contents; no full-project test command):

| File / check | Before migration | After migration |
|---|---|---|
| supabase/tests/database/database_security_boundaries.test.sql | Expected failure: `P0001 UNEXPECTED_BROWSER_TABLE_PRIVILEGE: anon.activation_code_batches` | Success, `isError=false`, result `[]`; verifies ACLs, all service CRUD privileges, RLS, singleton key/check/count, private-schema denial and anonymous RPC allowlist |
| supabase/tests/database/database_rpc_denials.test.sql | Success | Success; 25 authenticated RPC calls with missing identity rejected as 42501; native status returns disabled; four anonymous malformed calls rejected as 22023; public settings returns exactly four expected keys |
| supabase/tests/database/database_table_denials.test.sql | Not executed before ACL revocation | Success; all 16 anon/authenticated direct SELECT attempts against the eight affected tables denied; LIMIT 0 avoids fetching rows |
| Fresh application-table catalog | 52 tables; RLS disabled 2; PK missing 1; 8 no-policy tables with client ACLs | 52 tables; RLS disabled 0; PK missing 0; no-policy client ACLs 0 |
| Secret structure/cardinality | One row; no PK | One row; CHECK(singleton), PRIMARY KEY(singleton) |

These are database-role tests, not signed-in browser end-to-end tests. The RPC tests deliberately leave request.method empty and supply no identity, so they do not write rate-limit counters or exercise HTTP transport/rate-limit behavior. Positive operations for real members, suspended-member fixture mutations, valid push registration, payment/redeem side effects, and notification delivery were not executed. Ownership checks below are live function-body review backed by missing-identity denial tests; they are not a claim that every positive business path was exercised.

## Fresh advisors

Observed security 2026-09-14T14:17:20.860Z; performance 2026-09-14T14:17:20.910Z.

| Advisor | Count | Level | Disposition |
|---|---:|---|---|
| [RLS enabled, no policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) | 48 | INFO | Intentional denial/service-or-RPC model, mapped below. Count rose from 46 because two previously unprotected private tables now have RLS. |
| [Anonymous SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) | 5 | WARN | Intentional public result/settings APIs; guards and projection reviewed. |
| [Authenticated SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) | 31 | WARN | Intentional scoped APIs; ownership review below. |
| [Unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) | 40 | INFO | No index removed from usage counters alone. |
| [Auth connection allocation](https://supabase.com/docs/guides/deployment/going-into-prod) | 1 | INFO | Absolute maximum 10 Auth connections; capacity tuning outside this change. |

No missing-primary-key finding remains. No unsafe mutable-search-path finding was returned. The remaining warnings are documented residual architecture notices, not a zero-warning result.

## Auth password-protection limitation

The installed Supabase connector exposes no read/update Auth-configuration method. Actual leaked-password protection therefore remains unverified. Its absence from the returned security-advisor payload is not evidence that protection is enabled. Verification requires the project Auth configuration or the dashboard password-security setting through an authorized configuration surface; no credentials were searched for or extracted. [Supabase password security](https://supabase.com/docs/guides/auth/password-security).

The current Supabase changelog index was fetched and its relevant breaking-change entries reviewed before implementation; no change to ordinary PostgreSQL ACL/RLS/PK semantics affected this migration. [Supabase changelog](https://supabase.com/changelog).

## Every browser-callable function

All 31 functions below are public-schema SECURITY DEFINER functions owned by postgres and have `SET search_path TO ''`. EXECUTE granted to PUBLIC: none. “A+U” means anon and authenticated; “U” means authenticated only. Service EXECUTE varies independently and is recorded in the complete inventory. The eight Matrix result RPCs call private.matrix_request_guard, which restricts HTTP method, protects query rate, dispatches only known operations and delegates entitlement checks to private implementations.

| Function identity | Browser roles | Guard and ownership boundary |
|---|---|---|
| `public.matrix_custom_status_list()` | U | Requires auth.uid and its member; entitlements rejects suspended members; selects configs by derived member_id. |
| `public.matrix_custom_status_reset(p_lottery text, p_status text)` | U | Entitlements rejects suspended member; private implementation requires identity, derives member_id, deletes only that member/lottery/status. |
| `public.matrix_custom_status_save(p_config jsonb)` | U | Requires identity/member and canCustomizeStatus; normalizes config, derives member_id for upsert, never accepts a caller member ID. |
| `public.matrix_explore_list(p_request jsonb)` | A+U | Request guard -> explore implementation -> entitlements. Public 2-period standard access; 7/13/full range require corresponding entitlements; query scopes lottery, period, version, order and row range. |
| `public.matrix_explore_validation(p_request jsonb)` | A+U | Request guard and readable-version check; same period/range entitlement gates; item query repeats source-index and range constraints. |
| `public.matrix_permission_settings()` | A+U | Intentional public read. Returns exactly subscriptionPurchaseVisible, registeredMemberFreeAccess, revision, updatedAt from singleton settings; no member or secret fields. |
| `public.matrix_tiangong_list(p_request jsonb)` | U | Request guard -> implementation requires canUseTiangong IS TRUE before artifact access; validates search scope and completed version. |
| `public.matrix_tiangong_validation(p_request jsonb)` | U | Request guard -> implementation requires canUseTiangong IS TRUE; version and item validation before response. |
| `public.matrix_tianheng_list(p_request jsonb)` | A+U | Request guard -> implementation validates object/non-null fields; public 3-period standard access; 13/full range require entitlement; scope repeated in row query. |
| `public.matrix_tianheng_validation(p_request jsonb)` | A+U | Request guard -> readable version and entitlement gates; item scope includes source index, range and active order version. |
| `public.matrix_tianyan_list(p_request jsonb)` | U | Request guard -> entitlements rejects inactive member; requires canUseTianyan IS TRUE; artifact/search scope enforced. |
| `public.matrix_tianyan_validation(p_request jsonb)` | U | Request guard -> canUseTianyan gate; readable version and item active-order version checked. Current entitlement helper returns non-null booleans. |
| `public.member_bootstrap()` | U | bootstrap_member_allowed requires auth.uid and rejects suspended existing member; implementation derives LINE identity from auth.identities, rejects conflicting ownership and derives member account. |
| `public.member_line_pwa_diagnostics_submit(p_events jsonb)` | U | Requires auth.uid; bounded 1–40-event/24KiB allowlisted diagnostic payload; derives auth_user_id for unique-key upsert. Available before member bootstrap by design. |
| `public.member_native_push_disable(p_installation_id uuid)` | U | Current auth session checked against auth.sessions plus active member; update matches installation, auth_user_id, member_id and session_id. |
| `public.member_native_push_save(p_installation_id uuid, p_token text, p_platform text)` | U | Current session plus active member; validates registration; serializes transfer checks, rejects another live account/session binding; derives ownership fields. |
| `public.member_native_push_status(p_installation_id uuid)` | U | Current session plus active member; returns disabled/refreshable=false on missing session; both result predicates match installation/user/member/session. |
| `public.member_notification_settings_get()` | U | Active member guard; implementation derives member_id and reads only its settings; strips retired settings.win/selectedOptions.win fields. |
| `public.member_notification_settings_save(p_settings jsonb)` | U | Active member guard; implementation derives member_id, validates payload, strips retired win fields and upserts only that member. |
| `public.member_online_end(p_session_id uuid)` | U | Active member guard; implementation matches session_id AND derived member_id, locks row, computes duration server-side and updates only that member. |
| `public.member_online_start()` | U | Active member guard; implementation derives member_id and server time for session creation. |
| `public.member_payment_history_get()` | U | Requires auth.uid/member; query filters request.member_id to derived member_id. Own payment-history read has no active-plan gate. |
| `public.member_pending_transfer_request()` | U | Requires auth.uid/member; query matches derived member_id and pending status. Own pending-transfer read has no active-plan gate. |
| `public.member_profile()` | U | Active member guard; implementation derives member and returns profile plus server-computed entitlements. |
| `public.member_push_subscription_disable(p_endpoint text)` | U | Requires auth.uid; update matches user_id and endpoint. Allows signed-in owner to opt out without an active-plan gate. |
| `public.member_push_subscription_save(p_endpoint text, p_p256dh text, p_auth text)` | U | Requires auth.uid; endpoint allowlist; ownership transfer allowed only same user or matching endpoint encryption/auth keys; denied transfer raises INVALID_PUSH_SUBSCRIPTION. |
| `public.member_push_subscription_status(p_endpoint text)` | U | Requires auth.uid and nonempty endpoint; existence query matches user_id plus endpoint. |
| `public.member_referral_submit(p_referral_code text)` | U | Active member plus LINE identity; referral target validated; caller/target rows locked, rejects self/repeat/referral changes; writes invitation only for derived caller member. |
| `public.member_referral_summary()` | U | Active member plus LINE identity; returns own referral code and aggregate successful-referral count; no invited member identities returned. |
| `public.member_transfer_request_submit(p_plan_code text, p_account_last_five text)` | U | lock_active_member_id validates and locks caller member before private implementation; derives member, plan price, duration and time; pending unique-key guard. |
| `public.redeem_activation_code(p_code text)` | U | lock_active_member_id validates and locks caller member; private implementation derives member, locks activation code and server-side entitlement mutation. |

The entitlement helper uses server-owned members, plans, payments, expiry and private permission settings; no user_metadata authorization was found in the reviewed client-RPC call paths. Missing paid expiry fails closed. Registered-member free access applies to Seven/Thirteen/FullRange/Tianyan/Tiangong; it does not grant canCustomizeStatus. Bootstrapping derives LINE identity from auth.identities, not a user-editable profile claim. Native push additionally checks the JWT session against auth.sessions.

## Every policy-free table and intended access path

This covers the 46 original RLS/no-policy tables plus the two newly RLS-enabled tables. Each now has RLS=true, policies=0, owner=postgres and no anon/authenticated table grants. “Service” records direct service_role table access; “owner/RPC only” means even service_role has no direct table grants. Qualified function references were extracted from the live definitions and reviewed to identify owner-mediated access. Browser entry points in those chains are governed by the preceding table; internal implementations are not browser-callable. Public backend data access uses apps/admin/backend/supabase.ts with server-side service credentials.

| Table | Baseline client grants | Intended path after migration | Primary key |
|---|---|---|
| `private.admin_security_push_jobs` | None | Owner/RPC only; `private.security_cleanup` `private.security_collect` `public.admin_security_push_claim` `public.admin_security_push_eligible` `public.admin_security_push_finish` | `id` |
| `private.admin_watchdog_runtime` | None | Owner/RPC only; `public.admin_watchdog_cron_authorize` `public.claim_matrix_watchdog_lease` | `id` |
| `private.line_pwa_handoff_diagnostics` | None | Owner/RPC only; `public.admin_service_operation_evidence` `public.member_line_pwa_diagnostics_submit` | `id` |
| `private.matrix_analysis_active_versions` | None | Owner/RPC only; `private.matrix_analysis_active_version` `private.matrix_analysis_active_version_health` `private.matrix_analysis_cleanup_batch` `private.matrix_analysis_retained_versions` `private.matrix_analysis_superseded_versions` `public.matrix_analysis_complete_owned` `public.matrix_analysis_storage_health` | `lottery, draw_period, number_order` |
| `private.matrix_maintenance_status` | None | Owner/RPC only; `private.matrix_analysis_cleanup_batch` `public.matrix_analysis_cleanup_status` | `job_name` |
| `private.matrix_permission_settings` | None | Owner/RPC only; `private.matrix_result_entitlements` `public.admin_matrix_permission_settings_update` `public.admin_service_operation_evidence` `public.matrix_permission_settings` | `singleton` |
| `private.matrix_visitor_counts` | None | Owner/RPC only; `private.record_matrix_visit` `public.admin_visitor_stats` | `period_type, period_start` |
| `private.matrix_visitor_identifiers` | None | Owner/RPC only; `private.purge_matrix_visitor_identifiers` `private.record_matrix_visit` | `visitor_hash` |
| `private.matrix_visitor_secret` | None | Owner/RPC only; `public.record_matrix_visit_edge` | `singleton` |
| `private.native_push_deliveries` | None | Owner/RPC only; `public.admin_native_notification_health` `public.member_native_push_save` `public.native_notification_claim` `public.native_notification_finalize` `public.native_notification_prepare` | `id` |
| `private.native_push_devices` | None | Owner/RPC only; `private.native_push_eligible` `public.admin_native_notification_health` `public.member_native_push_disable` `public.member_native_push_save` `public.member_native_push_status` `public.native_notification_claim` `public.native_notification_finalize` `public.native_notification_prepare` | `installation_id` |
| `private.notification_draw_calendar_sync` | None | Owner/RPC only; `private.notification_is_draw_day` `public.notification_draw_calendar_acquire` `public.notification_draw_calendar_complete` `public.notification_draw_calendar_fail` `public.notification_draw_calendar_status` | `lottery` |
| `private.notification_draw_day_overrides` | None | Owner/RPC only; `private.notification_is_draw_day` `public.notification_draw_calendar_complete` `public.notification_draw_calendar_status` | `lottery, draw_date` |
| `private.security_counters` | None | Owner/RPC only; `private.security_cleanup` `private.security_collect` | `category, slot` |
| `private.security_events` | None | Owner/RPC only; `private.security_cleanup` `private.security_collect` `public.admin_security_push_claim` | `category, slot` |
| `private.security_identity_secret` | None | Owner/RPC only; `private.matrix_request_guard` | `singleton` |
| `private.security_policies` | None | Owner/RPC only; `private.security_collect` `public.security_policy_list` `public.security_policy_update` | `category` |
| `private.security_policy_audit` | None | Owner/RPC only; `private.security_cleanup` `public.security_policy_update` | `id` |
| `public.activation_code_batches` | SELECT (both) | Service; `public.admin_generate_activation_code_batch` `public.generate_activation_code_batch` | `id` |
| `public.activation_codes` | SELECT (both) | Service; `private.redeem_activation_code` `public.admin_delete_activation_code` `public.admin_generate_activation_code_batch` `public.admin_service_operation_evidence` `public.generate_activation_code_batch` | `id` |
| `public.admin_accounts` | ALL (both) | Service; `private.admin_transfer_push_enqueue` `private.security_collect` `public.admin_delete_activation_code` `public.admin_generate_activation_code_batch` `public.admin_matrix_permission_settings_update` `public.admin_record_payment_reversal` `public.admin_security_push_eligible` `public.admin_transfer_push_eligible` `public.protect_last_enabled_super_admin` `public.security_policy_list` `public.security_policy_update` `public.skip_super_admin_activity_logs` | `id` |
| `public.admin_login_records` | ALL (both) | Service; Service backend apps/admin/backend/index.ts records authenticated admin logins. | `id` |
| `public.admin_profiles` | None | Service; `public.is_admin` | `user_id` |
| `public.admin_push_subscriptions` | None | Service; `private.admin_transfer_push_enqueue` `private.security_collect` `public.admin_security_push_claim` `public.admin_security_push_eligible` `public.admin_security_push_finish` `public.admin_transfer_push_claim` `public.admin_transfer_push_eligible` `public.admin_transfer_push_finish` | `id` |
| `public.admin_revenue_settings` | None | Service; `public.admin_reset_revenue_baseline` | `id` |
| `public.admin_sessions` | None | Service; `private.revoke_admin_sessions_on_password_change` | `token_hash` |
| `public.admin_todos` | None | Service; Service backend apps/admin/backend/admin-todos.ts filters owner/authorized admin through backend transport. | `id` |
| `public.admin_transfer_push_jobs` | None | Service; `private.admin_transfer_push_enqueue` `private.admin_transfer_push_tick` `public.admin_transfer_push_claim` `public.admin_transfer_push_eligible` `public.admin_transfer_push_finish` | `id` |
| `public.audit_logs` | ALL (both) | Service; `public.admin_delete_activation_code` `public.admin_generate_activation_code_batch` `public.admin_record_payment_reversal` `public.admin_review_transfer_request` `public.admin_set_member_status` `public.admin_update_subscription` | `id` |
| `public.lottery_draws` | None | Service; `private.matrix_analysis_cleanup_batch` `private.matrix_analysis_draw_order_eligible` `private.matrix_analysis_read_period` `private.matrix_analysis_recent_completed_periods` `private.matrix_draw_changed` `private.matrix_stage_fast_result` `private.notification_draw_date_label` `public.matrix_analysis_complete_owned` `public.matrix_draw_query` `public.matrix_upsert_draws` `public.publish_matrix_card` | `id` |
| `public.matrix_analysis_artifact_chunks` | None | Service; `private.matrix_analysis_cleanup_preview` `private.matrix_artifact_payload` `public.admin_matrix_result_probe` `public.matrix_analysis_storage_health` `public.matrix_analysis_write_owned` | `id` |
| `public.matrix_analysis_artifacts` | None | Service; `private.matrix_analysis_active_version` `private.matrix_analysis_cleanup_preview` `private.matrix_analysis_missing_kinds` `private.matrix_artifact_payload` `public.admin_matrix_result_probe` `public.matrix_analysis_acquire_run` `public.matrix_analysis_complete_owned` `public.matrix_analysis_restore_results` `public.matrix_analysis_storage_health` `public.matrix_analysis_write_owned` | `id` |
| `public.matrix_analysis_runs` | None | Service; `private.matrix_analysis_active_version` `private.matrix_analysis_active_version_health` `private.matrix_analysis_cleanup_batch` `private.matrix_analysis_recent_completed_periods` `private.matrix_analysis_retained_versions` `private.matrix_analysis_superseded_versions` `private.matrix_draw_changed` `public.matrix_analysis_acquire_run` `public.matrix_analysis_complete_owned` `public.matrix_analysis_renew_lease` `public.matrix_analysis_restore_results` `public.matrix_analysis_write_owned` | `id` |
| `public.matrix_card_publications` | None | Service; `private.matrix_draw_changed` `public.claim_matrix_card_publication` `public.claim_matrix_card_publication_v2` `public.observe_matrix_card_snapshot` `public.publish_matrix_card` `public.renew_matrix_card_cleanup_lease` | `lottery` |
| `public.matrix_explore_results` | None | Service; `private.matrix_analysis_cleanup_preview` `private.matrix_explore_list_impl` `private.matrix_explore_validation_impl` `public.matrix_analysis_restore_results` `public.matrix_analysis_storage_health` `public.matrix_analysis_write_owned` `public.matrix_status_validation_source_get` | `lottery, draw_period, analysis_version, item_id` |
| `public.matrix_tianheng_results` | None | Service; `private.matrix_analysis_cleanup_preview` `private.matrix_tianheng_list_impl` `private.matrix_tianheng_validation_impl` `public.matrix_analysis_restore_results` `public.matrix_analysis_storage_health` `public.matrix_analysis_write_owned` | `lottery, draw_period, analysis_version, item_id` |
| `public.matrix_watchdog_leases` | None | Service; `public.admin_service_operation_evidence` `public.begin_matrix_watchdog_recovery` `public.claim_matrix_watchdog_lease` `public.finish_matrix_watchdog_recovery` `public.release_matrix_watchdog_lease` `public.renew_matrix_watchdog_recovery` | `lease_key` |
| `public.member_ip_locations` | None | Service; Service backend apps/admin/backend/member-login-history.ts caches IP location results. | `ip` |
| `public.member_login_records` | None | Service; Service backend apps/admin/backend/member-login-history.ts reads account-scoped login history. | `id` |
| `public.member_online_sessions` | None | Service; `public.admin_service_operation_evidence` `public.member_online_end_20260829_impl` `public.member_online_start_20260829_impl` `public.record_member_online_end` `public.record_member_online_start` | `id` |
| `public.notification_events` | None | Service; `private.native_push_eligible` `private.notification_event_enqueue` `private.notification_fanout_drain` `private.notification_fanout_event` `private.notification_pilio_http_tick` `public.admin_service_operation_evidence` `public.notification_dispatch_claim` | `id` |
| `public.notification_outbox` | None | Service; `private.native_push_eligible` `private.notification_fanout_event` `public.admin_service_operation_evidence` `public.native_notification_claim` `public.native_notification_prepare` `public.notification_dispatch_claim` `public.notification_dispatch_mark_failed` `public.notification_dispatch_mark_retry` `public.notification_dispatch_mark_sent` `public.notification_dispatch_mark_skipped` | `id` |
| `public.notification_settings` | None | Service; `private.notification_member_matches` `private.notification_time_events_tick` `public.admin_service_operation_evidence` `public.member_notification_settings_get_20260829_impl` `public.member_notification_settings_save_20260829_impl` `public.notification_draw_calendar_acquire` | `member_id` |
| `public.payments` | SELECT (both) | Service; `private.matrix_result_entitlements` `public.admin_dashboard_stats` `public.admin_record_payment_reversal` `public.admin_review_transfer_request` `public.matrix_explore_entitlements` `public.member_payment_history_get` `public.member_referral_summary` | `id` |
| `public.plans` | SELECT (both) | Service; `private.matrix_result_entitlements` `private.member_transfer_request_submit` `private.redeem_activation_code` `public.admin_review_transfer_request` `public.admin_update_subscription` `public.matrix_explore_entitlements` `public.member_payment_history_get` `public.member_pending_transfer_request` `public.member_profile_20260829_impl` | `id` |
| `public.push_delivery_logs` | None | Service; `public.notification_dispatch_claim` | `id` |
| `public.system_job_status` | None | Service; `public.claim_system_job_recovery` `public.finish_system_job_recovery` `public.report_system_job_stage` | `job_name` |
| `public.transfer_requests` | SELECT (both) | Service; `private.member_transfer_request_submit` `public.admin_review_transfer_request` `public.admin_service_operation_evidence` `public.admin_transfer_push_eligible` `public.member_payment_history_get` `public.member_pending_transfer_request` | `id` |

## Complete public/private function inventory

176 functions: 31 browser-callable, 79 additional service-only, 66 internal-only. 102 total are service-executable (including 23 browser APIs). All owners are postgres. Every function has a fixed search_path: 174 empty; the two service-only legacy record_member_online functions use `public, pg_temp`, where browser roles cannot create objects. None grants EXECUTE to PUBLIC.

For service-only functions, the primary authorization boundary is EXECUTE denied to both browser roles plus the server-held service credential. That role already has BYPASSRLS; SQL alone cannot bind a user-supplied admin ID to the application administrator session. The server must derive actor IDs from its verified admin session. This audit inventories that boundary; full application-admin authentication review is coordinated separately. Internal-only entries require an owning function, trigger or maintenance job rather than direct browser/service calls.

| Function identity | SECURITY DEFINER | anon / authenticated / service EXECUTE | search_path | Effective caller boundary |
|---|---|---|---|---|
| `private.active_member_id()` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `private.admin_transfer_push_enqueue()` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `private.admin_transfer_push_tick()` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `private.bootstrap_member_allowed()` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `private.default_member_notification_settings()` | no | no / no / no | `""` | Owner/trigger/internal only |
| `private.ensure_member_referral_code(p_member_id uuid)` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `private.initialize_line_registration_trial()` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `private.lock_active_member_id()` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `private.matrix_analysis_active_version(p_lottery text, p_draw_period text, p_number_order text, p_kind text)` | no | no / no / no | `""` | Owner/trigger/internal only |
| `private.matrix_analysis_active_version_health()` | no | no / no / no | `""` | Owner/trigger/internal only |
| `private.matrix_analysis_cleanup_batch(p_now timestamp with time zone, p_batch_size integer)` | no | no / no / no | `""` | Owner/trigger/internal only |
| `private.matrix_analysis_cleanup_preview()` | no | no / no / no | `""` | Owner/trigger/internal only |
| `private.matrix_analysis_cleanup_tick()` | no | no / no / no | `""` | Owner/trigger/internal only |
| `private.matrix_analysis_draw_order_eligible(p_lottery text, p_draw_period text)` | no | no / no / no | `""` | Owner/trigger/internal only |
| `private.matrix_analysis_missing_kinds(p_lottery text, p_draw_period text, p_analysis_version text)` | no | no / no / no | `""` | Owner/trigger/internal only |
| `private.matrix_analysis_order_version(p_lottery text, p_draw_period text, p_number_order text, p_kind text)` | no | no / no / no | `""` | Owner/trigger/internal only |
| `private.matrix_analysis_read_period(p_lottery text, p_draw_period text, p_offset integer)` | no | no / no / no | `""` | Owner/trigger/internal only |
| `private.matrix_analysis_recent_completed_periods()` | no | no / no / no | `""` | Owner/trigger/internal only |
| `private.matrix_analysis_retained_versions()` | no | no / no / no | `""` | Owner/trigger/internal only |
| `private.matrix_analysis_superseded_versions()` | no | no / no / no | `""` | Owner/trigger/internal only |
| `private.matrix_analysis_version_readable(p_lottery text, p_draw_period text, p_analysis_version text, p_kind text)` | no | no / no / no | `""` | Owner/trigger/internal only |
| `private.matrix_artifact_payload(p_kind text, p_lottery text, p_draw_period text, p_analysis_version text)` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `private.matrix_custom_status_normalize_config(p_config jsonb, p_can_composite boolean)` | no | no / no / no | `""` | Owner/trigger/internal only |
| `private.matrix_custom_status_road_types(p_types jsonb, p_can_composite boolean)` | no | no / no / no | `""` | Owner/trigger/internal only |
| `private.matrix_draw_changed()` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `private.matrix_explore_list_impl(p_request jsonb)` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `private.matrix_explore_validation_impl(p_request jsonb)` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `private.matrix_request_guard(p_operation text, p_request jsonb)` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `private.matrix_result_entitlements()` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `private.matrix_stage_fast_result(p_lottery text, p_date date, p_numbers jsonb)` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `private.matrix_status_read_payload(p_lottery text, p_draw_period text)` | no | no / no / no | `""` | Owner/trigger/internal only |
| `private.matrix_tiangong_list_impl(p_request jsonb)` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `private.matrix_tiangong_validation_impl(p_request jsonb)` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `private.matrix_tianheng_list_impl(p_request jsonb)` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `private.matrix_tianheng_validation_impl(p_request jsonb)` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `private.matrix_tianyan_list_impl(p_request jsonb)` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `private.matrix_tianyan_validation_impl(p_request jsonb)` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `private.member_push_endpoint_allowed(p_endpoint text)` | no | no / no / no | `""` | Owner/trigger/internal only |
| `private.member_transfer_request_submit(p_plan_code text, p_account_last_five text)` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `private.native_push_current_session()` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `private.native_push_eligible(p_installation uuid, p_revision uuid, p_outbox uuid)` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `private.native_push_session_valid(p_uid uuid, p_session uuid)` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `private.notification_dispatch_http_tick()` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `private.notification_draw_date_label(p_payload jsonb)` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `private.notification_event_enqueue(p_event_key text, p_event_type text, p_source text, p_occurred_at timestamp with time zone, p_payload jsonb)` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `private.notification_fanout_drain(p_limit integer, p_now timestamp with time zone)` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `private.notification_fanout_event(p_event_id uuid)` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `private.notification_fast_result_publish(p_lottery_code text, p_draw_date date, p_numbers text[])` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `private.notification_is_draw_day(p_lottery text, p_taipei_date date)` | no | no / no / no | `""` | Owner/trigger/internal only |
| `private.notification_member_matches(p_member_id uuid, p_event_type text, p_payload jsonb)` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `private.notification_pilio_http_tick(p_now timestamp with time zone)` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `private.notification_pipeline_tick(p_now timestamp with time zone)` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `private.notification_reminder_is_due(p_payload jsonb, p_now timestamp with time zone)` | no | no / no / no | `""` | Owner/trigger/internal only |
| `private.notification_render_payload(p_event_type text, p_event_key text, p_payload jsonb)` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `private.notification_retry_delay_minutes(p_attempt integer)` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `private.notification_time_events_tick(p_now timestamp with time zone)` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `private.purge_matrix_visitor_identifiers()` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `private.record_matrix_visit(p_visitor_hash text, p_now timestamp with time zone)` | no | no / no / no | `""` | Owner/trigger/internal only |
| `private.redeem_activation_code(p_code text)` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `private.revoke_admin_sessions_on_password_change()` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `private.security_cleanup()` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `private.security_collect(p_category text, p_source text, p_trusted boolean, p_outcome text)` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `private.sync_line_member_from_identity()` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `public.admin_api_registry()` | no | no / no / yes | `""` | Trusted service only; browser denied |
| `public.admin_dashboard_stats()` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `public.admin_delete_activation_code(p_code_id uuid, p_actor_id uuid, p_actor_name text)` | no | no / no / yes | `""` | Trusted service only; browser denied |
| `public.admin_generate_activation_code_batch(p_duration_type text, p_quantity integer, p_actor_id uuid, p_request_id uuid)` | no | no / no / yes | `""` | Trusted service only; browser denied |
| `public.admin_matrix_permission_settings_update(p_admin_id uuid, p_change jsonb)` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.admin_matrix_result_probe(p_kind text)` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.admin_native_notification_health()` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.admin_record_payment_reversal(p_payment_id uuid, p_status text, p_reason text, p_actor_id uuid, p_actor_name text)` | no | no / no / yes | `""` | Trusted service only; browser denied |
| `public.admin_reset_revenue_baseline()` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.admin_review_transfer_request(p_transfer_id uuid, p_decision text, p_now timestamp with time zone, p_actor_id uuid, p_actor_name text)` | no | no / no / yes | `""` | Trusted service only; browser denied |
| `public.admin_security_push_claim()` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.admin_security_push_eligible(p_id uuid, p_lease_token uuid)` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.admin_security_push_finish(p_id uuid, p_lease_token uuid, p_outcome text, p_disable boolean)` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.admin_service_operation_evidence()` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.admin_set_member_status(p_member_id uuid, p_status text, p_actor_id uuid, p_actor_name text)` | no | no / no / yes | `""` | Trusted service only; browser denied |
| `public.admin_transfer_push_claim()` | no | no / no / yes | `""` | Trusted service only; browser denied |
| `public.admin_transfer_push_eligible(p_id uuid, p_lease_token uuid)` | no | no / no / yes | `""` | Trusted service only; browser denied |
| `public.admin_transfer_push_finish(p_id uuid, p_lease_token uuid, p_outcome text, p_disable boolean)` | no | no / no / yes | `""` | Trusted service only; browser denied |
| `public.admin_update_subscription(p_member_id uuid, p_action text, p_plan_id uuid, p_expires_at timestamp with time zone, p_now timestamp with time zone, p_actor_id uuid, p_actor_name text)` | no | no / no / yes | `""` | Trusted service only; browser denied |
| `public.admin_visitor_stats()` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.admin_watchdog_cron_authorize(p_token text)` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.admin_watchdog_status_read()` | no | no / no / yes | `""` | Trusted service only; browser denied |
| `public.admin_watchdog_status_write(p_status jsonb)` | no | no / no / yes | `""` | Trusted service only; browser denied |
| `public.begin_matrix_watchdog_recovery(p_lease_key text, p_owner_id text, p_runner_id text, p_ttl_seconds integer)` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.claim_matrix_card_publication(p_lottery text, p_token uuid)` | no | no / no / yes | `""` | Trusted service only; browser denied |
| `public.claim_matrix_card_publication_v2(p_lottery text, p_token uuid)` | no | no / no / yes | `""` | Trusted service only; browser denied |
| `public.claim_matrix_watchdog_lease(p_lease_key text, p_owner_id text, p_ttl_seconds integer)` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.claim_system_job_recovery(p_job_name text, p_lottery text, p_lease_token text, p_now timestamp with time zone, p_force boolean)` | no | no / no / yes | `""` | Trusted service only; browser denied |
| `public.finish_matrix_watchdog_recovery(p_lease_key text, p_owner_id text, p_runner_id text)` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.finish_system_job_recovery(p_job_name text, p_lease_token text, p_succeeded boolean, p_error text, p_now timestamp with time zone)` | no | no / no / yes | `""` | Trusted service only; browser denied |
| `public.generate_activation_code_batch(p_duration_type text, p_quantity integer)` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.is_admin()` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `public.matrix_analysis_acquire_run(p_lottery text, p_draw_period text, p_analysis_version text, p_owner_id text, p_started_at timestamp with time zone, p_lease_seconds integer)` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.matrix_analysis_cleanup_expired(p_now timestamp with time zone)` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.matrix_analysis_cleanup_status()` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.matrix_analysis_complete_owned(p_lottery text, p_draw_period text, p_analysis_version text, p_owner_id text, p_completed_at timestamp with time zone)` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.matrix_analysis_renew_lease(p_lottery text, p_draw_period text, p_analysis_version text, p_owner_id text, p_lease_seconds integer)` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.matrix_analysis_restore_results(p_lottery text, p_draw_period text, p_analysis_version text, p_started_at timestamp with time zone, p_kind text, p_records jsonb)` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.matrix_analysis_storage_health()` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.matrix_analysis_write_owned(p_lottery text, p_draw_period text, p_analysis_version text, p_owner_id text, p_started_at timestamp with time zone, p_target text, p_records jsonb)` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.matrix_custom_status_list()` | yes | no / yes / yes | `""` | Scoped client guard above |
| `public.matrix_custom_status_reset(p_lottery text, p_status text)` | yes | no / yes / yes | `""` | Scoped client guard above |
| `public.matrix_custom_status_reset_20260829_impl(p_lottery text, p_status text)` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.matrix_custom_status_save(p_config jsonb)` | yes | no / yes / yes | `""` | Scoped client guard above |
| `public.matrix_draw_query(p_lottery text, p_kind text, p_limit integer, p_cursor jsonb, p_numbers jsonb, p_order text, p_future_offset integer)` | no | no / no / yes | `""` | Trusted service only; browser denied |
| `public.matrix_explore_entitlements()` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.matrix_explore_list(p_request jsonb)` | yes | yes / yes / yes | `""` | Scoped client guard above |
| `public.matrix_explore_validation(p_request jsonb)` | yes | yes / yes / yes | `""` | Scoped client guard above |
| `public.matrix_permission_settings()` | yes | yes / yes / yes | `""` | Scoped client guard above |
| `public.matrix_status_get(p_request jsonb)` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.matrix_status_sources_get(p_request jsonb)` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.matrix_status_validation_source_get(p_request jsonb)` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.matrix_tiangong_list(p_request jsonb)` | yes | no / yes / yes | `""` | Scoped client guard above |
| `public.matrix_tiangong_validation(p_request jsonb)` | yes | no / yes / yes | `""` | Scoped client guard above |
| `public.matrix_tianheng_list(p_request jsonb)` | yes | yes / yes / yes | `""` | Scoped client guard above |
| `public.matrix_tianheng_validation(p_request jsonb)` | yes | yes / yes / yes | `""` | Scoped client guard above |
| `public.matrix_tianyan_list(p_request jsonb)` | yes | no / yes / yes | `""` | Scoped client guard above |
| `public.matrix_tianyan_validation(p_request jsonb)` | yes | no / yes / yes | `""` | Scoped client guard above |
| `public.matrix_upsert_draws(p_draws jsonb)` | no | no / no / yes | `""` | Trusted service only; browser denied |
| `public.member_bootstrap()` | yes | no / yes / yes | `""` | Scoped client guard above |
| `public.member_bootstrap_20260829_impl()` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.member_line_pwa_diagnostics_submit(p_events jsonb)` | yes | no / yes / no | `""` | Scoped client guard above |
| `public.member_native_push_disable(p_installation_id uuid)` | yes | no / yes / no | `""` | Scoped client guard above |
| `public.member_native_push_save(p_installation_id uuid, p_token text, p_platform text)` | yes | no / yes / no | `""` | Scoped client guard above |
| `public.member_native_push_status(p_installation_id uuid)` | yes | no / yes / no | `""` | Scoped client guard above |
| `public.member_notification_settings_get()` | yes | no / yes / yes | `""` | Scoped client guard above |
| `public.member_notification_settings_get_20260829_impl()` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.member_notification_settings_save(p_settings jsonb)` | yes | no / yes / yes | `""` | Scoped client guard above |
| `public.member_notification_settings_save_20260829_impl(p_settings jsonb)` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.member_online_end(p_session_id uuid)` | yes | no / yes / yes | `""` | Scoped client guard above |
| `public.member_online_end_20260829_impl(p_session_id uuid)` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.member_online_start()` | yes | no / yes / yes | `""` | Scoped client guard above |
| `public.member_online_start_20260829_impl()` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.member_payment_history_get()` | yes | no / yes / yes | `""` | Scoped client guard above |
| `public.member_pending_transfer_request()` | yes | no / yes / yes | `""` | Scoped client guard above |
| `public.member_profile()` | yes | no / yes / yes | `""` | Scoped client guard above |
| `public.member_profile_20260829_impl()` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.member_push_subscription_disable(p_endpoint text)` | yes | no / yes / yes | `""` | Scoped client guard above |
| `public.member_push_subscription_save(p_endpoint text, p_p256dh text, p_auth text)` | yes | no / yes / yes | `""` | Scoped client guard above |
| `public.member_push_subscription_status(p_endpoint text)` | yes | no / yes / yes | `""` | Scoped client guard above |
| `public.member_referral_submit(p_referral_code text)` | yes | no / yes / no | `""` | Scoped client guard above |
| `public.member_referral_summary()` | yes | no / yes / no | `""` | Scoped client guard above |
| `public.member_transfer_request_submit(p_plan_code text, p_account_last_five text)` | yes | no / yes / no | `""` | Scoped client guard above |
| `public.native_notification_claim(p_limit integer)` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.native_notification_finalize(p_delivery_id uuid, p_claim_id uuid, p_outcome text)` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.native_notification_prepare(p_delivery_id uuid, p_claim_id uuid)` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.notification_dispatch_claim(p_limit integer, p_now timestamp with time zone)` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.notification_dispatch_mark_failed(p_outbox_id uuid, p_error text, p_processed_at timestamp with time zone)` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.notification_dispatch_mark_retry(p_outbox_id uuid, p_error text, p_next_attempt_at timestamp with time zone)` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.notification_dispatch_mark_sent(p_outbox_id uuid, p_processed_at timestamp with time zone)` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.notification_dispatch_mark_skipped(p_outbox_id uuid, p_reason text, p_processed_at timestamp with time zone)` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.notification_draw_calendar_acquire(p_owner_id uuid)` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.notification_draw_calendar_complete(p_owner_id uuid, p_days jsonb, p_fetched_at timestamp with time zone)` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.notification_draw_calendar_fail(p_owner_id uuid)` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.notification_draw_calendar_status()` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.notification_event_enqueue_server(p_event_key text, p_event_type text, p_source text, p_occurred_at timestamp with time zone, p_payload jsonb)` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.notification_fast_result_publish(p_lottery_code text, p_draw_date date, p_numbers text[])` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.observe_matrix_card_snapshot(p_lottery text, p_token uuid, p_digest text, p_period text)` | no | no / no / yes | `""` | Trusted service only; browser denied |
| `public.protect_last_enabled_super_admin()` | no | no / no / yes | `""` | Trusted service only; browser denied |
| `public.publish_matrix_card(p_lottery text, p_token uuid, p_digest text, p_manifest jsonb)` | no | no / no / yes | `""` | Trusted service only; browser denied |
| `public.record_matrix_visit(p_visitor_hash text)` | yes | no / no / no | `""` | Owner/trigger/internal only |
| `public.record_matrix_visit_edge(p_source text)` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.record_member_online_end(p_member_id uuid, p_session_id uuid, p_now timestamp with time zone)` | yes | no / no / yes | `public, pg_temp` | Trusted service only; browser denied |
| `public.record_member_online_start(p_member_id uuid, p_now timestamp with time zone)` | yes | no / no / yes | `public, pg_temp` | Trusted service only; browser denied |
| `public.redeem_activation_code(p_code text)` | yes | no / yes / no | `""` | Scoped client guard above |
| `public.release_matrix_watchdog_lease(p_lease_key text, p_owner_id text)` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.renew_matrix_card_cleanup_lease(p_lottery text, p_token uuid, p_period text, p_digest text)` | no | no / no / yes | `""` | Trusted service only; browser denied |
| `public.renew_matrix_watchdog_recovery(p_lease_key text, p_owner_id text, p_runner_id text, p_ttl_seconds integer)` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.report_system_job_stage(p_job_name text, p_lease_token text, p_stage text, p_now timestamp with time zone)` | no | no / no / yes | `""` | Trusted service only; browser denied |
| `public.security_observe(p_category text, p_source text, p_trusted boolean, p_outcome text)` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.security_policy_list(p_admin_id uuid)` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.security_policy_update(p_admin_id uuid, p_category text, p_mode text, p_threshold integer, p_window_seconds integer, p_expected_revision integer)` | yes | no / no / yes | `""` | Trusted service only; browser denied |
| `public.skip_super_admin_activity_logs()` | yes | no / no / yes | `""` | Trusted service only; browser denied |

## Exact catalog queries and compact results

Function inventory query (all 176 rows were reviewed as metadata; browser-callable bodies and reachable authorization helpers were inspected):

```sql
select p.oid::text, n.nspname as schema, p.proname as name, pg_get_function_identity_arguments(p.oid) as arguments, pg_get_userbyid(p.proowner) as owner, p.prosecdef as security_definer,p.proconfig,has_function_privilege('anon',p.oid,'execute') as anon_execute,has_function_privilege('authenticated',p.oid,'execute') as authenticated_execute,pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') order by n.nspname,p.proname,p.oid;
```

Result: 176; owners all postgres; browser callable 31; anon callable 5; no missing function search_path. Full identities/role results are above; secret-free function source was inspected but not copied into this report.

```sql
select p.oid::text,has_function_privilege('service_role',p.oid,'execute') service_execute, exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and privilege_type='EXECUTE') public_execute from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f' order by p.oid;
```

Result: 176 rows; service EXECUTE=true 102; PUBLIC EXECUTE=true 0.

```sql
select n.nspname as schema,c.relname as name, pg_get_userbyid(c.relowner) as owner,c.relrowsecurity,c.relforcerowsecurity,(select count(*) from pg_policy where polrelid=c.oid) as policies,
 has_table_privilege('anon',c.oid,'select') as anon_select,has_table_privilege('anon',c.oid,'insert,update,delete,truncate,references,trigger') as anon_write,
 has_table_privilege('authenticated',c.oid,'select') as authenticated_select,has_table_privilege('authenticated',c.oid,'insert,update,delete,truncate,references,trigger') as authenticated_write,
 has_table_privilege('service_role',c.oid,'select,insert,update,delete') as service_access,
 (select string_agg(a.attname,', ' order by x.ord) from pg_constraint k cross join unnest(k.conkey) with ordinality x(attnum,ord) join pg_attribute a on a.attrelid=k.conrelid and a.attnum=x.attnum where k.conrelid=c.oid and k.contype='p') as primary_key
from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p') and n.nspname in ('public','private') order by n.nspname,c.relname;
```

Result before/after: table count 52/52, RLS disabled 2/0, missing PK 1/0, no-policy client-granted tables 8/0. The per-table result appears above. All 52 have FORCE RLS=false; owner-mediated functions require that model.

```sql
select version,name from supabase_migrations.schema_migrations where name='database_security_boundaries' order by version desc;
```

Result: `[{"version":"20260914141705","name":"database_security_boundaries"}]`.

```sql
select count(*) as row_count from private.security_identity_secret;
```

Before and after result: `[{"row_count":1}]`. PK/check catalog: `CHECK (singleton)`, `PRIMARY KEY (singleton)`. No secret field selected.

Exact executable assertions and role tests are in the three named SQL files above. Tests end with ROLLBACK and ran with `begin read only`; successful tool results were `isError=false` and `[]`.

## Recovery considerations

No recovery was needed or executed. If an actual compatibility failure is traced to a removed legacy grant, prefer fixing the scoped backend/RPC consumer. The following is the exact prior grant shape for only the eight affected tables; it deliberately does not grant PUBLIC, alter service privileges, drop policies, disable RLS or remove the new key. Executing it would restore the prior overbroad privilege surface and requires a fresh reviewed recovery decision.

```sql
grant select on table public.activation_code_batches, public.activation_codes,
  public.payments, public.plans, public.transfer_requests
to anon, authenticated;
grant select, insert, update, delete, truncate, references, trigger
on table public.admin_accounts, public.admin_login_records, public.audit_logs
to anon, authenticated;
```

The singleton PK intentionally causes migration failure if unexpected duplicate/empty secret rows exist; it never selects a preferred row or deletes data. The 3-second lock timeout bounds waiting for DDL locks. RLS enablement preserves existing postgres-owned function paths and does not require client policies.
