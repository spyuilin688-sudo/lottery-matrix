-- Align storage with admin_watchdog_status_write's existing 262144-byte limit.
-- Preserve object validation, singleton identity, grants, RLS and report contents.
-- Rollback to 16384 only after verifying the stored report fits; never truncate it.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
ALTER TABLE private.admin_watchdog_status
  DROP CONSTRAINT admin_watchdog_status_status_check,
  ADD CONSTRAINT admin_watchdog_status_status_check CHECK (
    jsonb_typeof(status) = 'object'
    AND octet_length(status::text) <= 262144
  );
