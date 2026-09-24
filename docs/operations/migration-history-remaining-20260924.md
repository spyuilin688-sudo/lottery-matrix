# Remaining migration-history reconciliation — 2026-09-24

Base main: `3142a8caa19f28b8e7e7778fda7527f9a34825ca` ([#869](https://github.com/spyuilin688-sudo/lottery-matrix/pull/869)). Production project: `wcimzbbapfrdotjsfyxa`.

## Result and scope

- Renamed all remaining **113** same-name migration files to the version recorded in production. Every renamed file retains exactly its base-main SQL bytes.
- Restored all **13** ledger-only files from the complete recorded statement bytes. Each record contains one statement-array element; all its SQL commands were retained. MD5, byte count and decoded UTF-8 were checked before copying.
- All **254** production version/name pairs now have one corresponding repository file. No duplicate version prefixes remain. The two previous `20260830223000` files now use `20260830131255` and `20260830141227`.
- Updated executable filename/stem references in tests and fixtures. No frontend, API or schedule implementation was changed. Existing deployments and production data were not modified.
- The **3** repository-only files remain unchanged and explicitly classified below. They are not marked applied, deleted, retimestamped, or deployed by this repair.

**This resolves the captured version-name and missing-file discrepancies, not complete SQL-content equality or fresh-database replay. Do not bulk `db push` or mass-repair the live ledger.**

## Decisions and evidence

Ruling: preserve existing repository SQL during the 113 renames — comparison found earlier recorded SQL without later repository security/correctness fixes. Replacing all historical bodies with the recorded variants would remove those fixes. The cost of this choice is explicit content drift, not an unsupported claim of byte identity.

Of the 254 corresponding files, 155 match recorded SQL bytes exactly. The other 99 are pre-existing differences: 55 terminal-newline differences, 7 whitespace differences, and 37 other differences (including comments, wrappers and substantive historical fixes). No existing migration SQL is edited in this follow-up. The earlier #869 four-body correction remains unchanged.

Examples of substantive pre-existing differences include the DELETE-safe last-admin guard, active-member checks in member RPCs, fail-closed entitlement tests, unqualified PostgreSQL special expressions, chronological Explore ordering, and activation-batch foreign-key deletion behavior. Version/name identity is verified independently from SQL equality.

Ruling: restore all 13 recorded files, including the temporary AppDeploy import function and its subsequent removal — omitting an applied then removed migration would leave a false history gap. These are historical SQL files, not commands to execute against production.

Ruling: retain all three unrecorded files — neither naming nor a matching current object proves an applied migration record. Deleting, inventing a timestamp, or marking them applied would lose intent or fabricate history.

[Machine-readable evidence](migration-history-reconciled-20260924.json) contains every recorded version/name, repo SHA-256, recorded statement MD5, exact-byte status, rename origin and restoration marker. The source was read-only `SELECT` from `supabase_migrations.schema_migrations`; full records were decoded and hash checked. The older [#869 evidence](migration-history-evidence-20260924.json) remains an unchanged historical snapshot.

## Three unrecorded files

| File under `supabase/migrations/` | Confirmed evidence | Disposition |
|---|---|---|
| `20260904032000_update_subscription_plan_prices.sql` | [#287](https://github.com/spyuilin688-sudo/lottery-matrix/pull/287) and integrated commit `d1385170`; no same-named ledger entry. Read-only current plans are month 2880/30 days, quarter 5580/90 days, year 17800/365 days, matching this SQL. | Preserve. Matching data does not establish how or when these writes ran. |
| `20260904040000_matrix_explore_prediction_number_group_order.sql` | [#284](https://github.com/spyuilin688-sudo/lottery-matrix/pull/284) and integrated commit `d1385170`; no same-named ledger entry. This file defines a v12 reader; the current live `matrix_explore_list(jsonb)` delegates to `private.matrix_request_guard` and contains no v12 literal. | Preserve as unrecorded legacy intent; do not replay an obsolete reader over the current one. |
| `20260924072000_sync_ecpay_payment_reversals.sql` | [#863](https://github.com/spyuilin688-sudo/lottery-matrix/pull/863) merged this new behavior. No same-named ledger entry; read-only `to_regprocedure` returns null for `public.sync_ecpay_order_reversal()`, and no noninternal payments trigger is present. | Pending production change, not a filename mismatch. Deployment is outside this read-only history repair. |

## Restored files and dependency groups

| Recorded filename | History role |
|---|---|
| `20260819235712_complete_matrix_admin_backend_tables.sql` | Admin backend table completion |
| `20260821102631_protect_last_super_admin_delete_safe.sql` | DELETE-safe super-admin guard |
| `20260821161110_fix_activation_code_service_role_claim.sql` | Service-role activation-code deletion fix |
| `20260821161913_add_system_job_recovery_state.sql` | Recovery counters/state |
| `20260821164129_add_system_job_atomic_recovery_lease.sql` | Atomic recovery lease |
| `20260821165120_harden_system_job_recovery_lease.sql` | Hardened recovery lease and stage reporting |
| `20260825102959_prepare_appdeploy_history_merge.sql` | Temporary AppDeploy history import RPC |
| `20260825103738_remove_appdeploy_history_merge_rpc.sql` | Removal of temporary import RPC |
| `20260831151548_block_tiangong_artifacts.sql` | Historical Tiangong artifact restriction |
| `20260831205221_matrix_tiangong_python_rpc.sql` | Tiangong Python RPC before its subsequent replacement |
| `20260909095221_lottery_matrix_app_native_push.sql` | Native push tables and private/service RPC boundaries |
| `20260916003025_watchdog_active_analysis_state_least_greatest_fix.sql` | LEAST/GREATEST watchdog correction |
| `20260920112544_ensure_matrix_status_identity_get.sql` | General status identity RPC restored after custom-status retirement |

The recorded sequence is preserved across the complete 254-file set. In particular, native-push tables precede their foreign-key indexes, recovery state precedes lease hardening, temporary import creation precedes removal, and the general status identity RPC is restored after retirement. A diagnostic comparison of latest CREATE FUNCTION owners over all recorded files matched for public/private functions; the only raw-text owner difference was the temporary `pg_temp.assert_rpc` validation helper. This is not a substitute for executing a complete reset.

## Renames

All paths are relative to `supabase/migrations/`. SQL bytes remain unchanged for every row. The content comparison column describes the difference from recorded SQL, not changes made by this PR.

| Previous filename | Recorded/current filename | Recorded SQL comparison |
|---|---|---|
| `20260813175200_relax_member_expiry_check.sql` | `20260813190048_relax_member_expiry_check.sql` | terminal-newline |
| `20260820174733_secure_admin_backend_integration.sql` | `20260820174842_secure_admin_backend_integration.sql` | whitespace |
| `20260821212800_matrix_custom_status_api_only_mutations.sql` | `20260821012728_matrix_custom_status_api_only_mutations.sql` | terminal-newline |
| `20260821190000_admin_operations_status.sql` | `20260821101646_admin_operations_status.sql` | terminal-newline |
| `20260821193000_admin_atomic_member_operations.sql` | `20260821102531_admin_atomic_member_operations.sql` | whitespace |
| `20260821194500_protect_last_super_admin.sql` | `20260821102612_protect_last_super_admin.sql` | CONTENT |
| `20260821220000_member_online_tracking.sql` | `20260821115603_member_online_tracking.sql` | terminal-newline |
| `20260821223000_skip_super_admin_activity_logs.sql` | `20260821120037_skip_super_admin_activity_logs.sql` | terminal-newline |
| `20260821224500_admin_atomic_activation_code_delete.sql` | `20260821145754_admin_atomic_activation_code_delete.sql` | terminal-newline |
| `20260821225000_fix_admin_activation_code_role_check.sql` | `20260821150025_fix_admin_activation_code_role_check.sql` | terminal-newline |
| `20260824180000_matrix_fastapi_backend.sql` | `20260824094431_matrix_fastapi_backend.sql` | identical |
| `20260824190427_sync_line_members_from_auth.sql` | `20260824190505_sync_line_members_from_auth.sql` | identical |
| `20260824192513_sync_line_display_names.sql` | `20260824192549_sync_line_display_names.sql` | identical |
| `20260824192612_sync_line_identity_profile_updates.sql` | `20260824192630_sync_line_identity_profile_updates.sql` | identical |
| `20260824212000_index_lottery_draws_history_order.sql` | `20260824211820_index_lottery_draws_history_order.sql` | whitespace |
| `20260825060000_matrix_analysis_artifact_chunks.sql` | `20260824223022_matrix_analysis_artifact_chunks.sql` | identical |
| `20260827165000_matrix_explore_rpc.sql` | `20260827091443_matrix_explore_rpc.sql` | CONTENT |
| `20260829090000_member_pwa_rpc.sql` | `20260829181805_member_pwa_rpc.sql` | CONTENT |
| `20260829093000_matrix_result_rpc.sql` | `20260829181807_matrix_result_rpc.sql` | CONTENT |
| `20260829103000_security_review_fixes.sql` | `20260829192625_security_review_fixes.sql` | CONTENT |
| `20260829194000_compact_matrix_status_sources.sql` | `20260829193611_compact_matrix_status_sources.sql` | identical |
| `20260829195500_backfill_compact_matrix_status_sources.sql` | `20260829194135_backfill_compact_matrix_status_sources.sql` | identical |
| `20260829205227_free_member_profile_label.sql` | `20260829205310_free_member_profile_label.sql` | terminal-newline |
| `20260829205500_lock_member_profile_rpc_to_authenticated.sql` | `20260829205413_lock_member_profile_rpc_to_authenticated.sql` | terminal-newline |
| `20260830060000_manual_bank_transfer.sql` | `20260829223804_manual_bank_transfer.sql` | identical |
| `20260830075300_rename_member_payment_history_rpc.sql` | `20260829225358_rename_member_payment_history_rpc.sql` | whitespace |
| `20260830083000_fix_payment_history_and_audit_logs.sql` | `20260829232518_fix_payment_history_and_audit_logs.sql` | terminal-newline |
| `20260830144700_mobile_push_notifications.sql` | `20260830095443_mobile_push_notifications.sql` | identical |
| `20260830183000_mobile_push_notification_indexes.sql` | `20260830103236_mobile_push_notification_indexes.sql` | identical |
| `20260830220000_fix_matrix_v6_rpc_nullif.sql` | `20260830130523_fix_matrix_v6_rpc_nullif.sql` | CONTENT |
| `20260830221500_fix_matrix_v6_rpc_coalesce.sql` | `20260830130914_fix_matrix_v6_rpc_coalesce.sql` | identical |
| `20260830223000_fix_matrix_entitlement_coalesce.sql` | `20260830131255_fix_matrix_entitlement_coalesce.sql` | identical |
| `20260830223000_fix_mobile_push_rpc_nullif.sql` | `20260830141227_fix_mobile_push_rpc_nullif.sql` | identical |
| `20260831030000_tiangong_two_stage_ready2_only.sql` | `20260830192202_tiangong_two_stage_ready2_only.sql` | identical |
| `20260831213000_matrix_python_v7_explore_rpc.sql` | `20260830235651_matrix_python_v7_explore_rpc.sql` | identical |
| `20260831235800_repair_qualified_coalesce.sql` | `20260831000718_repair_qualified_coalesce.sql` | identical |
| `20260901000000_matrix_python_v8_explore_rpc.sql` | `20260831130348_matrix_python_v8_explore_rpc.sql` | terminal-newline |
| `20260901010000_restore_matrix_explore_date_offsets.sql` | `20260831130405_restore_matrix_explore_date_offsets.sql` | terminal-newline |
| `20260901100000_matrix_explore_v2_ranges.sql` | `20260901115059_matrix_explore_v2_ranges.sql` | identical |
| `20260901153758_admin_transfer_review_rpc.sql` | `20260901154008_admin_transfer_review_rpc.sql` | identical |
| `20260901164500_restore_super_admin_activity_log_exemption.sql` | `20260901161953_restore_super_admin_activity_log_exemption.sql` | whitespace |
| `20260902010000_matrix_explore_v11_rpc.sql` | `20260901172741_matrix_explore_v11_rpc.sql` | CONTENT |
| `20260902020000_matrix_explore_v11_draw_order.sql` | `20260901174019_matrix_explore_v11_draw_order.sql` | terminal-newline |
| `20260902030000_matrix_explore_v11_draw_order_forward.sql` | `20260901174618_matrix_explore_v11_draw_order_forward.sql` | CONTENT |
| `20260902031000_matrix_latest_run_draw_order.sql` | `20260901175025_matrix_latest_run_draw_order.sql` | identical |
| `20260902064500_admin_revenue_reset_baseline.sql` | `20260902065226_admin_revenue_reset_baseline.sql` | CONTENT |
| `20260902070030_limit_admin_revenue_settings_privileges.sql` | `20260902065309_limit_admin_revenue_settings_privileges.sql` | terminal-newline |
| `20260902071500_admin_revenue_reset_rpc.sql` | `20260902070157_admin_revenue_reset_rpc.sql` | terminal-newline |
| `20260902070000_worker_freshness_status.sql` | `20260902070913_worker_freshness_status.sql` | terminal-newline |
| `20260902040000_matrix_explore_v12_rpc.sql` | `20260902072734_matrix_explore_v12_rpc.sql` | terminal-newline |
| `20260902050000_matrix_explore_v12_cleanup.sql` | `20260902072845_matrix_explore_v12_cleanup.sql` | terminal-newline |
| `20260902081857_fix_activation_code_plan_entitlements.sql` | `20260902091404_fix_activation_code_plan_entitlements.sql` | identical |
| `20260902190500_repair_pg_catalog_greatest.sql` | `20260902190446_repair_pg_catalog_greatest.sql` | CONTENT |
| `20260902193000_repair_qualified_sql_constructs.sql` | `20260902190724_repair_qualified_sql_constructs.sql` | identical |
| `20260902194500_repair_admin_transfer_audit_actor.sql` | `20260902190849_repair_admin_transfer_audit_actor.sql` | identical |
| `20260903042000_admin_credential_login_schema.sql` | `20260902203534_admin_credential_login_schema.sql` | CONTENT |
| `20260902204215_member_referral_rpc.sql` | `20260902223653_member_referral_rpc.sql` | identical |
| `20260904050000_normalize_manual_transfer_review.sql` | `20260904034400_normalize_manual_transfer_review.sql` | CONTENT |
| `20260904103000_add_matrix_watchdog_leases.sql` | `20260904104229_add_matrix_watchdog_leases.sql` | identical |
| `20260905090000_allow_referral_code_after_payment.sql` | `20260904183827_allow_referral_code_after_payment.sql` | terminal-newline |
| `20260905172358_add_matrix_card_cleanup_lease.sql` | `20260905181320_add_matrix_card_cleanup_lease.sql` | identical |
| `20260906145500_line_pwa_handoff_diagnostics.sql` | `20260906135233_line_pwa_handoff_diagnostics.sql` | identical |
| `20260910105312_admin_atomic_activation_batch.sql` | `20260910123427_admin_atomic_activation_batch.sql` | CONTENT |
| `20260910233000_matrix_tianheng.sql` | `20260910224706_matrix_tianheng.sql` | identical |
| `20260914084000_cover_foreign_key_indexes.sql` | `20260914010516_cover_foreign_key_indexes.sql` | CONTENT |
| `20260914014411_secure_visitor_counting.sql` | `20260914015017_secure_visitor_counting.sql` | identical |
| `20260914190000_confirmed_member_permission_fixes.sql` | `20260914184931_confirmed_member_permission_fixes.sql` | CONTENT |
| `20260915150500_guest_algorithm_access.sql` | `20260915072007_guest_algorithm_access.sql` | terminal-newline |
| `20260915193500_allow_google_member_bootstrap.sql` | `20260915114856_allow_google_member_bootstrap.sql` | terminal-newline |
| `20260915154500_tianheng_requires_login.sql` | `20260915154417_tianheng_requires_login.sql` | terminal-newline |
| `20260916090000_reconcile_confirmed_same_period_draws.sql` | `20260915195954_reconcile_confirmed_same_period_draws.sql` | identical |
| `20260916093000_skip_empty_notification_dispatch.sql` | `20260915214936_skip_empty_notification_dispatch.sql` | CONTENT |
| `20260916094500_runtime_idle_schedule_guards.sql` | `20260916002910_runtime_idle_schedule_guards.sql` | CONTENT |
| `20260916095000_watchdog_active_analysis_state.sql` | `20260916002923_watchdog_active_analysis_state.sql` | CONTENT |
| `20260916100500_notification_event_exists_guard.sql` | `20260916002935_notification_event_exists_guard.sql` | CONTENT |
| `20260916103000_member_profile_member_id.sql` | `20260916014316_member_profile_member_id.sql` | terminal-newline |
| `20260916110000_native_notification_dispatch_guard.sql` | `20260916025212_native_notification_dispatch_guard.sql` | CONTENT |
| `20260916110100_cron_runtime_retention.sql` | `20260916025223_cron_runtime_retention.sql` | CONTENT |
| `20260916110200_notification_fanout_delivery_guard.sql` | `20260916025241_notification_fanout_delivery_guard.sql` | terminal-newline |
| `20260916110300_matrix_status_compact_source.sql` | `20260916025300_matrix_status_compact_source.sql` | CONTENT |
| `20260916112000_canonical_draw_day_runtime.sql` | `20260916032653_canonical_draw_day_runtime.sql` | terminal-newline |
| `20260916095200_admin_session_login_record_link.sql` | `20260916101659_admin_session_login_record_link.sql` | terminal-newline |
| `20260916132000_optimize_matrix_status_compact_read.sql` | `20260916130351_optimize_matrix_status_compact_read.sql` | CONTENT |
| `20260916134500_precompute_matrix_status_compact_payload.sql` | `20260916131439_precompute_matrix_status_compact_payload.sql` | CONTENT |
| `20260916140000_admin_member_display_name_search.sql` | `20260916133043_admin_member_display_name_search.sql` | terminal-newline |
| `20260917002000_optimize_matrix_draw_query_read_path.sql` | `20260916161309_optimize_matrix_draw_query_read_path.sql` | CONTENT |
| `20260917040000_guard_idle_watchdog_http.sql` | `20260916193833_guard_idle_watchdog_http.sql` | CONTENT |
| `20260917165000_matrix_custom_status_results.sql` | `20260917171330_matrix_custom_status_results.sql` | CONTENT |
| `20260917170500_matrix_status_identity_get.sql` | `20260917171346_matrix_status_identity_get.sql` | CONTENT |
| `20260920060000_watchdog_schedule_evidence.sql` | `20260920051031_watchdog_schedule_evidence.sql` | identical |
| `20260920091230_ecpay_review_login.sql` | `20260920094607_ecpay_review_login.sql` | identical |
| `20260920100000_manual_refresh_jobs.sql` | `20260920102528_manual_refresh_jobs.sql` | identical |
| `20260920105700_admin_dashboard_summary.sql` | `20260920112247_admin_dashboard_summary.sql` | identical |
| `20260920105819_optimize_status_summary_reads.sql` | `20260920112248_optimize_status_summary_reads.sql` | identical |
| `20260920105823_read_validation_draw_periods.sql` | `20260920112249_read_validation_draw_periods.sql` | identical |
| `20260920105827_admin_member_auth_profiles.sql` | `20260920112250_admin_member_auth_profiles.sql` | identical |
| `20260921012052_enforce_active_member_notifications.sql` | `20260921014842_enforce_active_member_notifications.sql` | identical |
| `20260921072423_dynamic_primary_worker_schedule.sql` | `20260921074128_dynamic_primary_worker_schedule.sql` | identical |
| `20260921073500_retire_legacy_explore_entitlements.sql` | `20260921074825_retire_legacy_explore_entitlements.sql` | CONTENT |
| `20260921075225_refresh_watchdog_after_recovery.sql` | `20260921075707_refresh_watchdog_after_recovery.sql` | identical |
| `20260921172000_matrix_status_canonical_entitlements.sql` | `20260921093104_matrix_status_canonical_entitlements.sql` | terminal-newline |
| `20260921181500_reduce_minute_idle_work.sql` | `20260921102301_reduce_minute_idle_work.sql` | identical |
| `20260921184500_split_expiry_reminder_scan.sql` | `20260921104200_split_expiry_reminder_scan.sql` | identical |
| `20260921190000_fixed_bet_reminder_cron.sql` | `20260921111849_fixed_bet_reminder_cron.sql` | identical |
| `20260921194000_event_driven_notification_dispatch.sql` | `20260921114248_event_driven_notification_dispatch.sql` | identical |
| `20260921233500_admin_notification_delivery_health.sql` | `20260921154432_admin_notification_delivery_health.sql` | terminal-newline |
| `20260921234200_admin_service_operation_evidence_v2.sql` | `20260921154446_admin_service_operation_evidence_v2.sql` | terminal-newline |
| `20260922042500_notification_calendar_refresh_recovery.sql` | `20260921203045_notification_calendar_refresh_recovery.sql` | CONTENT |
| `20260922052500_marksix_calendar_fixed_check_times.sql` | `20260921212658_marksix_calendar_fixed_check_times.sql` | identical |
| `20260922054000_marksix_calendar_tue_thu_sat_sun_safety.sql` | `20260921213733_marksix_calendar_tue_thu_sat_sun_safety.sql` | identical |
| `20260922061000_marksix_calendar_dedicated_refresh.sql` | `20260921221415_marksix_calendar_dedicated_refresh.sql` | identical |
| `20260922062500_marksix_calendar_mwf_2300.sql` | `20260921222326_marksix_calendar_mwf_2300.sql` | identical |
| `20260921074500_materialized_algorithm_read_cache.sql` | `20260922002937_materialized_algorithm_read_cache.sql` | identical |

## Plan, verification and review

1. Capture complete live ledger metadata and compare every candidate statement; inspect missing-file roles and unrecorded-file intent. Completed.
2. Rename proven name mappings without SQL edits, restore the recorded missing files, and update executable references. Completed.
3. Check all old paths are absent, every recorded name is unique, renamed SHA-256 values equal the base, and restored bytes equal the recorded MD5. Completed.
4. Execute only directly affected Node, admin and Python tests; review the complete diff; inspect current main and CI before merge. In progress.

The new `tests/migration-history-reconciliation.test.mjs` checks canonical recorded order, unique versions, preserved/restored hashes, and explicit unrecorded-file treatment. An isolated PGlite test verifies the restored general-status identity RPC without custom-status tables, including service-only grants and invalid-input rejection.

Initial local execution required the repository's `--experimental-transform-types` flag for the notification receipt test; the corrected focused command was used. The base Python interpreter has no pytest, so an isolated `uv run --with pytest --no-project` environment is used for the two changed Python contract files. No production SQL, full test suite, or database-history repair is run.

Local verification: 47 explicitly selected Node files exercised; the receipt test was rerun with the required transform flag, and two source-reading tests were rerun after materializing the sparse checkout dependencies. All these files now pass. The two changed Python files pass 14 tests. CI will independently select and execute the affected Node/admin/Python tests before merge.

Ruling: correct the existing qualified-construct guard test, not historical SQL. The same blanket historical scan failed on base main at `member_profile_member_id`; a later recorded `fix_member_profile_coalesce` already fixes it. The guard now recognizes that one explicit historical pair, while retaining the prohibition for every other later migration. A new PGlite regression first observes the old function fail, then applies the recorded repair and verifies a valid free-member profile. The focused history/construct tests pass 8 tests. No SQL is edited or invalid behavior exempted at runtime.

Independent review found three stale filename references in `backend/read-efficiency-sql.test.ts`, which was initially absent from the sparse checkout. All three were corrected, and a complete scan of materialized tracked executable files found no further old filename/stem references. The explicit six-case SQL test is included in the fix-pass verification and CI selection.

One standard `git diff --check` warning is intentionally retained: a terminal blank line in restored `20260831205221_matrix_tiangong_python_rpc.sql` is part of the exact recorded bytes. All other whitespace checks pass; the source hash takes precedence over reformatting historical SQL.

Final independent review found no additional blocker. Root accepted the single P2 stale-reference finding and fixed it in one pass: the original backend fixture failed with ENOENT on the renamed tree, while the corrected explicit file passed all 6 cases using an isolated Node Vitest configuration. Normal repository configuration remains required in CI. The four unmaterialized tracked source files (functions/admin/api/[[path]].ts, public/intro/visitor-stats.js, public/push-service-worker.js, worker/index.js) were additionally fetched from base main and contained no old references.

The CI scope selector chooses 51 Node files, 10 backend Vitest files and 2 Python files; no unrelated suite is selected. Production remains read-only. CI is the final merge gate.
