# Production hardening verification — 2026-09-14

Baseline GitHub `main`: `b44c14309a48067f4e9609faf59b0d7ae67226df`.

## Regions and measured latency

- Railway production services run in `ams`; Supabase `wcimzbbapfrdotjsfyxa` runs in `ap-southeast-1`.
- Sampled Railway proxy requests had p50 865 ms and p95 2,189 ms; four 503 responses clustered near the 6 s database timeout. CPU samples showed no saturation.
- Do not add RAM, replicas, workers, or a cache based on this sample. First deploy the removed Fantasy5 full-history read and structured timing, then compare DB/API/write timing from the same workload before moving Railway region.

## SECURITY DEFINER decision matrix

All 52 application tables have RLS enabled. The 48 no-policy tables are intentionally default-deny and were not changed. Of 133 `SECURITY DEFINER` functions, 131 use an empty fixed `search_path`; the two online-session functions use fixed `public,pg_temp`. No function is executable by `PUBLIC`.

| Caller | Intended boundary | Verified action |
| --- | --- | --- |
| anon | Public Explore/Tianheng and permission-setting reads only | Five intentionally anonymous RPCs retained |
| authenticated/member | Own profile, Matrix results allowed by entitlements, own notification/config data | 31 product RPC grants retained; custom-status reset now enforces the same entitlement as save |
| expired/disabled member | No paid/custom mutation | Disabled-member legacy web-push functions and queued delivery remain follow-up work |
| admin | Admin RPCs only after admin role/session checks | No grants widened |
| service_role | Worker/dispatch/repair operations | Existing service-only grants retained |
| user A vs user B | Never read or mutate another member's row | Direct authenticated table ACL on `member_push_subscriptions` narrowed to SELECT; RLS remains the row fence |

## Free/paid product matrix

Production flag `registered_member_free_access=true` currently grants enabled members the free-mode result scope. `Matrix Status` remains outside that flag.

| Feature | Free mode | Paid/Pro | Backend reality |
| --- | --- | --- | --- |
| Explore / full range / Tianheng / Tianyan | Enabled member while free-access flag is on | Plan entitlements | RPC entitlement helper enforces this |
| Matrix Status | Not included by free-access flag | Plan entitlement | RPC enforced |
| Custom Status | No | Eligible Pro plan | Save and reset both enforced |
| Notifications | Active member settings | Active paid member when free mode is off | Backend allows active free members while free mode is on |
| Cards / history / same-number / comparison | Public or active-member scope by existing RPC | Same plus entitled ranges | Existing RPCs retained |

Known copy mismatches: the Guide still labels 13/full range and notifications as Pro without explaining free mode; Tianyan free-mode availability is not disclosed; generic paid-plan copy says all Pro features although plan entitlements differ. Product wording needs an approved pricing message before alteration.

## Backup and restore runbook

The connector does not expose hosted backup/PITR/Auth dashboard settings, so automatic-backup retention, PITR state, latest backup time, leaked-password protection, provider toggles, and callback allowlists were not guessed or changed. The migration ledger also has production/local drift and cannot yet be claimed as a complete rebuild source.

1. Stop Railway worker writes and notification dispatch; leave read-only traffic available if safe.
2. Record the incident start, last known-good time, affected tables/rows, current Git SHA, and Supabase project ref.
3. Choose PITR for a precise supported recovery point; otherwise choose the newest automatic backup before the incident. Restore to an isolated recovery project when the plan permits.
4. Validate schema/migration level, row counts, latest draw periods, analysis run/artifact references, member ownership, and notification outbox idempotency without sending notifications.
5. Reconcile only the affected data, then re-enable API followed by workers and dispatch. Watch duplicate keys, queue backlog, failed jobs, and latest-period reads.

Do not test this runbook by deleting production data. GitHub source and Railway configuration are not database backups; export their configuration separately after secret-safe review.

## Capacity snapshot

| Table | Total | Heap | Index | Estimated rows |
| --- | ---: | ---: | ---: | ---: |
| `matrix_explore_results` | 638.8 MB | 229.2 MB | 67.7 MB | 150,569 |
| `matrix_tianheng_results` | 225.3 MB | 69.0 MB | 18.7 MB | 65,307 |
| `matrix_analysis_artifact_chunks` | 152.5 MB | 0.3 MB | 0.7 MB | 802 |
| `matrix_analysis_artifacts` | 119.0 MB | 0.06 MB | 0.07 MB | 94 |

Recent creation counts are bursty rather than a stable daily rate: Explore added
99,603 rows on September 12 and 7,526 on September 14; Tianheng added 46,017 and
3,529 respectively. Large artifact totals are mostly TOAST payload, not heap or
index. Current v14 RPC/repair paths still reference these tables and the existing
three-day retention is active, so no rows or duplicate cleanup job were added.

## PWA release identity

After deployment, open `/__matrix_pwa_version__` from a controlled page. The response identifies the Git source SHA, worker/cache build ID, and exact JS/CSS asset paths loaded by the active Service Worker. Compare the SHA with GitHub `main` and the Cloudflare deployment commit before investigating CSS.
