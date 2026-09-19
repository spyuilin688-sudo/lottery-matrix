begin;

select plan(6);

select is(
  has_function_privilege('anon', 'public.member_notification_settings_get()', 'EXECUTE'),
  false,
  'anon cannot read member notification settings'
);
select is(
  has_function_privilege('authenticated', 'public.member_notification_settings_get()', 'EXECUTE'),
  true,
  'authenticated can read member notification settings'
);
select is(
  has_function_privilege('service_role', 'public.member_notification_settings_get()', 'EXECUTE'),
  true,
  'service_role can read member notification settings'
);

select is(
  has_function_privilege('anon', 'public.member_notification_settings_save(jsonb)', 'EXECUTE'),
  false,
  'anon cannot save member notification settings'
);
select is(
  has_function_privilege('authenticated', 'public.member_notification_settings_save(jsonb)', 'EXECUTE'),
  true,
  'authenticated can save member notification settings'
);
select is(
  has_function_privilege('service_role', 'public.member_notification_settings_save(jsonb)', 'EXECUTE'),
  true,
  'service_role can save member notification settings'
);

select * from finish();

rollback;
