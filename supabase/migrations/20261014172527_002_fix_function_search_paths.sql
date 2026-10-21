/*
# Fix mutable search_path on helper functions

## Summary
Sets `search_path = public` on all SECURITY DEFINER functions to clear the
"Function Search Path Mutable" security advisor warnings. This prevents
schema-injection attacks where a malicious actor could shadow a function
by creating an object earlier in the search path.

## Changes
- ALTER FUNCTION ... SET search_path = public on:
  - is_business_member
  - user_role_in_business
  - is_owner_or_admin
  - get_next_document_number

## Notes
No data changes. Functions remain SECURITY DEFINER with the same logic.
Only the search_path is locked down to the public schema.
*/

ALTER FUNCTION public.is_business_member(uuid) SET search_path = public;
ALTER FUNCTION public.user_role_in_business(uuid) SET search_path = public;
ALTER FUNCTION public.is_owner_or_admin(uuid) SET search_path = public;
ALTER FUNCTION public.get_next_document_number(uuid, text) SET search_path = public;
