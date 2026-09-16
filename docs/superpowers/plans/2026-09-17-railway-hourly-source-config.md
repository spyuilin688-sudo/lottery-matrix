# Railway Hourly Source Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep GitHub's formal Railway configuration aligned with the already-corrected production schedules so future deploys do not restore 10-minute cron execution.

**Architecture:** Change only the two Railway JSON config files that define the formal `worker_all` and `fantasy5-analysis` schedules. Preserve start commands, restart policies, builders, service sources, variables, watchdog recovery cadence, and all crawler/analysis logic.

**Tech Stack:** Railway config-as-code JSON, GitHub, Railway.

**Spec:** Current production Railway config plus `apps/admin/backend/watchdog.ts` recovery design.

## Global Constraints

- `spyuilin688-sudo/lottery-matrix` `main` is the only formal source.
- Base commit: `3f3eda9277707c4fcbb21a28042ff42c2442c47a`.
- Formal Railway service schedules must remain `3 * * * *`.
- Supabase watchdog remains on its existing 10-minute recovery cadence and is not modified here.
- Do not change service source, start commands, environment variables, domains, crawler logic, analysis logic, or API server configuration.

---

### Task 1: Align formal Railway cron files with production

**Files:**
- Modify: `services/matrix-api/railway.json`
- Modify: `services/matrix-api/railway.fantasy5.json`

**Interfaces:**
- Consumes: Railway config-as-code `deploy.cronSchedule`.
- Produces: `cronSchedule: "3 * * * *"` for both formal scheduled services.

- [ ] **Step 1: Confirm the mismatch**

Verify GitHub `main` contains `3/10 * * * *` while live Railway service configuration contains `3 * * * *`.

- [ ] **Step 2: Make the minimal source change**

Change only `deploy.cronSchedule` from `3/10 * * * *` to `3 * * * *` in both files.

- [ ] **Step 3: Validate JSON and diff**

Parse both files as JSON and confirm all other keys/values remain unchanged.

- [ ] **Step 4: Verify production parity**

Re-read both Railway service configs and confirm production still reports `3 * * * *` with no staged changes.
