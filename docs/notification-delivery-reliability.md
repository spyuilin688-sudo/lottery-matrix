# Notification delivery recovery

The web dispatcher retains its existing rule: a provider acceptance from any enabled subscription completes that outbox item. Failed provider calls retain their existing retry/backoff and permanent-failure handling.

Dispatcher delivery logs now link to the exact outbox through `notification_outbox_id`. The claim RPC reconciles a due item from a matching successful dispatcher log before returning work. It checks the member's auth user as well as the outbox and dispatcher account; failed, unrelated and historic unlinked logs never imply delivery. Reconciliation preserves the provider acceptance time and does not increment the delivery attempt count. Existing reminder eligibility and the five-minute lease remain authoritative for unaccepted work.

After provider acceptance, the Edge Function retries only the idempotent `mark_sent` write, up to three bounded attempts. A retry that finds the item already sent acknowledges success without changing its original timestamp. Exhausted writes still return an error; a later claim can recover from the durable log without another provider call.

Each dispatched outbox has a stable notification tag. The PWA passes the tag with `renotify: false` to `showNotification`, allowing supporting browsers to replace an existing notification without another alert. This does not guarantee suppression after a notification has been dismissed.

Delivery remains at least once when provider acceptance is ambiguous or neither database write persists. A crash between provider acceptance and durable evidence cannot prove whether a device received the push. Never pre-mark an unsent item as sent or discard its retry to hide this uncertainty. Provider acceptance and database/cron records are not device receipt confirmations.

Rollout order: apply the additive receipt migration, deploy `notification-dispatch`, then publish the updated PWA. Existing producers remain compatible because the log link is nullable. For application rollback, keep the additive database changes and restore the prior Edge/PWA version; do not delete receipt or outbox data.

Native notification delivery has independent state. The admin status card reads `admin_native_notification_health()` aggregates: schedule, enabled device count, pending/overdue work and actual recent delivery records. No enabled devices is idle. A missing optional native schema returns unknown evidence. Cron SQL success alone does not verify OAuth, FCM or device receipt. The separately paused admin security dispatcher remains paused.

Focused checks: `supabase/functions/notification-dispatch/handler.test.ts`, `supabase/functions/_shared/web-push-delivery.test.ts`, `supabase/tests/notification-delivery-receipts.test.mjs`, the notification pgTAP files, `tests/push-service-worker.test.mjs`, and the existing LINE/PWA worker tests. Native monitoring uses `apps/admin/backend/native-notification-status.test.ts` and the affected admin presentation tests.
