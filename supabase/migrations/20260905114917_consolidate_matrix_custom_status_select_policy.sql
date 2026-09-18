-- Preserve the existing admin/owner predicates and every index.
SET LOCAL lock_timeout = '5s';

DROP POLICY "Admins can read Matrix custom status configs"
  ON public.matrix_custom_status_configs;
DROP POLICY "Members can read own Matrix custom status configs"
  ON public.matrix_custom_status_configs;

CREATE POLICY "Admins or members can read Matrix custom status configs"
  ON public.matrix_custom_status_configs
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_admin())
    OR member_id IN (
      SELECT member.id
      FROM public.members AS member
      WHERE member.auth_user_id = (SELECT auth.uid())
    )
  );

