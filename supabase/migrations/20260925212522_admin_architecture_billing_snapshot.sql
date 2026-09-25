-- Provider-confirmed billing data only. No private invoice values or signed URLs in migrations.
alter table public.admin_architecture_subscriptions
  add column billing_snapshot jsonb,
  add constraint architecture_billing_snapshot_verified check (
    billing_snapshot is null or (
      jsonb_typeof(billing_snapshot) = 'object'
      and coalesce(jsonb_typeof(billing_snapshot->'source') = 'string', false)
      and coalesce(length(btrim(billing_snapshot->>'source')) between 1 and 200, false)
      and coalesce(jsonb_typeof(billing_snapshot->'verifiedAt') = 'string', false)
      and coalesce(length(billing_snapshot->>'verifiedAt') between 1 and 200, false)
    )
  );

comment on column public.admin_architecture_subscriptions.billing_snapshot is
  'Latest observed invoice/payment, current charges and estimate kept separately with source and verification time. Not an automatic billing feed.';
