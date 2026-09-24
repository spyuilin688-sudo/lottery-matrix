create index if not exists lottery_draws_lottery_draw_date_period_idx
  on public.lottery_draws (lottery, draw_date desc, period desc);
