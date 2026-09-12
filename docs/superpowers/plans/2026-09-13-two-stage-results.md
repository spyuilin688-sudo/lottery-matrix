# Two-stage lottery results

The approved outcome is to publish the newest date and sorted numbers as soon as the notification source supplies them. The period is provisionally the previous period plus one. Actual draw order remains absent until a formal source supplies it. Formal confirmation reconciles the same lottery/date in place, corrects the period, and invalidates any derived result whose input changed.

## Contract and boundaries

- `lottery_draws.result_status`: `preliminary` or `confirmed`; API `resultStatus` preserves that distinction. Explicit draw-order values are the only source for actual-order presentation.
- Fast-result ingestion and its existing deduplicated lottery notification share a database transaction. Replayed fast results cannot demote or overwrite confirmed data.
- Official upserts reconcile provisional rows by lottery and date under a transaction lock. Period or sorted-number corrections invalidate affected analyses; unchanged sorted data survives confirmation. A changed draw invalidates an in-flight card publication lease.
- Sorted cards publish immediately. A current manifest can contain only `cards.sorted`; missing current orders never resolve to previous-period cards. Confirmed actual-card readiness gates the card notification for the three actual-order lotteries; confirmed sorted-card readiness gates it for 天天樂. Both notify independently of algorithm completion, using only the latest published period.
- Analysis versions are `<period>:matrix-python-v14-sorted` and `<period>:matrix-python-v14-draw`. Reads select the requested order for the current draw; Tiangong remains sorted-only. The crawler continues looking for formal data even if a preliminary row already has today's date.
- Home, TongXing, NumberReference and history refresh current available data and invalidate caches when date, period, numbers or confirmation changes. Preserve the existing visual design.

## Implementation and verification

1. Add focused failing ingestion/reconciliation and public API tests. Implement the database migration and repository/API contracts. Verify replay, period correction, same-period number correction, late preliminary data and absent actual order.
2. Implement independent per-order algorithm runs and prevent stale snapshots from publishing. Verify preliminary processing does not suppress formal acquisition and that missing actual history does not block sorted work.
3. Implement partial card manifests and immediate publication. Verify snapshot changes invalidate a lease, failed uploads cannot publish, old manifests stay hidden and actual readiness gates notification.
4. Update the existing frontend readers and active-page refresh behavior. Verify same-period enrichment, date/period correction and absent-order presentation/download.
5. Integrate SQL read functions with stage versions, preserve entitlement checks and latest-period selection. Run focused SQL behavior tests.
6. Run only explicitly named affected test files, review the combined diff, compare touched files with fresh GitHub main, integrate without replacing concurrent work, and deploy the coherent migration/backend/frontend set under the user's existing authorization. Verify deployed versions and read-only current-data behavior.

Full-project tests are prohibited by AGENTS.md and the user's instruction. Historical source archives, unrelated schedules, UI styling and unrelated project work remain outside this change.
