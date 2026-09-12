# Matrix Retention V2 rollout

The production source is `spyuilin688-sudo/lottery-matrix`, branch `main`.
Do not change algorithm rules or split validation JSONB in this rollout.

## Gates

1. Verify the newest three distinct completed draw periods per lottery. Each
   sorted version, and each eligible confirmed draw-order version except 天天樂,
   must contain explore, tianheng, tianyan, tiangong, and status artifacts.
2. Apply the additive active-version manifest migration. Missing expected slots
   abort the entire migration. The current resolver and cleanup remain in place.
3. Deploy ownership-controlled completion to all three production Railway
   services. Require SUCCESS for lottery-matrix, fantasy5-analysis, and
   heartfelt-generosity before changing the resolver or retention.
4. Apply the manifest resolver and one bounded cleanup core. Check preview:
   recent active versions and running versions must have zero deletable rows.
5. Run one batch and verify all five result RPCs and all three visible periods.
   Only then let hourly Supabase cleanup drain the remaining eligible backlog.

## Historical preflight repair

The 2026-09-12 preflight found complete v12 runs for 六合彩 026097 and 大樂透
115000085 with four artifact kinds; both lacked tianheng. Do not label those
versions complete enough for the manifest, and do not synthesize empty results.

For these two explicitly verified periods, the approved recovery invokes the
existing `app.worker._run_analysis` with stored history ending at that period,
once for SORTED_ORDER and once for DRAW_ORDER. Obtain versions from
`analysis_version_for_order`; keep the older versions for rollback. Use the
existing repository, source identity checks, analysis lease, owned writes, and
pipeline completion. Check all five artifacts after each successful stage.
No source refresh, card publication, notification dispatch, or cleanup is part
of this prerequisite.

Run this finite recovery as a temporary Railway pre-deploy command in the
existing lottery-matrix service, with an overall 2400-second alarm. It uses the
service's existing environment variables without exposing their values. The
normal start command and other service settings stay owned by their existing
configuration. Remove the temporary pre-deploy command after successful
completion or before abandoning the recovery attempt. Check actual database
rows as well as the final deployment state.

## Verification limits

Run only explicitly named tests for the changed files. Full repository pytest,
Vitest, Node, and admin test suites are forbidden for this task. GitHub merge
messages use `[skip actions]` because the current default CI runs full suites;
the targeted checks run separately. Deployment remains sourced from main.

Track deleted counts, superseded counts, active integrity, RPC health, and
latency. Physical database size may remain unchanged after DELETE while space
becomes reusable. Never run VACUUM FULL or delete lottery_draws or
matrix_analysis_runs as part of retention.
