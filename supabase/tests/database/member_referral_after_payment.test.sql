begin;

select plan(5);

select is(
  position(
    'REFERRAL_CODE_AFTER_PAYMENT'
    in pg_get_functiondef('public.member_referral_submit(text)'::regprocedure)
  ),
  0,
  'member_referral_submit allows referral code backfill after confirmed payment'
);

select is(
  position(
    'not v_has_invitation_code and not v_has_confirmed_payment'
    in pg_get_functiondef('public.member_referral_summary()'::regprocedure)
  ),
  0,
  'member_referral_summary eligibility does not depend on payment status'
);

select is(
  position(
    '''canSubmitReferralCode'', not v_has_invitation_code'
    in pg_get_functiondef('public.member_referral_summary()'::regprocedure)
  ) > 0,
  true,
  'member_referral_summary allows submission whenever no invitation code exists'
);

select is(
  position(
    'REFERRAL_CODE_ALREADY_SUBMITTED'
    in pg_get_functiondef('public.member_referral_submit(text)'::regprocedure)
  ) > 0,
  true,
  'member_referral_submit still permits only one referral code per account'
);

select is(
  position(
    'SELF_REFERRAL_NOT_ALLOWED'
    in pg_get_functiondef('public.member_referral_submit(text)'::regprocedure)
  ) > 0,
  true,
  'member_referral_submit still blocks self referral'
);

select * from finish();

rollback;
