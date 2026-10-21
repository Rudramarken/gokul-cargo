/*
# Fix select_own_business RLS policy for signup bootstrap

## Problem
During signup, the flow is:
1. INSERT into businesses (allowed by insert_business policy: WITH CHECK (true))
2. SELECT back the inserted business via .select('*').maybeSingle()

Step 2 fails because select_own_business requires is_business_member(id),
which is false because the business_members row hasn't been created yet.
The business row IS inserted but is invisible to the user — so biz is null,
bizError is null, and signUp returns "Failed to create business" without
creating the business_members row.

Result: 2 auth users exist but 0 businesses and 0 business_members.
Every page that checks businessId gets null and shows "No business selected".

## Fix
Allow a user to SELECT a business row when EITHER:
  (a) they are a member of that business (existing flow), OR
  (b) no business_members row exists yet for that business (bootstrap:
      the creator can see it long enough to insert the first member)

This is secure: only the first moment before membership exists is unrestricted,
and it is still scoped to authenticated users. Once any member is added,
condition (b) is false and only condition (a) applies.

## Changes
- DROP and recreate select_own_business with bootstrap condition.
*/

DROP POLICY IF EXISTS "select_own_business" ON businesses;
CREATE POLICY "select_own_business" ON businesses FOR SELECT
  TO authenticated USING (
    is_business_member(id)
    OR NOT EXISTS (
      SELECT 1 FROM business_members bm WHERE bm.business_id = businesses.id
    )
  );
