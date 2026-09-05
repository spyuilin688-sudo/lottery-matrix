-- Requires the static card publication migration to be installed.
-- Rollback-only verification. Run as project owner in one connection.
-- No blobs are uploaded; every SQL change is rolled back.
BEGIN;
SET LOCAL statement_timeout = '30s';
-- Run after the proposed DDL in the same BEGIN/ROLLBACK transaction.
CREATE TEMP TABLE card_test_results (name text, passed boolean, detail jsonb) ON COMMIT DROP;
GRANT INSERT, SELECT ON pg_temp.card_test_results TO service_role;

INSERT INTO pg_temp.card_test_results
SELECT 'publication table and RPC privileges are service-only',
  (SELECT relrowsecurity FROM pg_class WHERE oid='public.matrix_card_publications'::regclass)
  AND NOT EXISTS (
    SELECT 1 FROM pg_roles r CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE')) p(priv)
    WHERE r.rolname IN ('anon','authenticated')
    AND has_table_privilege(r.rolname,'public.matrix_card_publications',p.priv)
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_roles r CROSS JOIN (VALUES
      ('public.claim_matrix_card_publication(text,uuid)'),
      ('public.observe_matrix_card_snapshot(text,uuid,text,text)'),
      ('public.publish_matrix_card(text,uuid,text,jsonb)'),
      ('public.renew_matrix_card_cleanup_lease(text,uuid,text,text)')) p(signature)
    WHERE r.rolname IN ('anon','authenticated') AND has_function_privilege(r.rolname,p.signature,'EXECUTE')
  )
  AND has_function_privilege('service_role','public.claim_matrix_card_publication(text,uuid)','EXECUTE')
  AND has_function_privilege('service_role','public.observe_matrix_card_snapshot(text,uuid,text,text)','EXECUTE')
  AND has_function_privilege('service_role','public.publish_matrix_card(text,uuid,text,jsonb)','EXECUTE')
  AND has_function_privilege('service_role','public.renew_matrix_card_cleanup_lease(text,uuid,text,text)','EXECUTE'), '{}'::jsonb;

DO $tests$
DECLARE
  first_token uuid := gen_random_uuid();
  second_token uuid := gen_random_uuid();
  never_owned_token uuid := gen_random_uuid();
  digest_a text := repeat('a',64);
  digest_b text := repeat('b',64);
  fixture_manifest jsonb;
  mismatched_manifest jsonb;
  claim_result jsonb;
  passed boolean;
  changed integer;
  denied text;
  result_items jsonb := '[]'::jsonb;
  candidate_role text;
  original_eligibility timestamptz;
  observed_before timestamptz;
  malformed record;
  storage_fixture_name text := 'rollback-fixture-'||gen_random_uuid()::text||'.png';
BEGIN
  fixture_manifest := jsonb_build_object(
    'lottery','今彩539','period','10000','generation',digest_a,
    'cards',jsonb_build_object(
      'draw',jsonb_build_object('mimeType','image/png','width',2276,'height',3438,'sha256',repeat('1',64),'url',
        'https://example.supabase.co/storage/v1/object/public/matrix-card-png/539/10000/'||digest_a||'/draw.png'),
      'sorted',jsonb_build_object('mimeType','image/png','width',2276,'height',3438,'sha256',repeat('2',64),'url',
        'https://example.supabase.co/storage/v1/object/public/matrix-card-png/539/10000/'||digest_a||'/sorted.png')
    )
  );
  SET LOCAL ROLE service_role;
  -- Existing committed state, if any, is restored by the final ROLLBACK.
  INSERT INTO public.matrix_card_publications(lottery) VALUES ('今彩539')
    ON CONFLICT(lottery) DO UPDATE SET desired_digest=NULL,desired_period=NULL,
      eligible_at=NULL,manifest=NULL,published_at=NULL,lease_token=NULL,lease_until=NULL,last_error=NULL;
  claim_result := public.claim_matrix_card_publication('今彩539',first_token);
  INSERT INTO pg_temp.card_test_results VALUES ('first lease claimed',
    claim_result->>'lease_token'=first_token::text AND (claim_result->>'lease_until')::timestamptz>clock_timestamp(),'{}');
  INSERT INTO pg_temp.card_test_results VALUES ('active lease cannot be replaced',
    public.claim_matrix_card_publication('今彩539',second_token) IS NULL,'{}');
  INSERT INTO pg_temp.card_test_results VALUES ('uninitialized eligibility cannot publish',
    NOT public.publish_matrix_card('今彩539',first_token,digest_a,fixture_manifest),'{}');
  observed_before := clock_timestamp();
  INSERT INTO pg_temp.card_test_results VALUES ('current lease observes snapshot',
    public.observe_matrix_card_snapshot('今彩539',first_token,digest_a,'10000'),'{}');
  SELECT eligible_at INTO original_eligibility FROM public.matrix_card_publications WHERE lottery='今彩539';
  INSERT INTO pg_temp.card_test_results VALUES ('eligibility uses database time plus ten minutes',
    original_eligibility >= observed_before + interval '10 minutes'
    AND original_eligibility <= clock_timestamp() + interval '10 minutes','{}');
  INSERT INTO pg_temp.card_test_results VALUES ('same snapshot observation does not reset wait',
    NOT public.observe_matrix_card_snapshot('今彩539',first_token,digest_a,'10000')
    AND (SELECT eligible_at=original_eligibility FROM public.matrix_card_publications WHERE lottery='今彩539'),'{}');
  INSERT INTO pg_temp.card_test_results VALUES ('future eligible_at cannot publish',
    NOT public.publish_matrix_card('今彩539',first_token,digest_a,fixture_manifest),'{}');
  UPDATE public.matrix_card_publications SET eligible_at=clock_timestamp()-interval '1 second'
    WHERE lottery='今彩539' AND lease_token=first_token;
  INSERT INTO pg_temp.card_test_results VALUES ('unknown lease token cannot publish',
    NOT public.publish_matrix_card('今彩539',never_owned_token,digest_a,fixture_manifest),'{}');
  INSERT INTO pg_temp.card_test_results VALUES ('wrong desired period cannot publish',
    NOT public.publish_matrix_card('今彩539',first_token,digest_a,
      replace(fixture_manifest::text,'10000','10001')::jsonb),'{}');
  INSERT INTO pg_temp.card_test_results VALUES ('wrong desired digest cannot publish',
    NOT public.publish_matrix_card('今彩539',first_token,digest_b,
      replace(fixture_manifest::text,digest_a,digest_b)::jsonb),'{}');
  denied := NULL;
  BEGIN
    PERFORM public.publish_matrix_card('今彩539',first_token,digest_a,fixture_manifest #- '{cards,sorted}');
  EXCEPTION WHEN OTHERS THEN denied := SQLERRM;
  END;
  INSERT INTO pg_temp.card_test_results VALUES ('missing sorted PNG is rejected',denied='CARD_MANIFEST_INVALID','{}');

  UPDATE public.matrix_card_publications SET lease_until=clock_timestamp()-interval '1 second'
    WHERE lottery='今彩539';
  INSERT INTO pg_temp.card_test_results VALUES ('expired token cannot publish',
    NOT public.publish_matrix_card('今彩539',first_token,digest_a,fixture_manifest),'{}');
  INSERT INTO pg_temp.card_test_results VALUES ('expired token cannot observe new state',
    NOT public.observe_matrix_card_snapshot('今彩539',first_token,digest_b,'10001'),'{}');

  claim_result := public.claim_matrix_card_publication('今彩539',second_token);
  INSERT INTO pg_temp.card_test_results VALUES ('expired lease can be reclaimed',
    claim_result->>'lease_token'=second_token::text,'{}');
  INSERT INTO pg_temp.card_test_results VALUES ('replaced token cannot publish',
    NOT public.publish_matrix_card('今彩539',first_token,digest_a,fixture_manifest),'{}');
  INSERT INTO pg_temp.card_test_results VALUES ('replaced token cannot change desired state',
    NOT public.observe_matrix_card_snapshot('今彩539',first_token,digest_b,'10001'),'{}');
  UPDATE public.matrix_card_publications SET lease_token=NULL,lease_until=NULL
    WHERE lottery='今彩539' AND lease_token=first_token;
  GET DIAGNOSTICS changed = ROW_COUNT;
  INSERT INTO pg_temp.card_test_results VALUES ('replaced token cannot release new owner',changed=0,'{}');
  INSERT INTO pg_temp.card_test_results VALUES ('eligible current owner publishes complete pair',
    public.publish_matrix_card('今彩539',second_token,digest_a,fixture_manifest),'{}');
  INSERT INTO pg_temp.card_test_results VALUES ('current manifest owner can renew cleanup lease',
    public.renew_matrix_card_cleanup_lease('今彩539',second_token,'10000',digest_a),'{}');
  INSERT INTO pg_temp.card_test_results VALUES ('wrong cleanup token cannot renew lease',
    NOT public.renew_matrix_card_cleanup_lease('今彩539',never_owned_token,'10000',digest_a),'{}');
  INSERT INTO pg_temp.card_test_results VALUES ('wrong cleanup generation cannot renew lease',
    NOT public.renew_matrix_card_cleanup_lease('今彩539',second_token,'10000',digest_b),'{}');

  FOR malformed IN SELECT * FROM (VALUES
    ('mixed period and generation URLs',ARRAY['cards','sorted','url'],to_jsonb('https://example.supabase.co/storage/v1/object/public/matrix-card-png/539/10001/'||digest_b||'/sorted.png')),
    ('wrong bucket',ARRAY['cards','sorted','url'],to_jsonb('https://example.supabase.co/storage/v1/object/public/another-bucket/539/10000/'||digest_a||'/sorted.png')),
    ('wrong lottery',ARRAY['cards','sorted','url'],to_jsonb('https://example.supabase.co/storage/v1/object/public/matrix-card-png/marksix/10000/'||digest_a||'/sorted.png')),
    ('different hosts',ARRAY['cards','sorted','url'],to_jsonb('https://another.supabase.co/storage/v1/object/public/matrix-card-png/539/10000/'||digest_a||'/sorted.png')),
    ('duplicate draw URL',ARRAY['cards','sorted','url'],fixture_manifest #> '{cards,draw,url}'),
    ('wrong dimensions',ARRAY['cards','draw','width'],'100'::jsonb),
    ('missing digest',ARRAY['cards','sorted','sha256'],'null'::jsonb),
    ('wrong MIME type',ARRAY['cards','sorted','mimeType'],'"image/svg+xml"'::jsonb)
  ) AS cases(name,path,value) LOOP
    denied := NULL;
    BEGIN
      PERFORM public.publish_matrix_card('今彩539',second_token,digest_a,
        jsonb_set(fixture_manifest,malformed.path,malformed.value));
    EXCEPTION WHEN OTHERS THEN denied := SQLERRM;
    END;
    INSERT INTO pg_temp.card_test_results VALUES (malformed.name||' rejected',denied='CARD_MANIFEST_INVALID','{}');
  END LOOP;
  -- Restore fixture only, to make later tests independent of the validation finding.
  PERFORM public.publish_matrix_card('今彩539',second_token,digest_a,fixture_manifest);
  INSERT INTO storage.objects (bucket_id,name,metadata)
    VALUES ('matrix-card-png',storage_fixture_name,'{"mimetype":"image/png"}');
  RESET ROLE;

  FOREACH candidate_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    EXECUTE format('SET LOCAL ROLE %I',candidate_role);
    denied := NULL;
    BEGIN
      PERFORM public.claim_matrix_card_publication('今彩539',never_owned_token);
    EXCEPTION WHEN OTHERS THEN denied := SQLSTATE;
    END;
    result_items := result_items || jsonb_build_array(jsonb_build_object('name',candidate_role||' cannot claim via RPC','passed',denied='42501'));
    denied := NULL;
    BEGIN
      PERFORM public.observe_matrix_card_snapshot('今彩539',second_token,digest_b,'10001');
    EXCEPTION WHEN OTHERS THEN denied := SQLSTATE;
    END;
    result_items := result_items || jsonb_build_array(jsonb_build_object('name',candidate_role||' cannot observe via RPC','passed',denied='42501'));
    denied := NULL;
    BEGIN
      PERFORM public.publish_matrix_card('今彩539',second_token,digest_a,fixture_manifest);
    EXCEPTION WHEN OTHERS THEN denied := SQLSTATE;
    END;
    result_items := result_items || jsonb_build_array(jsonb_build_object('name',candidate_role||' cannot publish via RPC','passed',denied='42501'));
    denied := NULL;
    BEGIN
      PERFORM public.renew_matrix_card_cleanup_lease('今彩539',second_token,'10000',digest_a);
    EXCEPTION WHEN OTHERS THEN denied := SQLSTATE;
    END;
    result_items := result_items || jsonb_build_array(jsonb_build_object('name',candidate_role||' cannot renew cleanup lease','passed',denied='42501'));
    denied := NULL;
    BEGIN
      INSERT INTO storage.objects(bucket_id,name) VALUES ('matrix-card-png',candidate_role||'-forbidden.png');
    EXCEPTION WHEN OTHERS THEN denied := SQLSTATE;
    END;
    result_items := result_items || jsonb_build_array(jsonb_build_object('name',candidate_role||' cannot upload storage object','passed',denied='42501'));
    UPDATE storage.objects SET name='forbidden-change.png'
      WHERE bucket_id='matrix-card-png' AND name=storage_fixture_name;
    GET DIAGNOSTICS changed = ROW_COUNT;
    result_items := result_items || jsonb_build_array(jsonb_build_object('name',candidate_role||' cannot overwrite storage object','passed',changed=0));
    denied := NULL;
    changed := 0;
    BEGIN
      DELETE FROM storage.objects WHERE bucket_id='matrix-card-png' AND name=storage_fixture_name;
      GET DIAGNOSTICS changed = ROW_COUNT;
    EXCEPTION WHEN OTHERS THEN denied := SQLSTATE;
    END;
    result_items := result_items || jsonb_build_array(jsonb_build_object('name',candidate_role||' cannot delete storage object','passed',changed=0 AND (denied IS NULL OR denied='42501')));
    RESET ROLE;
  END LOOP;
  INSERT INTO pg_temp.card_test_results
    SELECT item->>'name',(item->>'passed')::boolean,'{}'::jsonb FROM jsonb_array_elements(result_items) AS item;
END;
$tests$;

DO $assert$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_temp.card_test_results WHERE passed IS DISTINCT FROM true) THEN
    RAISE EXCEPTION 'Static card publication regression failed; transaction must be rolled back';
  END IF;
END;
$assert$;

SELECT name,passed,detail FROM pg_temp.card_test_results;
ROLLBACK;
