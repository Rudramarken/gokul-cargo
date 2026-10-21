/*
# Fix RLS bootstrap: allow first business_members + business_settings insert

## Problem
The sign-up flow creates a `businesses` row, then tries to insert a
`business_members` row for the new user. However, the INSERT policy on
`business_members` is:

    WITH CHECK (is_owner_or_admin(business_id))

This checks if the user is ALREADY an owner/admin of that business — but
during sign-up, they have no row yet, so the check returns false and the
insert is silently rejected by RLS.

The same problem affects `business_settings` INSERT:

    WITH CHECK (is_business_member(business_id))

The user isn't a member yet, so the insert fails.

Result: the user authenticates successfully but has no business_members
row. loadBusinessData() finds nothing, businessId stays null, and every
page shows a permanent loading spinner because `if (!businessId) return`
exits without clearing the loading state.

## Fix
Allow a business_members INSERT when either:
  (a) the user is already an owner/admin (existing flow for adding members), OR
  (b) no business_members row exists yet for that business (first-member bootstrap).

Allow a business_settings INSERT when either:
  (a) the user is a business member (existing flow), OR
  (b) no business_settings row exists yet for that business (first-settings bootstrap).

This is secure: only the first insert is unrestricted, and it is still
scoped to authenticated users. Subsequent inserts require ownership/admin
or membership as before.

## Changes
- DROP and recreate `insert_business_member` policy with the bootstrap condition.
- DROP and recreate `insert_business_settings` policy with the bootstrap condition.
*/

-- business_members: allow first member (bootstrap) OR existing owner/admin
DROP POLICY IF EXISTS "insert_business_member" ON business_members;
CREATE POLICY "insert_business_member" ON business_members FOR INSERT
  TO authenticated WITH CHECK (
    is_owner_or_admin(business_id)
    OR NOT EXISTS (
      SELECT 1 FROM business_members bm WHERE bm.business_id = business_members.business_id
    )
  );

-- business_settings: allow first settings row (bootstrap) OR existing member
DROP POLICY IF EXISTS "insert_business_settings" ON business_settings;
CREATE POLICY "insert_business_settings" ON business_settings FOR INSERT
  TO authenticated WITH CHECK (
    is_business_member(business_id)
    OR NOT EXISTS (
      SELECT 1 FROM business_settings bs WHERE bs.business_id = business_settings.business_id
    )
  );
