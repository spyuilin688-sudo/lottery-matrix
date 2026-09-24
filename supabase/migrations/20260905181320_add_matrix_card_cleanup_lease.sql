-- Keep Storage deletion fenced by the active publication lease and manifest.
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION public.renew_matrix_card_cleanup_lease(
  p_lottery text, p_token uuid, p_period text, p_digest text
) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  instant timestamptz := clock_timestamp();
BEGIN
  IF p_token IS NULL
    OR p_period IS NULL OR p_period !~ '^[0-9]{1,20}$'
    OR p_digest IS NULL OR p_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'CARD_CLEANUP_LEASE_INVALID';
  END IF;
  UPDATE public.matrix_card_publications
    SET lease_until = instant + interval '10 minutes'
    WHERE lottery = p_lottery
      AND lease_token = p_token AND lease_until > instant
      AND manifest->>'period' = p_period
      AND manifest->>'generation' = p_digest;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.renew_matrix_card_cleanup_lease(text, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.renew_matrix_card_cleanup_lease(text, uuid, text, text)
  TO service_role;
COMMENT ON FUNCTION public.renew_matrix_card_cleanup_lease(text, uuid, text, text) IS
  'Renews the active lease only while cleanup targets the currently published card generation.';
