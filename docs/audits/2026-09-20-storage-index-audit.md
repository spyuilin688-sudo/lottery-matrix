# Storage and unused-index audit — 2026-09-20

Scope: read-only production metadata/function inspection and repository source audit at baseline 3d1d296, Supabase project wcimzbbapfrdotjsfyxa. No data, schema, serializers, or retention settings changed. Repository AGENTS.md prohibits full tests; no tests were needed for this documentation-only audit.

## Fresh evidence

Captured 2026-09-20 19:23 UTC. Table counts below are pg_stat_user_tables estimates; sizes are exact allocated bytes at capture. MiB = 1,048,576 bytes.

| Table | Total bytes | Total MiB | Table including TOAST MiB | Index MiB | Estimated live rows |
| --- | ---: | ---: | ---: | ---: | ---: |
| matrix_analysis_artifacts | 95805440 | 91.37 | 91.30 | 0.07 | 135 |
| matrix_analysis_artifact_chunks | 131833856 | 125.73 | 125.03 | 0.70 | 1080 |
| matrix_explore_results | 602996736 | 575.06 | 510.50 | 64.56 | 135294 |
| matrix_tianheng_results | 270188544 | 257.67 | 236.14 | 21.53 | 55432 |

The reported ~575/258/126/91 MB broadly match current allocated relation sizes. Prior item/validation totals (73/201 and 34/92 MB) were not reproduced by expensive full scans: bounded SYSTEM samples instead found Explore 1,383 rows, mean item 526.84 bytes and validation 1,465.84 bytes; Tianheng 1,190 rows, mean item 594.95 bytes and validation 1,609.99 bytes. Samples are not exact table totals or guaranteed reclaimable space. Allocated relation size is not equal to live JSON payload totals.

## Duplication and consumer contract

- Writers: services/matrix-api/app/repositories/analysis_repository.py::_explore_result_records (1620), _tianheng_result_records (1582). Each copies public item keys into independently typed SQL columns, retains item JSON except exploreRange, and retains validationById[item_id].
- Shared duplicated fields: id/item_id, ruleCount/rule_count, consecutive, numberOrder/number_order, algorithmType/algorithm_type, highestStreak/highest_streak, predictionDistance/prediction_distance, predictionNumbers/prediction_numbers, lockedSourceIndex/locked_source_index, lockedSourcePeriod/locked_source_period, referenceOffset/reference_offset, referencePosition/reference_position. Explore additionally number and lockedPosition; Tianheng firstNumber/firstLockedPosition/secondNumber/secondLockedPosition. item additionally retains scopeClass and exploreDateOffset; these must not disappear if reconstructing JSON. exploreRange is deliberately stored outside public item.
- Current live private.matrix_explore_list_impl and matrix_tianheng_list_impl return filtered.item with request-specific explorePeriods/exploreDateOffset merged in. They filter/sort/group using the independent columns. Source: supabase/migrations/20260912164938_matrix_order_analysis_reads.sql. Therefore deleting item or duplicate SQL fields alone breaks existing reads or filtering.
- Validation is separately fetched on expansion; it is not disposable debug output. Current validation keys sampled: itemId/sourceA/ruleSets. src/features/MatrixValidation.tsx uses source number arrays, references, historical validation, rule formula details; src/matrix-algorithm-api.ts defines/normalizes this contract. MatrixStatusPages also opens Explore validation. SQL matrix_status_validation_source_get and the validation implementations read it. Removing historical steps requires a product decision; lossless internal normalization requires a compatibility reconstruction layer.
- Pipeline writes chunk then result rows before progress advancement (services/matrix-api/app/services/analysis_pipeline.py:85-145). Artifact chunks are zlib+base64 encoded full checkpoint items and validationById (repositories/artifact_chunks.py); they support resume, dependency hydration, and completed-result restoration. analysis_repository.py:1187-1220,1301-1376 materializes/restores from them.
- Explore and Tianheng artifacts are not another full copy: each has 25 manifest rows totaling only 3,900 payload bytes, all storage=chunks. Tianshu has 10 manifests/1,560 bytes. The artifact table's actual payload is mainly Tiangong (17,506,283 bytes), status (6,977,842), Tianyan (1,778,749); status compact_payload totals 261,454 bytes.
- Chunk logical payload bytes by kind: Explore 217 rows/51,693,104 bytes; Tianheng 535/27,389,128; Tianshu 328/752,924. These are compressed payload column sizes, not table allocation. Deleting all artifacts/chunks would break recovery and downstream APIs even though some information duplicates result rows.

### Concrete options

1. Lowest compatibility risk design candidate: retain typed query columns and reconstruct exact public item JSON in a private helper/view; keep scopeClass and any item-only fields in a compact residual payload. Preserve field presence, null semantics, numeric/string types, grouping and order, and request overrides. Stage backfill and dual-read equivalence tests before dropping old item storage. No savings estimate should be booked before a representative physical-size comparison.
2. Larger validation normalization is a separate design decision: deduplicate source/reference draw arrays or repeated rule-set data, then reconstruct the exact validation response. Must cover both number orders, range variants, current/historical validation and status drill-down. Purely removing details is not authorized.
3. Completed chunk retirement needs a deliberate recovery contract and full dependency graph: durable alternate reconstruction source or proven retention boundary, plus active-version/retained-period protection. Current restore_completed_results explicitly depends on chunks, so no chunk removal is currently safe.
4. Current table-level compression experiments may be evaluated on an isolated copy. They cannot promise immediate disk shrinkage; an operational rewrite/reclamation plan is separate from logical deduplication.

## Unused index findings

Fresh public-schema idx_scan=0 count is **48**, not 33: **22 primary/unique indexes and 26 nonunique**. Their total allocation is 4,456,448 bytes (4.25 MiB). Preserve all primary/unique indexes, including partial unique indexes enforcing idempotency and one pending transfer. stats_reset is NULL, so this snapshot does not establish a known observation window. Zero scans alone is not evidence of redundancy.

The two largest candidates are Explore prediction GIN (2,686,976 bytes) and Tianheng prediction GIN (942,080); combined 3.46 MiB. Tianshu GIN is only 40,960 bytes. Current Explore/Tianheng functions build a shared base CTE and apply prediction_numbers ? selected_number downstream, while their grouping/statistics consume the shared base too. This gives a concrete explanation to investigate for the zero scans, not proof that no query can use the indexes. Check EXPLAIN for real filter combinations and representative volumes, plus observed query workload, before a separate concurrent-drop migration. GIN removal would affect write overhead and at most these allocated index bytes, not hundreds of MB.

### Expiry indexes: keep

| Index table | idx_scan | Bytes |
| --- | ---: | ---: |
| matrix_explore_results | 1 | 2318336 |
| matrix_tianheng_results | 1 | 663552 |
| matrix_analysis_artifacts | 34 | 16384 |
| matrix_analysis_artifact_chunks | 29 | 98304 |
| matrix_tianshu_results | 59 | 32768 |
| members (plan_expires_at) | 46 | 16384 |
| activation_codes | 0 | 16384 |

The current private.matrix_analysis_cleanup_batch filters expires_at and orders victims by expires_at plus stable keys, protects retained versions, and uses bounded SKIP LOCKED batches. Its live definition includes all five result/artifact tables. The active matrix-analysis-retention cron runs at minute 17 hourly. Hence Matrix expiry indexes are live retention infrastructure, including low-frequency indexes with scan count 1. activation_codes_expires_at_idx is a different, tiny candidate: redemption checks expiry after lookup; dedicated expiry maintenance was not established.

### Complete 48-index disposition

Supporting paths for FK decisions: live pg_constraint confirms relationships; admin-data.ts performs payment/transfer/member joins; admin-credential-auth.ts manages sessions; admin-todos.ts manages admin-owned todos; push-notifications.ts reads logs. FK support is relevant to parent updates/deletes and is not proved unnecessary by ordinary read counters.

| Zero-scan index | Bytes | Disposition |
| --- | ---: | --- |
| matrix_explore_results_prediction_numbers_idx | 2686976 | Candidate only: GIN; current list filters numbers after shared base CTE. Require representative plans before separate migration. |
| matrix_tianheng_results_prediction_numbers_idx | 942080 | Candidate only: GIN; current list filters numbers after shared base CTE. Require representative plans before separate migration. |
| activation_codes_pkey | 40960 | Preserve: primary/unique integrity or idempotency contract. |
| matrix_tianshu_results_prediction_numbers_idx | 40960 | Candidate only: GIN; current list filters numbers after shared base CTE. Require representative plans before separate migration. |
| member_login_records_connection_idx | 40960 | Keep: latest-connections DISTINCT ON/order view; migration 20260907045216 and member admin enrichment. |
| activation_code_batches_created_at_idx | 16384 | Evaluate low priority: admin batch history ordering; 16 KiB. |
| activation_code_batches_id_duration_type_key | 16384 | Preserve: primary/unique integrity or idempotency contract. |
| activation_code_batches_pkey | 16384 | Preserve: primary/unique integrity or idempotency contract. |
| activation_code_batches_request_id_key | 16384 | Preserve: primary/unique integrity or idempotency contract. |
| activation_code_batches_requested_by_idx | 16384 | Preserve for now: confirmed FK supporting columns; low-use parent deletion/update paths matter. |
| activation_codes_batch_duration_idx | 16384 | Preserve for now: confirmed FK supporting columns; low-use parent deletion/update paths matter. |
| activation_codes_expires_at_idx | 16384 | Evaluate only: redemption checks expiry after code lookup; no dedicated expiry cleanup verified. |
| activation_codes_redeemed_by_member_id_idx | 16384 | Preserve for now: confirmed FK supporting columns; low-use parent deletion/update paths matter. |
| activation_codes_status_created_at_idx | 16384 | Keep pending filtered admin list plans: admin-data.ts activation-code filters/order. |
| admin_accounts_account_key | 16384 | Preserve: primary/unique integrity or idempotency contract. |
| admin_profiles_pkey | 16384 | Preserve: primary/unique integrity or idempotency contract. |
| admin_push_subscriptions_endpoint_key | 16384 | Preserve: primary/unique integrity or idempotency contract. |
| admin_sessions_admin_id_idx | 16384 | Preserve for now: confirmed FK supporting columns; low-use parent deletion/update paths matter. |
| admin_sessions_login_record_id_key | 16384 | Preserve: primary/unique integrity or idempotency contract. |
| admin_sessions_pkey | 16384 | Preserve: primary/unique integrity or idempotency contract. |
| admin_todos_admin_id_idx | 16384 | Preserve for now: confirmed FK supporting columns; low-use parent deletion/update paths matter. |
| admin_todos_pkey | 16384 | Preserve: primary/unique integrity or idempotency contract. |
| admin_transfer_push_jobs_admin_idx | 16384 | Preserve for now: confirmed FK supporting columns; low-use parent deletion/update paths matter. |
| admin_transfer_push_jobs_due_idx | 16384 | Keep: admin_transfer_push_claim pending/retry scheduling; migration 20260906171005. |
| admin_transfer_push_jobs_pkey | 16384 | Preserve: primary/unique integrity or idempotency contract. |
| admin_transfer_push_jobs_subscription_idx | 16384 | Preserve for now: confirmed FK supporting columns; low-use parent deletion/update paths matter. |
| admin_transfer_push_jobs_transfer_id_subscription_id_key | 16384 | Preserve: primary/unique integrity or idempotency contract. |
| audit_logs_pkey | 16384 | Preserve: primary/unique integrity or idempotency contract. |
| member_push_subscriptions_pkey | 16384 | Preserve: primary/unique integrity or idempotency contract. |
| members_current_plan_id_idx | 16384 | Preserve for now: confirmed FK supporting columns; low-use parent deletion/update paths matter. |
| members_invitation_code_normalized_idx | 16384 | Keep pending representative referral lookup plans; normalized referral RPC migration 20260902204215. |
| members_line_user_id_key | 16384 | Preserve: primary/unique integrity or idempotency contract. |
| members_referral_code_normalized_key | 16384 | Preserve: primary/unique integrity or idempotency contract. |
| members_registered_at_idx | 16384 | Keep pending admin member list ordering plans: admin-data.ts. |
| payments_member_id_idx | 16384 | Preserve for now: confirmed FK supporting columns; low-use parent deletion/update paths matter. |
| payments_pkey | 16384 | Preserve: primary/unique integrity or idempotency contract. |
| payments_plan_id_idx | 16384 | Preserve for now: confirmed FK supporting columns; low-use parent deletion/update paths matter. |
| payments_status_paid_at_idx | 16384 | Keep pending admin payment/dashboard filter/order plans: admin-data.ts. |
| payments_transfer_request_id_unique | 16384 | Preserve: primary/unique integrity or idempotency contract. |
| plans_name_key | 16384 | Preserve: primary/unique integrity or idempotency contract. |
| push_delivery_logs_pkey | 16384 | Preserve: primary/unique integrity or idempotency contract. |
| push_delivery_logs_subscription_id_idx | 16384 | Preserve for now: confirmed FK supporting columns; low-use parent deletion/update paths matter. |
| push_delivery_logs_user_id_idx | 16384 | Preserve for now: confirmed FK supporting columns; low-use parent deletion/update paths matter. |
| transfer_requests_member_id_idx | 16384 | Preserve for now: confirmed FK supporting columns; low-use parent deletion/update paths matter. |
| transfer_requests_one_pending_per_member | 16384 | Preserve: primary/unique integrity or idempotency contract. |
| transfer_requests_pkey | 16384 | Preserve: primary/unique integrity or idempotency contract. |
| transfer_requests_plan_id_idx | 16384 | Preserve for now: confirmed FK supporting columns; low-use parent deletion/update paths matter. |
| transfer_requests_status_submitted_at_idx | 16384 | Keep pending admin transfer queue filter/order plans: admin-data.ts. |

## Verification and limits

Read pg_stat_user_tables, pg_stat_user_indexes+pg_index, information_schema.columns, selected pg_proc definitions, pg_constraint, and cron.job. Bounded result sampling used TABLESAMPLE SYSTEM (1% Explore/2% Tianheng), REPEATABLE(20), LIMIT 1500; small artifact/chunk tables were grouped once for payload sizing. No retention preview or destructive cleanup function was executed. No full result-table size scans, EXPLAIN ANALYZE, application mutations, deployments or full tests were performed. The initial multi-statement metadata call exposed only its final schema result; later single JSON aggregate queries produced the reported evidence.

Verdict: duplication is confirmed; safe live removal is not established. Index audit is complete as inventory/classification, with concrete GIN candidates and clear keep decisions; no index is approved for automatic removal without workload/plan verification.

