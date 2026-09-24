# Migration history follow-up — 2026-09-24

Production was queried read-only. This repair changes repository history only; it does not run, replay, repair, or push migrations against any database.

Base main: `b9eaf27baf7e07f24582ea730c9e9a878536fb5c`. The complete ledger snapshot contains 254 rows; main contains 243 migration files. Before this repair, 123 same-name files had different version prefixes. This repair renames 10 files and restores one missing file.

**History reconciliation remains incomplete. Do not bulk `db push` or mass-mark migrations as applied.** The remaining same-name differences below are confirmed version differences, not proof of SQL equivalence. The three repo-only names must not be interpreted as approved pending migrations.

## Evidence and repair scope

- Original candidates: [#325](https://github.com/spyuilin688-sudo/lottery-matrix/pull/325), [#592](https://github.com/spyuilin688-sudo/lottery-matrix/pull/592), and [#684](https://github.com/spyuilin688-sudo/lottery-matrix/pull/684). Missing index: [#326](https://github.com/spyuilin688-sudo/lottery-matrix/pull/326), closed without merging despite recorded application.
- [#840](https://github.com/spyuilin688-sudo/lottery-matrix/pull/840), [#846](https://github.com/spyuilin688-sudo/lottery-matrix/pull/846), [#861](https://github.com/spyuilin688-sudo/lottery-matrix/pull/861), and [#866](https://github.com/spyuilin688-sudo/lottery-matrix/pull/866) already aligned their eight renamed files. Their current versions also match this live ledger snapshot; they are excluded from the remaining list.
- The original PR/document audit identified only three filename candidates and one missing index. The complete live-ledger comparison expanded the evidence; those original candidates were not an exhaustive live mismatch list.
- Source: `supabase_migrations.schema_migrations` in project `wcimzbbapfrdotjsfyxa`. Each of the 11 repaired records contains one statement-array element. All bytes of that element were inspected, not only the first SQL command. `pg_indexes` also confirms `public.admin_sessions_admin_id_idx` on `admin_id`.
- [Evidence snapshot](migration-history-evidence-20260924.json) records the complete version/name list, repaired-file SHA-256 hashes and the remaining classifications. All filenames below are under `supabase/migrations/`.

| Previous repository filename | Recorded filename used by this repair | Content treatment |
|---|---|---|
| `20260904110000_restrict_member_rpc_execute.sql` | `20260904200919_restrict_member_rpc_execute.sql` | unchanged repo bytes |
| Missing | `20260904201636_add_admin_sessions_admin_id_index.sql` | restored exact recorded SQL |
| `20260916015000_google_member_perks.sql` | `20260915175243_google_member_perks.sql` | unchanged repo bytes |
| `20260919174332_matrix_optimizer_history_schedule.sql` | `20260919180508_matrix_optimizer_history_schedule.sql` | unchanged repo bytes |
| `20260920001000_matrix_chain_evidence.sql` | `20260919180526_matrix_chain_evidence.sql` | unchanged repo bytes |
| `20260920002000_matrix_verified_recovery.sql` | `20260919180528_matrix_verified_recovery.sql` | unchanged repo bytes |
| `20260920003000_matrix_custom_status_guard.sql` | `20260919180603_matrix_custom_status_guard.sql` | aligned to recorded SQL |
| `20260920004000_matrix_missing_artifact_recovery.sql` | `20260919180618_matrix_missing_artifact_recovery.sql` | aligned to recorded SQL |
| `20260920005000_matrix_optimizer_snapshot.sql` | `20260919180638_matrix_optimizer_snapshot.sql` | aligned to recorded SQL |
| `20260919181118_matrix_optimizer_cron_origin.sql` | `20260919181404_matrix_optimizer_cron_origin.sql` | aligned to recorded SQL |
| `20260920006000_retire_matrix_custom_status.sql` | `20260919212711_retire_matrix_custom_status.sql` | unchanged repo bytes |

The member-RPC repository file has one extra terminal LF compared with the recorded statement (586 vs 585 bytes). Its existing bytes are preserved. Every other repaired file matches the recorded SQL byte-for-byte. Six renamed files preserve their previous repository bytes; four renamed files have the specific recorded differences below.

## Why retirement requires the dependency group

Renaming retirement alone to `20260919212711` would place it before the old `20260920001000`–`20260920005000` files. A replay could then restore pre-retirement function bodies or try to create a trigger on tables retirement already dropped. The dependency group is moved together into the actual recorded order: history → chain → verified recovery → guard → pointer recovery → snapshot → cron-origin → retirement.

The user explicitly allowed necessary SQL edits after the byte comparison exposed these differences:

- `matrix_custom_status_guard`: the recorded SQL uses `CREATE OR REPLACE FUNCTION` for three functions and drops the existing config-lock trigger before recreating it. It omits the repository-only outer `BEGIN`/`COMMIT`.
- `matrix_missing_artifact_recovery`, `matrix_optimizer_snapshot`, and `matrix_optimizer_cron_origin`: the recorded SQL omits the repository-only outer transaction wrapper (and associated terminal whitespace). Function bodies are unchanged.
- Retirement itself is byte-identical and retains its explicit transaction and `RESTRICT` protections. Historical files are not deployment commands; removal of a wrapper here is evidence alignment, not permission to run individual statements against production.

## Verification and execution plan

1. Read the live ledger and all selected statement bytes; confirm the missing index definition.
2. Preserve identical SQL, copy only the four inspected recorded variants, restore the 91-byte index file, and update executable/document references.
3. Run only the four directly affected test files, verify the chronological dependency group and replacement guard behavior, and review the final diff independently.
4. Check the current main and merge the reviewed PR after its applicable checks. No deployment or database-history mutation is part of this change.

Focused command:

```sh
node --test --test-concurrency=1 \
  tests/supabase-member-rpc-privileges.test.mjs \
  tests/matrix-chain-migration.test.mjs \
  tests/matrix-optimizer-history.test.mjs \
  supabase/tests/admin-service-health.test.mjs
```

A separate isolated PGlite fixture executed the restored index SQL twice and confirmed exactly one btree index on `admin_id`. Full database replay is not claimed: the repository has additional history gaps listed below, plus prerequisites outside this targeted fixture.

## Remaining risks and candidates

113 same-name version differences remain. Every row is supported by the live ledger snapshot, but SQL identity and the transitive dependency order still require a dedicated review before any further rename. Incorrect replay could overwrite later RPC definitions, repeat data changes, or fail on retired/missing objects. This follow-up deliberately fixes the original candidates and their necessary dependency group, not every historical migration.

The pre-existing duplicate prefix `20260830223000` is especially important: `fix_matrix_entitlement_coalesce` and `fix_mobile_push_rpc_nullif` correspond to separate live versions `20260830131255` and `20260830141227`. Neither is renamed alone here because surrounding older migrations also have different versions; they need chronological reconciliation as a group.

| Current repository filename | Recorded version/name filename — requires SQL and dependency review |
|---|---|
| `20260813175200_relax_member_expiry_check.sql` | `20260813190048_relax_member_expiry_check.sql` |
| `20260820174733_secure_admin_backend_integration.sql` | `20260820174842_secure_admin_backend_integration.sql` |
| `20260821212800_matrix_custom_status_api_only_mutations.sql` | `20260821012728_matrix_custom_status_api_only_mutations.sql` |
| `20260821190000_admin_operations_status.sql` | `20260821101646_admin_operations_status.sql` |
| `20260821193000_admin_atomic_member_operations.sql` | `20260821102531_admin_atomic_member_operations.sql` |
| `20260821194500_protect_last_super_admin.sql` | `20260821102612_protect_last_super_admin.sql` |
| `20260821220000_member_online_tracking.sql` | `20260821115603_member_online_tracking.sql` |
| `20260821223000_skip_super_admin_activity_logs.sql` | `20260821120037_skip_super_admin_activity_logs.sql` |
| `20260821224500_admin_atomic_activation_code_delete.sql` | `20260821145754_admin_atomic_activation_code_delete.sql` |
| `20260821225000_fix_admin_activation_code_role_check.sql` | `20260821150025_fix_admin_activation_code_role_check.sql` |
| `20260824180000_matrix_fastapi_backend.sql` | `20260824094431_matrix_fastapi_backend.sql` |
| `20260824190427_sync_line_members_from_auth.sql` | `20260824190505_sync_line_members_from_auth.sql` |
| `20260824192513_sync_line_display_names.sql` | `20260824192549_sync_line_display_names.sql` |
| `20260824192612_sync_line_identity_profile_updates.sql` | `20260824192630_sync_line_identity_profile_updates.sql` |
| `20260824212000_index_lottery_draws_history_order.sql` | `20260824211820_index_lottery_draws_history_order.sql` |
| `20260825060000_matrix_analysis_artifact_chunks.sql` | `20260824223022_matrix_analysis_artifact_chunks.sql` |
| `20260827165000_matrix_explore_rpc.sql` | `20260827091443_matrix_explore_rpc.sql` |
| `20260829090000_member_pwa_rpc.sql` | `20260829181805_member_pwa_rpc.sql` |
| `20260829093000_matrix_result_rpc.sql` | `20260829181807_matrix_result_rpc.sql` |
| `20260829103000_security_review_fixes.sql` | `20260829192625_security_review_fixes.sql` |
| `20260829194000_compact_matrix_status_sources.sql` | `20260829193611_compact_matrix_status_sources.sql` |
| `20260829195500_backfill_compact_matrix_status_sources.sql` | `20260829194135_backfill_compact_matrix_status_sources.sql` |
| `20260829205227_free_member_profile_label.sql` | `20260829205310_free_member_profile_label.sql` |
| `20260829205500_lock_member_profile_rpc_to_authenticated.sql` | `20260829205413_lock_member_profile_rpc_to_authenticated.sql` |
| `20260830060000_manual_bank_transfer.sql` | `20260829223804_manual_bank_transfer.sql` |
| `20260830075300_rename_member_payment_history_rpc.sql` | `20260829225358_rename_member_payment_history_rpc.sql` |
| `20260830083000_fix_payment_history_and_audit_logs.sql` | `20260829232518_fix_payment_history_and_audit_logs.sql` |
| `20260830144700_mobile_push_notifications.sql` | `20260830095443_mobile_push_notifications.sql` |
| `20260830183000_mobile_push_notification_indexes.sql` | `20260830103236_mobile_push_notification_indexes.sql` |
| `20260830220000_fix_matrix_v6_rpc_nullif.sql` | `20260830130523_fix_matrix_v6_rpc_nullif.sql` |
| `20260830221500_fix_matrix_v6_rpc_coalesce.sql` | `20260830130914_fix_matrix_v6_rpc_coalesce.sql` |
| `20260830223000_fix_matrix_entitlement_coalesce.sql` | `20260830131255_fix_matrix_entitlement_coalesce.sql` |
| `20260830223000_fix_mobile_push_rpc_nullif.sql` | `20260830141227_fix_mobile_push_rpc_nullif.sql` |
| `20260831030000_tiangong_two_stage_ready2_only.sql` | `20260830192202_tiangong_two_stage_ready2_only.sql` |
| `20260831213000_matrix_python_v7_explore_rpc.sql` | `20260830235651_matrix_python_v7_explore_rpc.sql` |
| `20260831235800_repair_qualified_coalesce.sql` | `20260831000718_repair_qualified_coalesce.sql` |
| `20260901000000_matrix_python_v8_explore_rpc.sql` | `20260831130348_matrix_python_v8_explore_rpc.sql` |
| `20260901010000_restore_matrix_explore_date_offsets.sql` | `20260831130405_restore_matrix_explore_date_offsets.sql` |
| `20260901100000_matrix_explore_v2_ranges.sql` | `20260901115059_matrix_explore_v2_ranges.sql` |
| `20260901153758_admin_transfer_review_rpc.sql` | `20260901154008_admin_transfer_review_rpc.sql` |
| `20260901164500_restore_super_admin_activity_log_exemption.sql` | `20260901161953_restore_super_admin_activity_log_exemption.sql` |
| `20260902010000_matrix_explore_v11_rpc.sql` | `20260901172741_matrix_explore_v11_rpc.sql` |
| `20260902020000_matrix_explore_v11_draw_order.sql` | `20260901174019_matrix_explore_v11_draw_order.sql` |
| `20260902030000_matrix_explore_v11_draw_order_forward.sql` | `20260901174618_matrix_explore_v11_draw_order_forward.sql` |
| `20260902031000_matrix_latest_run_draw_order.sql` | `20260901175025_matrix_latest_run_draw_order.sql` |
| `20260902064500_admin_revenue_reset_baseline.sql` | `20260902065226_admin_revenue_reset_baseline.sql` |
| `20260902070030_limit_admin_revenue_settings_privileges.sql` | `20260902065309_limit_admin_revenue_settings_privileges.sql` |
| `20260902071500_admin_revenue_reset_rpc.sql` | `20260902070157_admin_revenue_reset_rpc.sql` |
| `20260902070000_worker_freshness_status.sql` | `20260902070913_worker_freshness_status.sql` |
| `20260902040000_matrix_explore_v12_rpc.sql` | `20260902072734_matrix_explore_v12_rpc.sql` |
| `20260902050000_matrix_explore_v12_cleanup.sql` | `20260902072845_matrix_explore_v12_cleanup.sql` |
| `20260902081857_fix_activation_code_plan_entitlements.sql` | `20260902091404_fix_activation_code_plan_entitlements.sql` |
| `20260902190500_repair_pg_catalog_greatest.sql` | `20260902190446_repair_pg_catalog_greatest.sql` |
| `20260902193000_repair_qualified_sql_constructs.sql` | `20260902190724_repair_qualified_sql_constructs.sql` |
| `20260902194500_repair_admin_transfer_audit_actor.sql` | `20260902190849_repair_admin_transfer_audit_actor.sql` |
| `20260903042000_admin_credential_login_schema.sql` | `20260902203534_admin_credential_login_schema.sql` |
| `20260902204215_member_referral_rpc.sql` | `20260902223653_member_referral_rpc.sql` |
| `20260904050000_normalize_manual_transfer_review.sql` | `20260904034400_normalize_manual_transfer_review.sql` |
| `20260904103000_add_matrix_watchdog_leases.sql` | `20260904104229_add_matrix_watchdog_leases.sql` |
| `20260905090000_allow_referral_code_after_payment.sql` | `20260904183827_allow_referral_code_after_payment.sql` |
| `20260905172358_add_matrix_card_cleanup_lease.sql` | `20260905181320_add_matrix_card_cleanup_lease.sql` |
| `20260906145500_line_pwa_handoff_diagnostics.sql` | `20260906135233_line_pwa_handoff_diagnostics.sql` |
| `20260910105312_admin_atomic_activation_batch.sql` | `20260910123427_admin_atomic_activation_batch.sql` |
| `20260910233000_matrix_tianheng.sql` | `20260910224706_matrix_tianheng.sql` |
| `20260914084000_cover_foreign_key_indexes.sql` | `20260914010516_cover_foreign_key_indexes.sql` |
| `20260914014411_secure_visitor_counting.sql` | `20260914015017_secure_visitor_counting.sql` |
| `20260914190000_confirmed_member_permission_fixes.sql` | `20260914184931_confirmed_member_permission_fixes.sql` |
| `20260915150500_guest_algorithm_access.sql` | `20260915072007_guest_algorithm_access.sql` |
| `20260915193500_allow_google_member_bootstrap.sql` | `20260915114856_allow_google_member_bootstrap.sql` |
| `20260915154500_tianheng_requires_login.sql` | `20260915154417_tianheng_requires_login.sql` |
| `20260916090000_reconcile_confirmed_same_period_draws.sql` | `20260915195954_reconcile_confirmed_same_period_draws.sql` |
| `20260916093000_skip_empty_notification_dispatch.sql` | `20260915214936_skip_empty_notification_dispatch.sql` |
| `20260916094500_runtime_idle_schedule_guards.sql` | `20260916002910_runtime_idle_schedule_guards.sql` |
| `20260916095000_watchdog_active_analysis_state.sql` | `20260916002923_watchdog_active_analysis_state.sql` |
| `20260916100500_notification_event_exists_guard.sql` | `20260916002935_notification_event_exists_guard.sql` |
| `20260916103000_member_profile_member_id.sql` | `20260916014316_member_profile_member_id.sql` |
| `20260916110000_native_notification_dispatch_guard.sql` | `20260916025212_native_notification_dispatch_guard.sql` |
| `20260916110100_cron_runtime_retention.sql` | `20260916025223_cron_runtime_retention.sql` |
| `20260916110200_notification_fanout_delivery_guard.sql` | `20260916025241_notification_fanout_delivery_guard.sql` |
| `20260916110300_matrix_status_compact_source.sql` | `20260916025300_matrix_status_compact_source.sql` |
| `20260916112000_canonical_draw_day_runtime.sql` | `20260916032653_canonical_draw_day_runtime.sql` |
| `20260916095200_admin_session_login_record_link.sql` | `20260916101659_admin_session_login_record_link.sql` |
| `20260916132000_optimize_matrix_status_compact_read.sql` | `20260916130351_optimize_matrix_status_compact_read.sql` |
| `20260916134500_precompute_matrix_status_compact_payload.sql` | `20260916131439_precompute_matrix_status_compact_payload.sql` |
| `20260916140000_admin_member_display_name_search.sql` | `20260916133043_admin_member_display_name_search.sql` |
| `20260917002000_optimize_matrix_draw_query_read_path.sql` | `20260916161309_optimize_matrix_draw_query_read_path.sql` |
| `20260917040000_guard_idle_watchdog_http.sql` | `20260916193833_guard_idle_watchdog_http.sql` |
| `20260917165000_matrix_custom_status_results.sql` | `20260917171330_matrix_custom_status_results.sql` |
| `20260917170500_matrix_status_identity_get.sql` | `20260917171346_matrix_status_identity_get.sql` |
| `20260920060000_watchdog_schedule_evidence.sql` | `20260920051031_watchdog_schedule_evidence.sql` |
| `20260920091230_ecpay_review_login.sql` | `20260920094607_ecpay_review_login.sql` |
| `20260920100000_manual_refresh_jobs.sql` | `20260920102528_manual_refresh_jobs.sql` |
| `20260920105700_admin_dashboard_summary.sql` | `20260920112247_admin_dashboard_summary.sql` |
| `20260920105819_optimize_status_summary_reads.sql` | `20260920112248_optimize_status_summary_reads.sql` |
| `20260920105823_read_validation_draw_periods.sql` | `20260920112249_read_validation_draw_periods.sql` |
| `20260920105827_admin_member_auth_profiles.sql` | `20260920112250_admin_member_auth_profiles.sql` |
| `20260921012052_enforce_active_member_notifications.sql` | `20260921014842_enforce_active_member_notifications.sql` |
| `20260921072423_dynamic_primary_worker_schedule.sql` | `20260921074128_dynamic_primary_worker_schedule.sql` |
| `20260921073500_retire_legacy_explore_entitlements.sql` | `20260921074825_retire_legacy_explore_entitlements.sql` |
| `20260921075225_refresh_watchdog_after_recovery.sql` | `20260921075707_refresh_watchdog_after_recovery.sql` |
| `20260921172000_matrix_status_canonical_entitlements.sql` | `20260921093104_matrix_status_canonical_entitlements.sql` |
| `20260921181500_reduce_minute_idle_work.sql` | `20260921102301_reduce_minute_idle_work.sql` |
| `20260921184500_split_expiry_reminder_scan.sql` | `20260921104200_split_expiry_reminder_scan.sql` |
| `20260921190000_fixed_bet_reminder_cron.sql` | `20260921111849_fixed_bet_reminder_cron.sql` |
| `20260921194000_event_driven_notification_dispatch.sql` | `20260921114248_event_driven_notification_dispatch.sql` |
| `20260921233500_admin_notification_delivery_health.sql` | `20260921154432_admin_notification_delivery_health.sql` |
| `20260921234200_admin_service_operation_evidence_v2.sql` | `20260921154446_admin_service_operation_evidence_v2.sql` |
| `20260922042500_notification_calendar_refresh_recovery.sql` | `20260921203045_notification_calendar_refresh_recovery.sql` |
| `20260922052500_marksix_calendar_fixed_check_times.sql` | `20260921212658_marksix_calendar_fixed_check_times.sql` |
| `20260922054000_marksix_calendar_tue_thu_sat_sun_safety.sql` | `20260921213733_marksix_calendar_tue_thu_sat_sun_safety.sql` |
| `20260922061000_marksix_calendar_dedicated_refresh.sql` | `20260921221415_marksix_calendar_dedicated_refresh.sql` |
| `20260922062500_marksix_calendar_mwf_2300.sql` | `20260921222326_marksix_calendar_mwf_2300.sql` |
| `20260921074500_materialized_algorithm_read_cache.sql` | `20260922002937_materialized_algorithm_read_cache.sql` |

### 13 recorded names without a same-named repository file

These are ledger-only candidates, not authorization to invent/recreate SQL or conclude a current object is absent. Read every recorded statement and inspect Git/PR intent before restoring any file. Missing history prevents treating this repository as a complete reconstruction source.

- `20260819235712_complete_matrix_admin_backend_tables.sql`
- `20260821102631_protect_last_super_admin_delete_safe.sql`
- `20260821161110_fix_activation_code_service_role_claim.sql`
- `20260821161913_add_system_job_recovery_state.sql`
- `20260821164129_add_system_job_atomic_recovery_lease.sql`
- `20260821165120_harden_system_job_recovery_lease.sql`
- `20260825102959_prepare_appdeploy_history_merge.sql`
- `20260825103738_remove_appdeploy_history_merge_rpc.sql`
- `20260831151548_block_tiangong_artifacts.sql`
- `20260831205221_matrix_tiangong_python_rpc.sql`
- `20260909095221_lottery_matrix_app_native_push.sql`
- `20260916003025_watchdog_active_analysis_state_least_greatest_fix.sql`
- `20260920112544_ensure_matrix_status_identity_get.sql`

### 3 repository names without a same-named ledger record

These may be pending, renamed under another name, superseded, or intentionally unapplied. Match full SQL and original PR/deployment evidence; do not apply or mark them automatically.

- `20260904032000_update_subscription_plan_prices.sql`
- `20260904040000_matrix_explore_prediction_number_group_order.sql`
- `20260924072000_sync_ecpay_payment_reversals.sql`

## Review record

The four directly affected test files passed: **35 tests, 0 failures**. The isolated index fixture also passed. Independent final review of `b9eaf27b…89812148` found no blockers. The reviewer independently decoded all 11 raw ledger statements, verified byte/hash evidence and remaining classifications, checked intervening migrations and executable references, and accepted the dependency order. Root review accepted that conclusion. This is a bounded history repair, not complete replay/deployment certification. GitHub checks remain the final merge gate.
