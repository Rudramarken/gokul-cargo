/*
# Refresh PostgREST schema cache and restore function execution permissions

## Problem
Migration 007 dropped and recreated get_next_document_number with the
parameter renamed from `doc_type` to `p_doc_type`. PostgREST caches
function signatures and did not pick up the new parameter name, so the
API still looks for the old signature `(b_id, doc_type)` and returns:
"Could not find the function public.get_next_document_number(b_id, doc_type)
 in the schema cache"

Additionally, DROP+CREATE reset the function's ACL to the default
(EXECUTE granted to PUBLIC), undoing the security hardening from
migrations 003 (revoke anon) and 004 (revoke public).

## Fix
1. Revoke EXECUTE from PUBLIC and anon to restore the security posture.
   Only `authenticated` and `service_role` should be able to call this
   function, matching the original intent.
2. Notify PostgREST to reload its schema cache so the new function
   signature `(b_id uuid, p_doc_type text)` is recognized by the API.

## Security
- anon role: EXECUTE revoked (was incorrectly re-granted by CREATE default)
- PUBLIC: EXECUTE revoked (was incorrectly re-granted by CREATE default)
- authenticated role: EXECUTE retained (app users call RPC as authenticated)
- service_role: EXECUTE retained (server-side operations)
- SECURITY DEFINER property preserved from migration 007.
*/

REVOKE EXECUTE ON FUNCTION get_next_document_number(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_next_document_number(uuid, text) FROM anon;

-- Ensure authenticated can still call it (the app requires sign-in)
GRANT EXECUTE ON FUNCTION get_next_document_number(uuid, text) TO authenticated;

-- Reload PostgREST schema cache so the new function signature is visible
NOTIFY pgrst, 'reload schema';
