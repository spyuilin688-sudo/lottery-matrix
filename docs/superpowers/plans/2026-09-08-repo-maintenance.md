# Repository Maintenance Implementation Plan

> **For agentic workers:** Follow superpowers:executing-plans for this bounded maintenance task; source edits have one owner.

**Goal:** Update stale handoff/README information, remove unreachable workflow cron branches, and stop tracking test output.

**Architecture:** Preserve the workflow's push/manual recovery behavior and the existing application. Verify Railway services through the current production UI before drawing conclusions from repository configuration files.

**Tech Stack:** Markdown, GitHub Actions YAML/Bash, Git, Node's existing workflow tests.

**Spec:** User-approved three-item cleanup and Railway configuration inspection in this conversation, based on main `3a00256ff351ecf30b5c5898c87a58d56e94edf3`.

## Global Constraints

- Only related tests with explicit file paths, per `AGENTS.md`; no full-suite run.
- Preserve the workflow's `workflow_dispatch`, `push` filters, stale-run barrier, lottery matrix and `--scheduled` worker mode.
- Remove test results from the Git index; retain any local test files.
- Do not change Railway schedules, application UI, APIs, or secrets in this cleanup.

## Tasks

- [x] Inspect current Railway services and distinguish live settings from unbound repository config files.
- [x] Update `PROJECT_HANDOFF.md` from current package, entry points, PWA files, navigation and verified deployment facts; retain the historical draw-date matching rule.
- [x] Correct README commands, build output ownership and the header marker to match the existing `app/chatgpt-auth.ts` constant.
- [x] Replace the old workflow gate test with a Bash execution check for push/manual acceptance and scheduled-event rejection; verify it fails on the existing YAML.
- [x] Remove `EVENT_SCHEDULE`, `LOTTERY_ID` and unreachable cron comparisons; preserve the event gate for supported triggers.
- [x] Add `/test-results/` to `.gitignore` and remove the nine tracked result files from the index.
- [x] Run `node --test tests/matrix-analysis-workflow.test.mjs`, check every documented npm script against package.json, verify test output is ignored/untracked, and inspect the complete diff.
- [x] Recheck remote main and complete independent review; main remains `3a00256ff351ecf30b5c5898c87a58d56e94edf3`, with no blocking findings.
- [ ] Merge the scoped PR using `[skip actions]` after creating the reviewed commit.

## Verification evidence

- The old YAML failed the new Bash gate test for the stale `*/15` cron.
- The corrected workflow passed all 6 tests in `tests/matrix-analysis-workflow.test.mjs`.
- All npm script names documented in README and the handoff exist in `package.json`.
- The nine result files are no longer tracked; `/test-results/` ignores future results.
- `git diff --check` passed. No application build was needed for this maintenance-only change.
