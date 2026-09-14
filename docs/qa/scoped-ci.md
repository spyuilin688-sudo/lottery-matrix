# CI test scope

`Project CI` selects tests from the actual changed paths. It never substitutes a
whole-project command when the selection is empty or the Git comparison fails.
The scope job prints the changed paths, explicit selected files, each file's
related changed paths (`reasons`), and paths without a discovered test (`unmatched`).

## Git comparison

- Pull requests check out `pull_request.head.sha` and compare that head with
  `git merge-base pull_request.base.sha pull_request.head.sha`. Changes that exist
  only on an advanced base branch do not enter the PR's test selection.
- Pushes compare `event.before` directly with the pushed head. This also handles a
  push whose endpoints are not ancestor/descendant commits, provided both exist.
- The scope checkout fetches complete history. Missing, zero, or unavailable
  commit IDs fail the scope job with a diagnostic; they do not select all tests.
- `git diff --name-only --no-renames -z` preserves both sides of a rename and
  deleted paths. Deleted tests are not runnable, but surviving tests that reference
  a deleted module or fixture remain eligible.

## Selection contract

The selector follows relative JavaScript/TypeScript imports, Python module and
relative imports, literal filesystem reads, `new URL(..., import.meta.url)`
fixtures, the repository's `read(path)` fixture helpers, and CSS imports. Imported
modules are traversed transitively. A test that only reads JavaScript source text
does not execute that module's imports, so its selection does not expand through
the entire application. CSS fixtures follow their local imported stylesheets.

Focused browser fixtures follow their HTML/module imports. Specs navigating to
the application root use an explicit screen-owner mapping in
`BROWSER_OWNERS`; loading the application entry point is not a reason to run every
browser spec. The broad `full-project-responsive.spec.ts` is not included by that
mapping. CI/configuration contracts use `CONFIG_OWNERS`. The feature-page source
reader's explicit module-name list is also understood.

This is static dependency selection, not runtime coverage analysis. Dynamic
imports/paths, new alias schemes, and new browser navigation contracts may need a
focused owner mapping or a statically visible dependency. Review `unmatched` for
changed production paths and add the specific dependency/test where needed;
never add an entire test directory or a default all-tests list. Documentation and
files without a discovered test can legitimately have an empty selection. Builds
and integrity checks still run.

## Runner groups

The plan contains sorted repository-relative filenames. The runner validates
each selected file, confirms its runner type, and passes an absolute path as a
separate process argument (`shell: false`). The table shows the command prefix;
every nonempty invocation appends the selected full test paths.

| Group | Eligible files | Command prefix / working directory |
| --- | --- | --- |
| `node` | `.test.mjs` and tests importing `node:test` | `node --test`; repository root |
| `vitest` | Root client/shared/backend tests and admin backend tests | `node_modules/.bin/vitest run --config vitest.config.ts`; repository root |
| `edge` | Supabase function tests | `node_modules/.bin/vitest run --config vitest.edge-functions.config.ts`; repository root |
| `admin` | Admin frontend tests, including `.test.tsx` | `apps/admin/node_modules/.bin/vitest run --config apps/admin/vite.config.ts`; repository root |
| `python` | `services/matrix-api/tests/test_*.py` | `uv run pytest -q`; `services/matrix-api` |
| `playwright` | Focused runtime `.spec.ts` files | `node_modules/.bin/playwright test --config playwright.config.ts`; repository root |
| `membership` | Membership preview browser spec | `node_modules/.bin/playwright test --config playwright.membership-preview.config.ts`; repository root |

An empty group returns before spawning a process. A missing group, invalid path,
wildcard, deleted test, or incorrect runner assignment fails instead of falling
back to runner discovery. CI jobs/steps also guard on the selection booleans.
Each test belongs to one group, avoiding the prior duplicate admin test runs.

The runtime commit-atomicity check, `check:runtime`, production build, admin build,
and admin Pages build remain required. Selected Node packaging tests run after a
production build. Selected browser jobs install Chromium and its system
dependencies; selected Python tests run after `uv sync --frozen`.

## Review and focused verification

Print a selection without running tests:

```sh
node scripts/select-scoped-tests.mjs --base "$BASE_SHA" --head "$HEAD_SHA" --event pull_request
node scripts/select-scoped-tests.mjs --changed-json '["apps/admin/src/admin-platform-client.ts"]'
node scripts/select-scoped-tests.mjs --changed-json '["docs/qa/scoped-ci.md"]'
```

The client-only example selects exactly
`apps/admin/src/admin-platform-client.test.ts` in `admin`; the documentation
example selects no tests. For the service-worker source
`public/push-service-worker.js`, the related Node files are
`tests/line-pwa-service-worker.test.mjs`, `tests/push-service-worker.test.mjs`, and
`tests/pwa-asset-recovery.test.mjs`.

For local execution, inspect the printed selection and run only the related
explicit files with their runner. CI uses the immutable selection JSON in
`SCOPED_TEST_PLAN` and calls the selector's `--plan-env SCOPED_TEST_PLAN --run GROUP`
entry point, which logs the resolved command before execution.

The selector's focused regression command is:

```sh
node --test tests/scoped-ci.test.mjs
```

It covers empty/doc-only scope, backend/admin/client separation, CSS imports,
source-text versus executable imports, multiline and prefixed fixtures, deleted
dependencies, Python imports, runner arguments, unsafe/empty inputs, deterministic
ordering, and real temporary Git histories for PR and push ranges. The workflow
contract is separately covered by `tests/ci-workflow-coverage.test.mjs`.
