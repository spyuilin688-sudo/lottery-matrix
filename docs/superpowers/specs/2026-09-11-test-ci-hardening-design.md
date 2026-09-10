# Test & CI Hardening Design

## Goal

Improve confidence in the existing test suite without changing production behavior. The work is limited to test organization, coverage reporting, Edge Function test inventory, and a production smoke-test workflow.

## Scope

1. Remove obvious duplicate static contract assertions while preserving behavioral coverage.
2. Add a coverage-reporting path for the Vitest suite without enforcing a percentage threshold in this first pass.
3. Audit Supabase Edge Function test inclusion and make the configured scope explicit.
4. Add production smoke tests that run against deployed endpoints after deployment/manual invocation, separate from local Playwright tests.

## Non-goals

- No algorithm changes.
- No membership, billing, notification, UI, or production API behavior changes.
- No redesign of existing Playwright runtime tests.
- No coverage percentage gate in this pass.

## Design

### Duplicate-test cleanup

Static source-contract tests may remain where they protect deliberate CSS or build constraints, but the exact same invariant should have one canonical assertion owner. Browser/runtime tests remain independent because they validate rendered behavior rather than source text.

### Coverage reporting

Use Vitest's V8 coverage provider. Coverage is collected as an informational CI artifact/report only. The first pass must not fail CI on percentage thresholds; the report is used to identify untested critical areas before thresholds are introduced later.

### Edge Function inventory

Keep the existing dedicated Edge Function Vitest configuration, but add a machine-readable inventory check that compares configured include globs with Edge Function directories containing tests. The check should fail only when a tested Edge Function directory is accidentally omitted from the configured suite; it must not require every Edge Function to have tests in this pass.

### Production smoke testing

Add a separate smoke-test script/workflow that can target deployed URLs from repository/environment variables. Checks are intentionally shallow: HTTP reachability, expected non-5xx responses, and critical public/admin page availability. It must not mutate production data and must not require user credentials. Local Playwright remains the deeper browser-flow suite.

## Validation

- Existing Unit, Edge, Node, Playwright, admin, Matrix API, runtime-integrity, and production builds must remain green.
- New coverage command must complete and emit a coverage report.
- New Edge inventory check must pass on the current repository state.
- Production smoke checks must be independently runnable and clearly skipped/fail-safe when required deployment URLs are not configured.
