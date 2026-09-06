# API verification — 2026-09-07 (Asia/Taipei)

Baseline: `f733ceb943858b0400cae30b9b4cd4e181c61416` (#405).
Source and test files used for verification were matched against GitHub blob hashes.

## Confirmed defect and correction

The live `/api/matrix/tongxing` request for 今彩539, number `03`, sorted order,
futureOffset `1` returned a group from `096000004` to `96000004`, both dated
2007-01-04. These are two representations of the same draw, not successive draws.
Read-only database checks found 1,045 such alias pairs for 今彩539 and 418 for
大樂透. Their dates, sorted numbers, and actual-order numbers are identical.

The public API history reader now normalizes Taiwan eight-digit periods to
nine digits, removes identical aliases, and counts unique draws when filling
paginated requests. Conflicting payloads produce an explicit error. Different
Hong Kong periods on the same date remain distinct. This changes neither stored
draws nor worker algorithm rules.

Independent SQL expected counts for sorted number `03`, futureOffset `1` after
alias normalization: 今彩539 731, 天天樂 1547,六合彩 912,大樂透 351.

## Evidence and limits

| Surface | Fresh evidence | Result / limit |
| --- | --- | --- |
| Railway deployment | GET /health returned HTTP 200 and baseline SHA, database/adminApi ok | Connection check passed |
| Latest draws | Actual GET for all four lotteries | HTTP 200; periods matched database |
| History | Actual GET, limit 3, all four lotteries | HTTP 200; newest records matched database; historic aliases found in full-history consumer |
| Legacy card manifests | Actual GET for all four lotteries | HTTP 200; expected draw/sorted URLs |
| PNG manifests | Actual GET succeeded for all four lotteries | An initial 12-second timeout for六合彩 was followed by HTTP 200 in 11.1 seconds; no service-outage claim |
| Explore list RPC | Executed database functions for all four lotteries, standard two-period request | complete; 8/13/31/23 items for 今彩539/天天樂/六合彩/大樂透 |
| Explore validation RPC | Executed one returned item per lottery | complete; validation contains itemId/sourceA/ruleSets |
| Tongxing | Actual POST query for 今彩539 | HTTP 200 exposed duplicate-period defect above |
| Number reference | Actual POST query, 今彩539, 1000 draws, number 03 | HTTP 200, 1000 records, expected latest match slot |
| Notification pipeline | Read existing events/outbox | 31 events complete; 5 sent, 109 skipped, no pending/failed outbox rows at inspection |
| Skipped notifications | Read aggregated reasons | 108 no_enabled_subscription; 1 no_valid_subscription |
| Push subscriptions | Read counts, no subscription secrets | Member: 8 disabled, 0 enabled. Admin: 1 enabled |
| Transfer notifications | Read queue and cron responses | No jobs yet; enabled device is not proof of end-to-end receipt |
| Scheduled HTTP failures | Existing net response history | Two WORKER_ERROR HTTP 500 at 01:14/01:15; latest inspected responses HTTP 200. Original cause not established from available logs |
| Watchdog | AppDeploy current cron status | Last run success, failure_count 0 |
| Watchdog database functions | Executed claim/begin/renew/finish/release with a random isolated key | 10 positive/negative behavior checks passed; subtransaction rolled back and fixture absence checked |
| RPC access controls | Read actual database grants | Notification dispatch/watchdog operations denied to anon and authenticated, allowed to service_role; member entry points denied to anon |

Database RPC execution does not establish browser HTTP authentication behavior.
Paid-member Tianyan/Tiangong and member mutation flows have not been verified
with a signed-in test member. No real member settings, payments, activation codes,
production leases, subscriptions, or notification jobs were modified for this verification.
Only the isolated watchdog fixture was temporarily written and fully rolled back.
No real notification was deliberately sent. A successful dispatch record does
not establish that the phone displayed the notification.

## Focused automated checks

- Baseline: 87 Python tests across public API HTTP, public API, cards,
  notification events and watchdog leases passed.
- 79 Edge Function tests across ingest, dispatch, Pilio, admin transfer push,
  member test push and shared push delivery passed (mocked external delivery).
- New historic-alias regressions failed before correction.
- CI exposed a requested-limit compatibility assertion in the existing latest
  draw test. The reader now preserves the requested limit and only reads more
  when aliases cause an underfilled result.
- Final affected suite: 72 passed across `test_public_history_aliases.py`,
  `test_public_api.py`, `test_api_server_http.py`, `test_matrix_card_api.py`,
  `test_draw_time_contract.py`.

This is a mixed verification result, not a declaration that all API business
flows passed. The admin status page's automatic probes were not expanded by
this change; their existing limited-evidence labels remain accurate.
