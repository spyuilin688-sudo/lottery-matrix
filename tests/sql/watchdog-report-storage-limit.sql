-- Run against a database with migrations applied; all fixtures are temporary.
BEGIN;
CREATE TEMPORARY TABLE watchdog_capacity_probe (LIKE private.admin_watchdog_status INCLUDING CONSTRAINTS) ON COMMIT DROP;
DO $test$
DECLARE payload jsonb; padding integer;
BEGIN
 INSERT INTO watchdog_capacity_probe VALUES (true,jsonb_build_object('status','ok','testPayload',repeat('x',20000)),now());
 payload := jsonb_build_object('status','ok','testPayload','');
 padding := 262144-octet_length(payload::text);
 payload := jsonb_build_object('status','ok','testPayload',repeat('x',padding));
 IF octet_length(payload::text) <> 262144 THEN RAISE EXCEPTION 'BAD_BOUNDARY_FIXTURE'; END IF;
 INSERT INTO watchdog_capacity_probe VALUES (true,payload,now());
 BEGIN
  INSERT INTO watchdog_capacity_probe VALUES (true,jsonb_build_object('status','ok','testPayload',repeat('x',padding+1)),now());
  RAISE EXCEPTION 'OVERSIZE_ACCEPTED';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
  INSERT INTO watchdog_capacity_probe VALUES (true,'[]'::jsonb,now());
  RAISE EXCEPTION 'NON_OBJECT_ACCEPTED';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $test$;
SELECT 'PASS: 20KB and exact 256KiB accepted; oversized and non-object rejected' AS result;
ROLLBACK;
