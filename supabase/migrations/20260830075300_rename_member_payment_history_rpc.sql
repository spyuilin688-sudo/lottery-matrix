alter function public.member_payment_history()
  rename to member_payment_history_get;

revoke all on function public.member_payment_history_get() from public, anon;
grant execute on function public.member_payment_history_get() to authenticated;

notify pgrst, 'reload schema';
