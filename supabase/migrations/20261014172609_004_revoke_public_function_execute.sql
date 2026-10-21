/*
# Revoke public execute on SECURITY DEFINER functions

## Summary
PostgreSQL grants EXECUTE on functions to the `public` role by default,
which includes `anon`. The previous migration revoked from `anon` directly,
but the grant to `public` still allows anon to call these functions.
This migration revokes EXECUTE from `public` and grants only to
`authenticated`.

## Changes
- REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC on all 4 helper functions
- GRANT EXECUTE TO authenticated (preserves access for signed-in users)

## Notes
No data changes. Functions are now only callable by authenticated users.
*/

REVOKE EXECUTE ON FUNCTION public.is_business_member(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_role_in_business(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_owner_or_admin(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_next_document_number(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_business_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_role_in_business(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_owner_or_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_document_number(uuid, text) TO authenticated;
