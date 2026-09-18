begin;

select plan(15);

select is(
  has_function_privilege('anon', 'public.claim_matrix_watchdog_lease(text,text,integer)', 'EXECUTE'),
  false,
  'anon cannot claim Matrix watchdog leases'
);
select is(
  has_function_privilege('authenticated', 'public.claim_matrix_watchdog_lease(text,text,integer)', 'EXECUTE'),
  false,
  'authenticated cannot claim Matrix watchdog leases'
);
select is(
  has_function_privilege('service_role', 'public.claim_matrix_watchdog_lease(text,text,integer)', 'EXECUTE'),
  true,
  'service_role can claim Matrix watchdog leases'
);

select is(
  has_function_privilege('anon', 'public.release_matrix_watchdog_lease(text,text)', 'EXECUTE'),
  false,
  'anon cannot release Matrix watchdog leases'
);
select is(
  has_function_privilege('authenticated', 'public.release_matrix_watchdog_lease(text,text)', 'EXECUTE'),
  false,
  'authenticated cannot release Matrix watchdog leases'
);
select is(
  has_function_privilege('service_role', 'public.release_matrix_watchdog_lease(text,text)', 'EXECUTE'),
  true,
  'service_role can release Matrix watchdog leases'
);

select is(
  has_function_privilege('anon', 'public.begin_matrix_watchdog_recovery(text,text,text,integer)', 'EXECUTE'),
  false,
  'anon cannot begin Matrix watchdog recovery'
);
select is(
  has_function_privilege('authenticated', 'public.begin_matrix_watchdog_recovery(text,text,text,integer)', 'EXECUTE'),
  false,
  'authenticated cannot begin Matrix watchdog recovery'
);
select is(
  has_function_privilege('service_role', 'public.begin_matrix_watchdog_recovery(text,text,text,integer)', 'EXECUTE'),
  true,
  'service_role can begin Matrix watchdog recovery'
);

select is(
  has_function_privilege('anon', 'public.renew_matrix_watchdog_recovery(text,text,text,integer)', 'EXECUTE'),
  false,
  'anon cannot renew Matrix watchdog recovery'
);
select is(
  has_function_privilege('authenticated', 'public.renew_matrix_watchdog_recovery(text,text,text,integer)', 'EXECUTE'),
  false,
  'authenticated cannot renew Matrix watchdog recovery'
);
select is(
  has_function_privilege('service_role', 'public.renew_matrix_watchdog_recovery(text,text,text,integer)', 'EXECUTE'),
  true,
  'service_role can renew Matrix watchdog recovery'
);

select is(
  has_function_privilege('anon', 'public.finish_matrix_watchdog_recovery(text,text,text)', 'EXECUTE'),
  false,
  'anon cannot finish Matrix watchdog recovery'
);
select is(
  has_function_privilege('authenticated', 'public.finish_matrix_watchdog_recovery(text,text,text)', 'EXECUTE'),
  false,
  'authenticated cannot finish Matrix watchdog recovery'
);
select is(
  has_function_privilege('service_role', 'public.finish_matrix_watchdog_recovery(text,text,text)', 'EXECUTE'),
  true,
  'service_role can finish Matrix watchdog recovery'
);

select * from finish();

rollback;
