/*
# Fix Ledger Transaction Types and Reload Schema Cache

## Purpose
The `ledger_entries.transaction_type` CHECK constraint is missing three values
that the application code uses: `driver_advance`, `driver_salary`, and
`commission_income`. This causes insert failures when the app tries to create
these ledger entry types. This migration adds those values to the CHECK
constraint and reloads the PostgREST schema cache so the `consignee_party_id`
and other recently-added columns on `lr_bilties` are visible to the API.

## Modified Tables
- `ledger_entries` — CHECK constraint on `transaction_type` extended to include
  `driver_advance`, `driver_salary`, `commission_income`

## Security
- No RLS changes. No new tables or columns.

## Notes
1. The CHECK constraint is dropped and recreated to add the new values.
2. Existing rows are unaffected — the new values are additive.
3. `NOTIFY pgrst, 'reload schema'` forces PostgREST to refresh its schema
   cache so all columns added by prior migrations (consignee_party_id on
   lr_bilties, account_id on payments/trip_advances/etc.) are immediately
   visible to the API.
*/

-- ─── Extend ledger_entries.transaction_type CHECK ──────────────────
ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_transaction_type_check;

ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_transaction_type_check
  CHECK (transaction_type = ANY (ARRAY[
    'opening_balance'::text,
    'customer_bill'::text,
    'customer_receipt'::text,
    'supplier_payment'::text,
    'truck_owner_cost'::text,
    'truck_owner_payment'::text,
    'expense'::text,
    'adjustment'::text,
    'reversal'::text,
    'driver_advance'::text,
    'driver_salary'::text,
    'commission_income'::text
  ]));

-- ─── Reload PostgREST schema cache ──────────────────────────────────
NOTIFY pgrst, 'reload schema';
