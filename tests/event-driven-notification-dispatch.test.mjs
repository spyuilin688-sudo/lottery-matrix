import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const target = new URL(
  '../supabase/migrations/20260921114248_event_driven_notification_dispatch.sql',
  import.meta.url,
);

function sql() {
  return fs.readFileSync(target, 'utf8');
}

test('replaces four minute pollers with one five-minute recovery job', () => {
  const source = sql();
  for (const name of [
    'matrix-notification-pipeline-minute',
    'matrix-notification-dispatch-minute',
    'matrix-native-notification-dispatch-minute',
    'admin-transfer-push-minute',
  ]) {
    assert.match(source, new RegExp(name));
  }
  assert.match(source, /matrix-notification-recovery-5m/);
  assert.match(source, /'\*\/5 \* \* \* \*'/);
  assert.match(source, /notification_recovery_tick/);
});

test('ordinary notification events fan out immediately and wake web/native dispatch', () => {
  const source = sql();
  const trigger = source.match(
    /create or replace function private\.notification_event_publish_after_insert[\s\S]*?revoke all on function private\.notification_event_publish_after_insert/,
  );
  assert.ok(trigger);
  assert.match(trigger[0], /notification_fanout_event\(new\.id\)/);
  assert.match(trigger[0], /notification_dispatch_wake\(\)/);
  assert.match(trigger[0], /bet_reminder[\s\S]*membership_expiry/);
});

test('fixed reminders stay batched and wake dispatch once after their scheduled tick', () => {
  const source = sql();
  assert.match(source, /notification_bet_reminders_publish_tick/);
  assert.match(source, /notification_bet_reminders_tick\(p_now\)/);
  assert.match(source, /notification_expiry_publish_tick/);
  assert.match(source, /notification_time_events_tick\(p_now\)/);
  assert.match(source, /notification_fanout_drain\(100, p_now\)/);
  assert.match(
    source,
    /matrix-notification-bet-0500-0730[\s\S]*notification_bet_reminders_publish_tick/,
  );
  assert.match(
    source,
    /matrix-notification-expiry-daily[\s\S]*notification_expiry_publish_tick/,
  );
});

test('admin transfer insert wakes push without making transfer creation depend on delivery', () => {
  const source = sql();
  const enqueue = source.match(
    /create or replace function private\.admin_transfer_push_enqueue[\s\S]*?revoke all on function private\.admin_transfer_push_enqueue/,
  );
  assert.ok(enqueue);
  assert.match(enqueue[0], /admin_transfer_push_wake\(\)/);
  assert.match(enqueue[0], /exception[\s\S]*when others then[\s\S]*null/);
});

test('immediate wakes deduplicate inside one transaction', () => {
  const source = sql();
  assert.match(
    source,
    /current_setting\('matrix\.notification_dispatch_woken', true\)/,
  );
  assert.match(
    source,
    /set_config\('matrix\.notification_dispatch_woken', '1', true\)/,
  );
  assert.match(
    source,
    /current_setting\('matrix\.admin_transfer_push_woken', true\)/,
  );
});
