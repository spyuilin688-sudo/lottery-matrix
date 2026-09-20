# Dynamic worker schedule implementation plan

> **For agentic workers:** Use superpowers:executing-plans. This ledger records a partial implementation, not a production cutover.

Goal: implement the user's two Taipei time windows and completion-dependent next start, then connect Railway only after resolving recovery ownership.
Base: freshly verified GitHub main 39c56ef373cb61821df8db7e371a35e824958916.

## Requirements

- Evening shared worker: 20:30–01:00 every 10 minutes; after 01:00 every 30 minutes until 06:00. All due lotteries complete => next 20:30. No-draw lotteries need not wait.
- Fantasy5 analysis: 09:30–14:00 every 10 minutes; after 14:00 every 30 minutes until 18:00. Complete => next 09:30.
- Fantasy5 crawler already exits after acquisition; do not change its start times or retry limit.
- Keep permission updates at 30 seconds. No new polling controller.
- Completion must be explicit, current-cycle and confirmed; unknown calendar/data must never be treated as complete.
- Only explicitly named relevant tests, per AGENTS.md. No full suite.

## Task 1: Pure timing policy

Files: app/worker_schedule.py, tests/test_worker_schedule.py under services/matrix-api.
Interface: plan_run(group, now, complete=False) -> RunPlan(active, cycle_date, next_run).
No I/O; consumers must provide verified current-cycle completion.

- [x] Write boundary tests: evening before/start/midnight/01:00/01:30/06:00; morning before/start/14:00/14:30/18:00; completion; UTC conversion; year rollover; naive datetime rejected.
- [x] Run `python -m pytest tests/test_worker_schedule.py -q`; expected missing module / unimplemented policy.
- [x] Implement frozen RunPlan plus explicit evening/fantasy5 windows. Next run is strictly after now on the fixed clock grid; no catch-up bursts.
- [x] Run `python -m pytest tests/test_worker_schedule.py tests/test_schedule.py tests/test_fantasy5_railway_job.py -q`; expected all pass.

## Task 2: Integration gate

Existing watchdog can recover after these stop times. The user's explicit times refer to primary workers; whether to suppress exceptional recovery was not explicitly stated. Resolve this user-visible behavior before editing watchdog or claiming all work stops.
Worker service lacks a Railway project token; do not copy secrets into source or logs.
A lone daily cron at an intermediate slot does not guarantee the next daily start after a crash. Resolve this together with existing recovery, without silently adding another controller.
Do not switch production cron or remove repository cron until the whole control flow is ready.

## Review focus

- Cross-midnight cycle date must refer to the preceding evening.
- Completion must not skip tomorrow or schedule in the past.
- Cutoff ends admission of new work; does not kill in-flight work.
- Missing/failing control API cannot be reported as successful stop.
- Existing watchdog must not silently defeat rest windows.

## Progress / decisions

- Baseline: 22 relevant existing tests passed.
- Ruling: use 06:00/18:00 as the time to stop admitting new work, consistent with the prior design proposal; included in tests and must be disclosed before cutover. If different intended endpoint, only boundary tests/policy change.
- Ruling: old uncommitted design/probe files were removed by workspace maintenance; exact Library filename searches returned no matching files. Reconstructed this plan from the conversation, not from recovered original file bytes.
- Ruling: native execution continues under user's repeated continue instruction; do not request another generic execution approval.

- Task 1: complete, RED missing app.worker_schedule; GREEN 44 passed in 0.10s (22 new, 22 existing). Used existing Python virtualenv; tests imported this worktree.
- Task 2: not implemented. No entrypoint, Railway config, credential, DB, watchdog, or production changes. Current policy is unconnected and does not reduce production startups yet.
- Final independent review: no material correctness bugs in pure policy. Review confirmed cutoff exclusion and that active allows delayed starts within window; consumers must enforce cadence and verify completion. Reviewer read tests but did not rerun them. No deferred minors.
