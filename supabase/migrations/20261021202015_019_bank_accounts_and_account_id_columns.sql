/*
# Bank Accounts Table and account_id Columns for Financial Transactions

## Purpose
Adds a `bank_accounts` table to track cash and bank accounts per business,
and adds `account_id` foreign key columns to four financial transaction tables
so every payment/receipt can be linked to a specific cash or bank account.

## New Tables
- `bank_accounts`
  - `id` (uuid, PK)
  - `business_id` (uuid, FK → businesses, NOT NULL) — tenant scope
  - `account_name` (text, NOT NULL) — e.g. "HDFC Current", "Cash Box"
  - `account_type` (text, NOT NULL, CHECK in 'cash','bank') — cash or bank
  - `bank_name` (text, nullable) — only for bank-type accounts
  - `account_number` (text, nullable) — only for bank-type accounts
  - `ifsc_code` (text, nullable) — only for bank-type accounts
  - `upi_id` (text, nullable) — only for bank-type accounts
  - `opening_balance` (numeric, NOT NULL, default 0)
  - `current_balance` (numeric, NOT NULL, default 0) — updated as transactions occur
  - `is_active` (boolean, NOT NULL, default true)
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

## Modified Tables
- `payments` — adds nullable `account_id` UUID column with FK to bank_accounts
- `trip_advances` — adds nullable `account_id` UUID column with FK to bank_accounts
- `driver_salary_records` — adds nullable `account_id` UUID column with FK to bank_accounts
- `truck_owner_settlements` — adds nullable `account_id` UUID column with FK to bank_accounts

## Security
- RLS enabled on `bank_accounts` with business-scoped CRUD policies (TO authenticated, is_business_member check)
- Existing RLS on modified tables is unaffected — new nullable column is accessible to existing policies

## Notes
1. All account_id columns are nullable so existing records are unaffected.
2. current_balance is maintained by the application layer (frontend updates it
   atomically when recording payments). A unique constraint on
   (business_id, account_number) prevents duplicate bank accounts.
3. PostgREST schema cache is reloaded at the end so the new table/columns
   are immediately visible to the API.
*/

-- ─── bank_accounts table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  account_name text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('cash', 'bank')),
  bank_name text,
  account_number text,
  ifsc_code text,
  upi_id text,
  opening_balance numeric NOT NULL DEFAULT 0,
  current_balance numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Prevent duplicate bank accounts within the same business (same account number)
CREATE UNIQUE INDEX IF NOT EXISTS bank_accounts_business_account_number_key
  ON bank_accounts (business_id, account_number)
  WHERE account_number IS NOT NULL;

-- Index for filtering by business
CREATE INDEX IF NOT EXISTS bank_accounts_business_id_idx
  ON bank_accounts (business_id);

-- ─── RLS on bank_accounts ───────────────────────────────────────────
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_bank_accounts" ON bank_accounts;
CREATE POLICY "select_bank_accounts" ON bank_accounts FOR SELECT
  TO authenticated USING (is_business_member(business_id));

DROP POLICY IF EXISTS "insert_bank_accounts" ON bank_accounts;
CREATE POLICY "insert_bank_accounts" ON bank_accounts FOR INSERT
  TO authenticated WITH CHECK (is_business_member(business_id));

DROP POLICY IF EXISTS "update_bank_accounts" ON bank_accounts;
CREATE POLICY "update_bank_accounts" ON bank_accounts FOR UPDATE
  TO authenticated USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));

DROP POLICY IF EXISTS "delete_bank_accounts" ON bank_accounts;
CREATE POLICY "delete_bank_accounts" ON bank_accounts FOR DELETE
  TO authenticated USING (is_business_member(business_id));

-- ─── Add account_id to financial transaction tables ─────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'account_id') THEN
    ALTER TABLE payments ADD COLUMN account_id uuid REFERENCES bank_accounts(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'trip_advances' AND column_name = 'account_id') THEN
    ALTER TABLE trip_advances ADD COLUMN account_id uuid REFERENCES bank_accounts(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'driver_salary_records' AND column_name = 'account_id') THEN
    ALTER TABLE driver_salary_records ADD COLUMN account_id uuid REFERENCES bank_accounts(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'truck_owner_settlements' AND column_name = 'account_id') THEN
    ALTER TABLE truck_owner_settlements ADD COLUMN account_id uuid REFERENCES bank_accounts(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── Reload PostgREST schema cache ──────────────────────────────────
NOTIFY pgrst, 'reload schema';
