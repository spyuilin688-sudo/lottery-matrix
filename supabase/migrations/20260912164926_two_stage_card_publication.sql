-- A current sorted card is available immediately; actual order requires formal data.
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.observe_matrix_card_snapshot(
  p_lottery text, p_token uuid, p_digest text, p_period text
) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF p_digest IS NULL OR p_digest !~ '^[0-9a-f]{64}$'
    OR p_period IS NULL OR p_period !~ '^[0-9]{1,20}$' THEN
    RAISE EXCEPTION 'CARD_SNAPSHOT_INVALID';
  END IF;
  UPDATE public.matrix_card_publications
    SET desired_digest = p_digest, desired_period = p_period,
        eligible_at = clock_timestamp()
    WHERE lottery = p_lottery AND lease_token = p_token
      AND lease_until > clock_timestamp() AND desired_digest IS DISTINCT FROM p_digest;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.observe_matrix_card_snapshot(text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.observe_matrix_card_snapshot(text, uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.publish_matrix_card(
  p_lottery text, p_token uuid, p_digest text, p_manifest jsonb
) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  card_code text := CASE p_lottery WHEN '今彩539' THEN '539' WHEN '天天樂' THEN 'fantasy5'
    WHEN '六合彩' THEN 'marksix' WHEN '大樂透' THEN 'lotto649' END;
  path_suffix text;
  card_order text;
  card jsonb;
  card_url text;
  generation_url text;
  shared_generation_url text;
  latest public.lottery_draws;
  ball_count integer := CASE WHEN p_lottery IN ('今彩539', '天天樂') THEN 5 ELSE 7 END;
BEGIN
  IF card_code IS NULL OR p_digest IS NULL OR p_digest !~ '^[0-9a-f]{64}$'
    OR jsonb_typeof(p_manifest) IS DISTINCT FROM 'object'
    OR p_manifest->'lottery' IS DISTINCT FROM to_jsonb(p_lottery)
    OR p_manifest->'generation' IS DISTINCT FROM to_jsonb(p_digest)
    OR jsonb_typeof(p_manifest->'period') IS DISTINCT FROM 'string'
    OR coalesce(p_manifest->>'period', '') !~ '^[0-9]{1,20}$'
    OR jsonb_typeof(p_manifest->'cards') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'CARD_MANIFEST_INVALID';
  END IF;
  IF NOT (p_manifest->'cards' ? 'sorted') THEN
    RAISE EXCEPTION 'CARD_MANIFEST_INVALID';
  END IF;

  path_suffix := '/storage/v1/object/public/matrix-card-png/' || card_code || '/'
    || (p_manifest->>'period') || '/' || p_digest || '/';
  FOR card_order, card IN SELECT key, value FROM jsonb_each(p_manifest->'cards') LOOP
    card_url := card->>'url';
    IF card_order NOT IN ('draw', 'sorted')
      OR jsonb_typeof(card) IS DISTINCT FROM 'object'
      OR card->>'mimeType' IS DISTINCT FROM 'image/png'
      OR card->'width' IS DISTINCT FROM '2276'::jsonb
      OR card->'height' IS DISTINCT FROM '3438'::jsonb
      OR jsonb_typeof(card->'sha256') IS DISTINCT FROM 'string'
      OR coalesce(card->>'sha256', '') !~ '^[0-9a-f]{64}$'
      OR nullif(card_url, '') IS NULL
      OR card_url !~ '^https://[^/?#[:space:]]+/storage/v1/object/public/matrix-card-png/'
      OR right(card_url, length(path_suffix) + length(card_order) + 4)
        IS DISTINCT FROM path_suffix || card_order || '.png' THEN
      RAISE EXCEPTION 'CARD_MANIFEST_INVALID';
    END IF;
    generation_url := left(card_url, length(card_url) - length(card_order) - 4);
    IF shared_generation_url IS NOT NULL AND generation_url <> shared_generation_url THEN
      RAISE EXCEPTION 'CARD_MANIFEST_INVALID';
    END IF;
    shared_generation_url := generation_url;
  END LOOP;

  SELECT * INTO latest FROM public.lottery_draws WHERE lottery = p_lottery
    ORDER BY draw_date DESC NULLS LAST, period DESC LIMIT 1;
  IF NOT FOUND OR latest.period IS DISTINCT FROM p_manifest->>'period' THEN
    RETURN false;
  END IF;
  IF p_manifest->'cards' ? 'draw' THEN
    IF p_lottery = '天天樂' OR latest.result_status IS DISTINCT FROM 'confirmed'
      OR jsonb_typeof(latest.draw_order_numbers) IS DISTINCT FROM 'array' THEN
      RETURN false;
    END IF;
    IF jsonb_array_length(latest.draw_order_numbers) <> ball_count THEN
      RETURN false;
    END IF;
  END IF;

  -- Python verifies the entire rendered window. The source-change trigger in
  -- 20260913000000 invalidates this lease/digest if any row changes meanwhile.
  UPDATE public.matrix_card_publications
    SET manifest = p_manifest, published_at = clock_timestamp(), last_error = NULL
    WHERE lottery = p_lottery AND lease_token = p_token
      AND lease_until > clock_timestamp() AND eligible_at <= clock_timestamp()
      AND desired_digest = p_digest AND desired_period = p_manifest->>'period';
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.publish_matrix_card(text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_matrix_card(text, uuid, text, jsonb) TO service_role;

COMMENT ON TABLE public.matrix_card_publications IS
  'Service-only lease and current immutable sorted/confirmed-actual PNG manifest; independent of analysis retention.';
