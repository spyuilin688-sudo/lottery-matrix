# Architecture billing connection preflight

This is a read-only, explicitly invoked connection diagnostic. Daily GitHub/Railway synchronization is implemented separately in `architecture-billing-sync`. This diagnostic does not update billing snapshots, change provider subscriptions, or create a schedule. There is no frontend route to this function.

POST requires the existing server-only `x-matrix-dispatch-token`, matched against `MATRIX_NOTIFICATION_DISPATCH_TOKEN`. The existing Vault dispatch token can invoke it through pg_net without copying secrets into source or returning them to the client. GET and unauthorized requests perform no provider requests.

The function checks Cloudflare token verification, user subscriptions and visible accounts using `CLOUDFLARE_BILLING_API_TOKEN`; it checks GitHub's current UTC month usage endpoint with `GITHUB_BILLING_API_TOKEN`, falling back to the existing `GITHUB_ACTIONS_TOKEN`. Railway uses `RAILWAY_BILLING_API_TOKEN` to read the configured workspace's current usage, billing period, invoices and subscriptions through the official GraphQL API. By default only success and record counts are returned. HTTP rejection, GraphQL errors and request failures are reported without provider response bodies. Supabase configuration presence is only reported; it does not establish endpoint availability or authorization.

## Unfinished work

- Railway workspace billing authorization and field units are verified; daily sync includes Agent usage and separates pending invoice snapshots from gross usage.
- Establish a supported Supabase billing data source and its authorization. Merely supplying a Management API token does not prove invoice access.
- GitHub billing API access is verified after the user approved Plan read-only permission. Daily usage sync retains the provenance of manually confirmed payment history.
- Verify Cloudflare Pages-specific coverage. A subscription with `rate_plan.scope = zone` is a zone plan and must not be presented as the Pages plan. Empty account invoice history is not evidence of zero current usage.
- Complete the remaining provider coverage. The separate daily sync persists per-provider results and keeps existing snapshots and their original verification times unchanged on failure.

The selected user requirement remains daily automatic updates for all four providers. This diagnostic is not that feature. No repeated requests or scheduled preflight are configured.

## Verification

Run only the focused test:

```sh
node --test tests/architecture-billing-preflight.test.mjs
```

Reference: Cloudflare account billing/subscription APIs, GitHub billing usage API (`2026-03-10`), and the existing ecpay-recover dispatch-token pattern.

## Optional Pages access diagnosis

An authenticated body `{ "cloudflareDetails": true }` adds one read each for the configured account's Pages project, account subscriptions and billable-usage coverage. It returns HTTP status, at most 30 allowlisted public plan fields and a boolean coverage flag. Project configuration, environment variables, credentials, invoice links and raw error bodies are never returned. Omitting this option preserves the original request count. No frontend request or scheduled probe is introduced.

A successful account subscription read does not establish Pages access. Pages project reads require the documented Pages Read or Pages Write permission; a 403 means the current request was not authorized. A zone-scoped Free subscription cannot establish the Pages plan. A dashboard security challenge and an API authorization rejection are separate blockers.

References: https://developers.cloudflare.com/api/resources/pages/subresources/projects/methods/get/ and https://developers.cloudflare.com/api/resources/accounts/subresources/subscriptions/methods/get/

