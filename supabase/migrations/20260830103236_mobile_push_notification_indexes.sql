create index if not exists member_push_subscriptions_user_id_idx
  on public.member_push_subscriptions (user_id);

create index if not exists push_delivery_logs_subscription_id_idx
  on public.push_delivery_logs (subscription_id);

create index if not exists push_delivery_logs_user_id_idx
  on public.push_delivery_logs (user_id);
