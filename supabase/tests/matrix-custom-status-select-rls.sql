-- Repeatable PostgreSQL 17 regression test, run as postgres/project owner.
-- Requires >=2 linked non-admin members and >=1 admin_profile (present when
-- verified on 2026-09-05). Existing IDs remain server-side and are never returned.
-- Uses temporary fixture tables and real public.members/public.is_admin().
-- No persistent DDL, DML, policy, function, grant, or index changes are made.
-- ALWAYS submit the complete script in one session; ends in ROLLBACK.
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = public, pg_catalog;

CREATE TEMP TABLE rls_before (
  fixture_label text PRIMARY KEY,
  member_id uuid NOT NULL
) ON COMMIT DROP;
CREATE TEMP TABLE rls_after (LIKE pg_temp.rls_before INCLUDING ALL)
  ON COMMIT DROP;
ALTER TABLE pg_temp.rls_before ENABLE ROW LEVEL SECURITY;
ALTER TABLE pg_temp.rls_after ENABLE ROW LEVEL SECURITY;

-- Exact original predicates, schema qualified to bind the same catalog objects.
CREATE POLICY old_admin ON pg_temp.rls_before AS PERMISSIVE FOR SELECT
  TO authenticated USING ((SELECT public.is_admin()));
CREATE POLICY old_member ON pg_temp.rls_before AS PERMISSIVE FOR SELECT
  TO authenticated USING (member_id IN (
    SELECT member.id FROM public.members AS member
    WHERE member.auth_user_id = (SELECT auth.uid())
  ));
CREATE POLICY consolidated ON pg_temp.rls_after AS PERMISSIVE FOR SELECT
  TO authenticated USING (
    (SELECT public.is_admin())
    OR member_id IN (
      SELECT member.id FROM public.members AS member
      WHERE member.auth_user_id = (SELECT auth.uid())
    )
  );

CREATE TEMP TABLE rls_cases (
  case_order integer PRIMARY KEY,
  case_name text NOT NULL,
  role_name text NOT NULL,
  user_id uuid,
  claims_extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  expected_labels text[] NOT NULL DEFAULT ARRAY[]::text[],
  expected_sqlstate text,
  expected_admin boolean,
  add_anon_select boolean NOT NULL DEFAULT false
) ON COMMIT DROP;
CREATE TEMP TABLE rls_results (
  case_order integer PRIMARY KEY,
  case_name text,
  before_count integer,
  after_count integer,
  sqlstate text,
  identical boolean,
  expected_access boolean,
  helper_matches boolean
) ON COMMIT DROP;

DO $setup$
DECLARE
  first_member public.members%ROWTYPE;
  second_member public.members%ROWTYPE;
  admin_user uuid;
  admin_member uuid;
  unknown_user uuid;
  all_labels text[];
  role_to_check text;
  privilege_to_check text;
BEGIN
  SELECT m.* INTO first_member FROM public.members AS m
    WHERE m.auth_user_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.admin_profiles a WHERE a.user_id=m.auth_user_id)
    ORDER BY m.id LIMIT 1;
  SELECT m.* INTO second_member FROM public.members AS m
    WHERE m.auth_user_id IS NOT NULL AND m.id IS DISTINCT FROM first_member.id
    AND NOT EXISTS (SELECT 1 FROM public.admin_profiles a WHERE a.user_id=m.auth_user_id)
    ORDER BY m.id LIMIT 1;
  SELECT a.user_id INTO admin_user FROM public.admin_profiles a ORDER BY a.user_id LIMIT 1;
  SELECT m.id INTO admin_member FROM public.members m WHERE m.auth_user_id=admin_user LIMIT 1;
  IF first_member.id IS NULL OR second_member.id IS NULL OR admin_user IS NULL THEN
    RAISE EXCEPTION 'Fixture prerequisites unmet: need two non-admin members and one admin';
  END IF;
  LOOP
    unknown_user := gen_random_uuid();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.members WHERE auth_user_id=unknown_user)
      AND NOT EXISTS (SELECT 1 FROM public.admin_profiles WHERE user_id=unknown_user);
  END LOOP;

  INSERT INTO pg_temp.rls_before VALUES
    ('member_a_first',first_member.id),
    ('member_a_second',first_member.id),
    ('member_b',second_member.id);
  IF admin_member IS NOT NULL THEN
    INSERT INTO pg_temp.rls_before VALUES ('admin_owned',admin_member);
  END IF;
  INSERT INTO pg_temp.rls_after SELECT * FROM pg_temp.rls_before;
  SELECT array_agg(fixture_label ORDER BY fixture_label) INTO all_labels FROM pg_temp.rls_before;

  -- Match the real target table's SELECT and DML grants on both temp targets.
  FOREACH role_to_check IN ARRAY ARRAY['authenticated','anon','service_role'] LOOP
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I',
      (SELECT nspname FROM pg_namespace WHERE oid=pg_my_temp_schema()),role_to_check);
    FOREACH privilege_to_check IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
      IF has_table_privilege(role_to_check,'public.matrix_custom_status_configs',privilege_to_check) THEN
        EXECUTE format('GRANT %s ON pg_temp.rls_before, pg_temp.rls_after TO %I',privilege_to_check,role_to_check);
      END IF;
    END LOOP;
  END LOOP;

  INSERT INTO pg_temp.rls_cases
    (case_order,case_name,role_name,user_id,expected_labels,expected_admin)
  VALUES
    (1,'member A: own two rows only','authenticated',first_member.auth_user_id,ARRAY['member_a_first','member_a_second'],false),
    (2,'member B: own row only','authenticated',second_member.auth_user_id,ARRAY['member_b'],false),
    (3,'admin: all rows including other members','authenticated',admin_user,all_labels,true),
    (4,'authenticated with no matching member or admin','authenticated',unknown_user,ARRAY[]::text[],false),
    (5,'authenticated with missing subject','authenticated',NULL,ARRAY[]::text[],false),
    (8,'service role preserves RLS bypass','service_role',NULL,all_labels,NULL);
  INSERT INTO pg_temp.rls_cases
    (case_order,case_name,role_name,user_id,expected_sqlstate)
  VALUES
    (6,'anon: target SELECT privilege denied','anon',NULL,'42501'),
    (7,'anon with admin subject: target SELECT privilege denied','anon',admin_user,'42501');
  INSERT INTO pg_temp.rls_cases
    (case_order,case_name,role_name,user_id,claims_extra,expected_labels,expected_admin)
  VALUES
    (9,'authenticated anonymous claim retains ownership rule','authenticated',first_member.auth_user_id,'{"is_anonymous":true}',ARRAY['member_a_first','member_a_second'],false),
    (10,'user metadata cannot confer admin access','authenticated',unknown_user,'{"user_metadata":{"role":"admin","is_admin":true}}',ARRAY[]::text[],false);
  INSERT INTO pg_temp.rls_cases
    (case_order,case_name,role_name,user_id,add_anon_select)
  VALUES
    (11,'anon with temp SELECT grant: role policy excludes rows','anon',NULL,true),
    (12,'anon with temp SELECT grant and admin subject: excluded','anon',admin_user,true);
END;
$setup$;

DO $run$
DECLARE
  testcase record;
  before_labels text[];
  after_labels text[];
  before_error text;
  after_error text;
  helper_value boolean;
  claims jsonb;
BEGIN
  FOR testcase IN SELECT * FROM pg_temp.rls_cases ORDER BY case_order LOOP
    before_labels := ARRAY[]::text[];
    after_labels := ARRAY[]::text[];
    before_error := NULL;
    after_error := NULL;
    helper_value := NULL;
    IF testcase.add_anon_select THEN
      GRANT SELECT ON pg_temp.rls_before, pg_temp.rls_after TO anon;
    END IF;
    claims := jsonb_build_object('role',testcase.role_name) || testcase.claims_extra;
    IF testcase.user_id IS NOT NULL THEN
      claims := claims || jsonb_build_object('sub',testcase.user_id::text);
    END IF;
    PERFORM set_config('request.jwt.claim.sub',COALESCE(testcase.user_id::text,''),true);
    PERFORM set_config('request.jwt.claim.role',testcase.role_name,true);
    PERFORM set_config('request.jwt.claims',claims::text,true);
    EXECUTE format('SET LOCAL ROLE %I',testcase.role_name);
    BEGIN
      EXECUTE 'SELECT COALESCE(array_agg(fixture_label ORDER BY fixture_label), ARRAY[]::text[]) FROM pg_temp.rls_before'
        INTO before_labels;
    EXCEPTION WHEN OTHERS THEN before_error := SQLSTATE;
    END;
    BEGIN
      EXECUTE 'SELECT COALESCE(array_agg(fixture_label ORDER BY fixture_label), ARRAY[]::text[]) FROM pg_temp.rls_after'
        INTO after_labels;
    EXCEPTION WHEN OTHERS THEN after_error := SQLSTATE;
    END;
    IF testcase.expected_admin IS NOT NULL THEN
      EXECUTE 'SELECT public.is_admin()' INTO helper_value;
    END IF;
    RESET ROLE;
    INSERT INTO pg_temp.rls_results VALUES (
      testcase.case_order,testcase.case_name,
      CASE WHEN before_error IS NULL THEN cardinality(before_labels) ELSE NULL END,
      CASE WHEN after_error IS NULL THEN cardinality(after_labels) ELSE NULL END,
      before_error,
      (before_error IS NOT DISTINCT FROM after_error) AND (before_labels IS NOT DISTINCT FROM after_labels),
      (before_error IS NOT DISTINCT FROM testcase.expected_sqlstate)
        AND (after_error IS NOT DISTINCT FROM testcase.expected_sqlstate)
        AND (testcase.expected_sqlstate IS NOT NULL OR
          (before_labels=testcase.expected_labels AND after_labels=testcase.expected_labels)),
      testcase.expected_admin IS NULL OR helper_value IS NOT DISTINCT FROM testcase.expected_admin
    );
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_temp.rls_results
    WHERE NOT identical OR NOT expected_access OR NOT helper_matches) THEN
    RAISE EXCEPTION 'RLS policy comparison failed; transaction must be rolled back';
  END IF;
END;
$run$;

SELECT case_name,before_count,after_count,sqlstate,identical,expected_access,helper_matches
FROM pg_temp.rls_results ORDER BY case_order;
ROLLBACK;
