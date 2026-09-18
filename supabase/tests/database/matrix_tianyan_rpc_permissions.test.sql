begin;

select plan(6);

select is(
  has_function_privilege('anon', 'public.matrix_tianyan_list(jsonb)', 'EXECUTE'),
  false,
  'anon cannot list Matrix Tianyan results'
);
select is(
  has_function_privilege('authenticated', 'public.matrix_tianyan_list(jsonb)', 'EXECUTE'),
  true,
  'authenticated can list Matrix Tianyan results subject to entitlements'
);
select is(
  has_function_privilege('service_role', 'public.matrix_tianyan_list(jsonb)', 'EXECUTE'),
  true,
  'service_role can list Matrix Tianyan results'
);

select is(
  has_function_privilege('anon', 'public.matrix_tianyan_validation(jsonb)', 'EXECUTE'),
  false,
  'anon cannot read Matrix Tianyan validation'
);
select is(
  has_function_privilege('authenticated', 'public.matrix_tianyan_validation(jsonb)', 'EXECUTE'),
  true,
  'authenticated can read Matrix Tianyan validation subject to entitlements'
);
select is(
  has_function_privilege('service_role', 'public.matrix_tianyan_validation(jsonb)', 'EXECUTE'),
  true,
  'service_role can read Matrix Tianyan validation'
);

select * from finish();

rollback;
