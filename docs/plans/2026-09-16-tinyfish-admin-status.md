# TinyFish admin status integration

## Goal

Expose the deployed TinyFish latest-draw fallback in the existing administrator API-status view without exposing the API key value and without creating a second monitoring store.

## Design

- Reuse `system_job_status` for one safe latest-fallback telemetry row per lottery.
- Record only lottery, success/failed state, timestamp, successful source period and a redacted failure marker.
- Extend the protected Railway `/jobs/status` response with a `tinyfish` object containing configuration booleans and recent fallback telemetry.
- Keep the TinyFish secret value out of every API response and log-safe projection.
- Extend the admin worker parser and connection-status inventory with a `TinyFish` location and one status item.
- Treat configured + Fetch enabled + no prior fallback use as `waiting`, not failed. Browser disabled is an expected safe configuration.

## Verification

- Matrix API: only TinyFish/resilient-source, job-status repository, and protected `/jobs/status` tests.
- Admin: only API inventory, worker API parsing, TinyFish connection-status tests, runtime integrity, and production/admin builds selected by changed paths.
- Do not run the full-project test suite.
