/*
# Revoke anon execute on SECURITY DEFINER functions

## Summary
Revokes EXECUTE privilege from the `anon` role on all SECURITY DEFINER
helper functions. This app requires authentication — all RLS policies
are scoped to `TO authenticated` — so anon access to these functions
is unnecessary and flagged by the security advisor.

## Changes
- REVOKE EXECUTE on the following functions FROM anon:
  - is_business_member(uuid)
  - user_role_in_business(uuid)
  - is_owner_or_admin(uuid)
  - get_next_document_number(uuid, text)
- GRANT EXECUTE on the same functions TO authenticated (ensures signed-in
  users can still call them via RPC or from RLS policies).

## Notes
No data changes. The functions are only callable by authenticated users,
matching the app's auth requirement.
*/

REVOKE EXECUTE ON FUNCTION public.is_business_member(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_role_in_business(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_owner_or_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_next_document_number(uuid, text) FROM anon;

GRANT EXECUTE ON FUNCTION public.is_business_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_role_in_business(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_owner_or_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_document_number(uuid, text) TO authenticated;
