create index if not exists notification_outbox_member_id_idx
  on public.notification_outbox (member_id);
