revoke all on function public.member_bootstrap() from public, anon;
revoke all on function public.member_profile() from public, anon;

grant execute on function public.member_bootstrap() to authenticated;
grant execute on function public.member_profile() to authenticated;
