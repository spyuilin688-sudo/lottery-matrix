-- Aggregate in one DB snapshot; preserve current membership and Taipei revenue semantics.
create or replace function public.admin_dashboard_summary(p_now timestamptz default now())
returns jsonb language sql stable security invoker set search_path = '' as $$
with member_rows as materialized (
  select m.registered_at, m.plan_expires_at, m.status, p.duration_days
  from public.members m left join public.plans p on p.id=m.current_plan_id
), member_counts as (
  select count(*) as total,
    count(*) filter(where plan_expires_at > p_now and isfinite(plan_expires_at)
      and coalesce(status,'') not in ('停用','disabled','inactive') and duration_days=30) as monthly,
    count(*) filter(where plan_expires_at > p_now and isfinite(plan_expires_at)
      and coalesce(status,'') not in ('停用','disabled','inactive') and duration_days=90) as quarterly,
    count(*) filter(where plan_expires_at > p_now and isfinite(plan_expires_at)
      and coalesce(status,'') not in ('停用','disabled','inactive') and duration_days=365) as yearly,
    count(*) filter(where plan_expires_at between p_now and p_now + interval '168 hours') as expiring
  from member_rows
), member_days as (
  select (registered_at at time zone 'Asia/Taipei')::date as day, count(*) as delta
  from member_rows where registered_at is not null and isfinite(registered_at) group by 1
), member_growth as (
  select day, sum(delta) over(order by day) as value from member_days
), payment_rows as materialized (
  select coalesce(amount,0) as amount, (paid_at at time zone 'Asia/Taipei')::date as day
  from public.payments
  where status='confirmed' and paid_at is not null and isfinite(paid_at)
    and paid_at >= coalesce((select reset_at from public.admin_revenue_settings
      where id=1 and isfinite(reset_at)), '-infinity'::timestamptz)
), revenue_counts as (
  select coalesce(sum(amount),0) as total,
    coalesce(sum(amount) filter(where day=(p_now at time zone 'Asia/Taipei')::date),0) as today,
    coalesce(sum(amount) filter(where date_trunc('month',day)=date_trunc('month',p_now at time zone 'Asia/Taipei')),0) as month,
    coalesce(sum(amount) filter(where date_trunc('quarter',day)=date_trunc('quarter',p_now at time zone 'Asia/Taipei')),0) as quarter,
    coalesce(sum(amount) filter(where date_trunc('year',day)=date_trunc('year',p_now at time zone 'Asia/Taipei')),0) as year
  from payment_rows
), payment_days as (
  select day, sum(amount) as delta from payment_rows group by day
), payment_growth as (
  select day, sum(delta) over(order by day) as value from payment_days
)
select jsonb_build_object(
  'totalUsers',m.total,'monthlyPro',m.monthly,'quarterlyPro',m.quarterly,'yearlyPro',m.yearly,'expiring',m.expiring,
  'todayRevenue',r.today,'monthRevenue',r.month,'quarterRevenue',r.quarter,'yearRevenue',r.year,'cumulativeRevenue',r.total,
  'userGrowth',coalesce((select jsonb_agg(jsonb_build_object('date',to_char(day,'YYYY-MM-DD'),'value',value) order by day) from member_growth),'[]'::jsonb),
  'revenueGrowth',coalesce((select jsonb_agg(jsonb_build_object('date',to_char(day,'YYYY-MM-DD'),'value',value) order by day) from payment_growth),'[]'::jsonb)
) from member_counts m cross join revenue_counts r;
$$;
revoke all on function public.admin_dashboard_summary(timestamptz) from public, anon, authenticated;
grant execute on function public.admin_dashboard_summary(timestamptz) to service_role;
