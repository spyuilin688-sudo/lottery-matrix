begin;

insert into public.plans (name, price, duration_days)
values
  ('月費方案', 2880, 30),
  ('季費方案', 5580, 90),
  ('年費方案', 17800, 365)
on conflict (name) do update
set price = excluded.price,
    duration_days = excluded.duration_days;

commit;
