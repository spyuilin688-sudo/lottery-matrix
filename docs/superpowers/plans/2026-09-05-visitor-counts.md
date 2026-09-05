# Visitor counts

Authority: add 本日瀏覽人數 / 本月瀏覽人數 / 總瀏覽人數 in the existing admin overview. Anonymous hashes expire after 90 days. The user confirmed on 2026-09-05 that a returning visitor after deletion adds to the total again.

Implementation:
- Keep a random browser identifier locally and send only its SHA-256 hash. Record visits on app opening and return to visibility. Supabase uses its own clock and the existing Asia/Taipei business timezone.
- Deduplicate each identifier per day and month. Keep aggregate counts after deleting identifiers; count an expired identifier again on return. Lock each identifier during counting so simultaneous requests cannot double count.
- Expose only the recording RPC to public clients. Identifier tables and counts stay private. The existing guarded admin dashboard reads aggregate statistics through its service transport.
- Add three cards using the existing Overview Cards component and responsive CSS. No other UI, summary row, authentication or notification flow changes.

Preflight:
- Regression checks: repeat visits, day/month boundaries, 90-day expiry, retained totals, invalid input and role boundaries; browser storage/retry and dashboard display.
- Use the latest GitHub main as base and inspect the live AppDeploy snapshot before applying scoped diffs. Preserve concurrent changes.
- Apply the verified migration, merge after CI, verify PWA and existing admin deployment. Do not insert fake visits into production.

Verification so far: 1102 unit tests passed before the final concurrency regression; the added four dual-context checks and dashboard failure test passed. TypeScript, production build, isolated SQL boundaries/retention/ACL and Premium contracts passed. Migration 20260905105134 is applied with cleanup active. No synthetic production visits were inserted.

Deployment preservation: AppDeploy version 1788533369327 predates main's administrator-permission changes. Apply only visitor-count diffs to its current source, preserving that deployment's other code. GitHub keeps the existing main permissions unchanged. The previous full admin QA suite is retained separately; the deployment QA entry contains only read-only checks for this change, avoiding unrelated production writes.

Browser concurrency: Web Locks protects identifier creation across tabs; the fallback rechecks storage after asynchronous hashing. Browsers without Web Locks cannot guarantee atomic storage across independent renderers.
