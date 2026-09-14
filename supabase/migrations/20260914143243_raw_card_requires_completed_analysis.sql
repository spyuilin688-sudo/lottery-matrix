-- Gate raw publication at the database boundary, including older workers.
SET LOCAL lock_timeout = '5s';

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
  input_digest text;
  card_origin text;
  shared_origin text;
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

  FOR card_order, card IN SELECT key, value FROM jsonb_each(p_manifest->'cards') LOOP
    card_url := card->>'url';
    IF card_order NOT IN ('draw', 'sorted')
      OR jsonb_typeof(card) IS DISTINCT FROM 'object'
      OR card->>'mimeType' IS DISTINCT FROM 'image/png'
      OR card->'width' IS DISTINCT FROM '2276'::jsonb
      OR card->'height' IS DISTINCT FROM '3438'::jsonb
      OR jsonb_typeof(card->'sha256') IS DISTINCT FROM 'string'
      OR coalesce(card->>'sha256', '') !~ '^[0-9a-f]{64}$'
      OR jsonb_typeof(card->'url') IS DISTINCT FROM 'string'
      OR nullif(card_url, '') IS NULL THEN
      RAISE EXCEPTION 'CARD_MANIFEST_INVALID';
    END IF;
    IF card ? 'inputDigest' THEN
      IF jsonb_typeof(card->'inputDigest') IS DISTINCT FROM 'string'
        OR coalesce(card->>'inputDigest', '') !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'CARD_MANIFEST_INVALID';
      END IF;
      input_digest := card->>'inputDigest';
    ELSE
      -- Legacy manifests and reused legacy PNGs still use the full generation.
      input_digest := p_digest;
    END IF;
    path_suffix := '/storage/v1/object/public/matrix-card-png/' || card_code || '/'
      || (p_manifest->>'period') || '/' || input_digest || '/' || card_order || '.png';
    card_origin := substring(card_url FROM '^https://[^/?#[:space:]@]+');
    IF card_origin IS NULL OR card_url IS DISTINCT FROM card_origin || path_suffix
      OR (shared_origin IS NOT NULL AND card_origin <> shared_origin) THEN
      RAISE EXCEPTION 'CARD_MANIFEST_INVALID';
    END IF;
    shared_origin := card_origin;
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
    -- Raw cards follow the complete current raw analysis. Sorted cards remain
    -- eligible as soon as their validated draw snapshot is available.
    IF NOT EXISTS (
      SELECT 1 FROM public.matrix_analysis_runs run
      WHERE run.lottery = p_lottery AND run.draw_period = latest.period
        AND run.analysis_version = latest.period || ':matrix-python-v14-draw'
        AND run.status = 'complete' AND run.completed_at IS NOT NULL
    ) THEN
      RETURN false;
    END IF;
  END IF;

  -- Source changes invalidate the full-snapshot lease. Reusing an unchanged
  -- order's PNG does not weaken the current generation or latest-period fence.
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
