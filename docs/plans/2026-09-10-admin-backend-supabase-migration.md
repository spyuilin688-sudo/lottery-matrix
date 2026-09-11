# Admin backend Supabase migration

## Scope

- Keep the existing Traditional Chinese dark/gold admin UI and its permission model.
- Build the admin UI into the existing Cloudflare Pages artifact at /admin/.
- Move admin login and data APIs to the Supabase admin-api Edge Function.
- Keep Railway crawlers, analysis algorithms, worker endpoints, and recovery behavior unchanged.
- Keep the AppDeploy app available only as a rollback reference until the new production route is verified.

## Runtime ownership

| Surface | Owner after migration | Contract |
| --- | --- | --- |
| /admin/ | Cloudflare Pages static asset | Existing React admin UI |
| /admin/api/* | Cloudflare Pages Function | Fixed-target, same-origin transport proxy |
| admin-api | Supabase Edge Function | Existing admin routes, permissions, audit, security monitor |
| Admin records and sessions | Supabase Postgres | Existing RLS/service-role boundary |
| Crawlers and analysis | Railway / GitHub Actions | No migration or algorithm change |

The API proxy is intentionally thin. It does not contain business logic, accept an
upstream URL from the request, or expose the Supabase service-role key. Keeping the
UI and proxy below /admin/ lets the existing HttpOnly, Secure, SameSite=Strict
credential cookie remain first-party and narrowly scoped.

## Data and compatibility

- Existing admin_accounts, password hashes, sessions, permissions, logs, todos,
  members, subscriptions, payments, activation codes, and worker status stay in
  their current Supabase tables.
- admin_generate_activation_code_batch provides atomic, request-ID-deduplicated
  activation-code batches before the new UI is released.
- private.admin_watchdog_status replaces the AppDeploy key-value status row.
  Only service_role can execute its read/write RPCs.
- The backend modules remain canonical under apps/admin/backend; the Edge
  Function supplies only a narrow Fetch/secrets/database runtime adapter.

## Rollout

1. Apply both database migrations.
2. Deploy and probe Supabase admin-api.
3. Merge the Cloudflare Pages admin artifact, route manifest, proxy, and client.
4. Wait for the existing Cloudflare Pages main-branch deployment.
5. Verify static page load, invalid-session 401, credential login, dashboard read,
   one read-only operational status view, logout, and mobile/desktop layout.

## Rollback

- Before the Cloudflare merge: no public traffic changes.
- After the merge: revert the migration commit to remove /admin/ and its proxy.
- Database additions and the Supabase Edge Function are backward-compatible and
  can remain during rollback; no existing data is deleted.
- Railway and crawler deployments are not touched, so no worker rollback is
  needed.

## Release evidence

- Scoped admin/backend/client/proxy/runtime tests.
- Cloudflare Pages and AppDeploy-compatible admin builds.
- Premium strict audit and changed-file anti-pattern search.
- Supabase health, owner-auth configuration, unauthorized access, and origin
  rejection probes.
- Supabase security/performance advisors reviewed for migration-introduced issues.
