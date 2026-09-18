-- PNGs are public like the existing card API; publication state and writes are service-only.
SET LOCAL lock_timeout = '5s';

CREATE TABLE public.matrix_card_publications (
  lottery text PRIMARY KEY CHECK (lottery IN ('今彩539', '天天樂', '六合彩', '大樂透')),
  desired_digest text CHECK (desired_digest ~ '^[0-9a-f]{64}$'),
  desired_period text,
  eligible_at timestamptz,
  manifest jsonb,
  published_at timestamptz,
  lease_token uuid,
  lease_until timestamptz,
  last_error text,
  CHECK ((lease_token IS NULL) = (lease_until IS NULL))
);
ALTER TABLE public.matrix_card_publications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.matrix_card_publications FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.matrix_card_publications TO service_role;

CREATE FUNCTION public.claim_matrix_card_publication(p_lottery text, p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  claimed public.matrix_card_publications;
  instant timestamptz := clock_timestamp();
BEGIN
  IF p_token IS NULL THEN
    RAISE EXCEPTION 'CARD_LEASE_TOKEN_REQUIRED';
  END IF;
  INSERT INTO public.matrix_card_publications (lottery) VALUES (p_lottery)
    ON CONFLICT (lottery) DO NOTHING;
  UPDATE public.matrix_card_publications
    SET lease_token = p_token, lease_until = instant + interval '10 minutes'
    WHERE lottery = p_lottery AND (lease_until IS NULL OR lease_until <= instant)
    RETURNING * INTO claimed;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN to_jsonb(claimed) || jsonb_build_object('claimed_at', instant);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_matrix_card_publication(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_matrix_card_publication(text, uuid) TO service_role;

CREATE FUNCTION public.observe_matrix_card_snapshot(
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
        eligible_at = clock_timestamp() + interval '10 minutes'
    WHERE lottery = p_lottery AND lease_token = p_token
      AND lease_until > clock_timestamp() AND desired_digest IS DISTINCT FROM p_digest;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.observe_matrix_card_snapshot(text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.observe_matrix_card_snapshot(text, uuid, text, text) TO service_role;

CREATE FUNCTION public.publish_matrix_card(
  p_lottery text, p_token uuid, p_digest text, p_manifest jsonb
) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  card_code text := CASE p_lottery WHEN '今彩539' THEN '539' WHEN '天天樂' THEN 'fantasy5'
    WHEN '六合彩' THEN 'marksix' WHEN '大樂透' THEN 'lotto649' END;
  path_suffix text := '/storage/v1/object/public/matrix-card-png/' || card_code || '/'
    || (p_manifest->>'period') || '/' || p_digest || '/';
  draw_url text := p_manifest #>> '{cards,draw,url}';
  sorted_url text := p_manifest #>> '{cards,sorted,url}';
BEGIN
  IF p_manifest->>'lottery' IS DISTINCT FROM p_lottery
    OR p_manifest->>'generation' IS DISTINCT FROM p_digest
    OR p_manifest #>> '{cards,draw,mimeType}' IS DISTINCT FROM 'image/png'
    OR p_manifest #>> '{cards,sorted,mimeType}' IS DISTINCT FROM 'image/png'
    OR nullif(p_manifest #>> '{cards,draw,url}', '') IS NULL
    OR nullif(p_manifest #>> '{cards,sorted,url}', '') IS NULL
    OR path_suffix IS NULL
    OR draw_url !~ '^https://[^/]+/' OR sorted_url !~ '^https://[^/]+/'
    OR right(draw_url, length(path_suffix) + 8) IS DISTINCT FROM path_suffix || 'draw.png'
    OR right(sorted_url, length(path_suffix) + 10) IS DISTINCT FROM path_suffix || 'sorted.png'
    OR left(draw_url, length(draw_url) - 8) IS DISTINCT FROM left(sorted_url, length(sorted_url) - 10)
    OR p_manifest #>> '{cards,draw,width}' IS DISTINCT FROM '2276'
    OR p_manifest #>> '{cards,sorted,width}' IS DISTINCT FROM '2276'
    OR p_manifest #>> '{cards,draw,height}' IS DISTINCT FROM '3438'
    OR p_manifest #>> '{cards,sorted,height}' IS DISTINCT FROM '3438'
    OR coalesce(p_manifest #>> '{cards,draw,sha256}', '') !~ '^[0-9a-f]{64}$'
    OR coalesce(p_manifest #>> '{cards,sorted,sha256}', '') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'CARD_MANIFEST_INVALID';
  END IF;
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

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('matrix-card-png', 'matrix-card-png', true, 5242880, ARRAY['image/png']);
-- No storage.objects write policy is granted to anon/authenticated.
COMMENT ON TABLE public.matrix_card_publications IS
  'Service-only lease and last complete immutable PNG manifest; independent of analysis retention.';
